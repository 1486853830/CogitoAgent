/**
 * 图像生成工具（Image Generation）
 *
 * 调用 OpenAI 兼容的 images/generations 接口生成图片（默认 moark 的 qwen-image）。
 * 支持以本地图片或网络图片 URL 作为参考图（对应 qwen-image 的 images 多图参考能力），
 * 生成结果下载/解码后写入工作区 generated-images/ 目录。
 *
 * 设计对齐 vision / ocr 工具：
 * - 密钥通过配置读取（imageGen 段，回退 models.moark / api），绝不硬编码。
 * - 本地参考图走 resolveInWorkspace 校验，防止越界读取工作区外文件。
 * - fetch + AbortSignal.timeout 防止接口无响应导致工具挂起。
 * - 统一返回 { success, data?, error? }（R1.9 富错误由上层归一化）。
 */

import fs from 'fs';
import path from 'path';
import { loadConfig } from '../../config.ts';
import { resolveInWorkspace, getBasePath } from './path.ts';
import type { ToolResult } from '../../types/index.ts';

const SUPPORTED_REF_FORMATS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);
const MAX_REF_SIZE = 10 * 1024 * 1024;
const DEFAULT_MODEL = 'qwen-image-2.0-pro';
// 默认模型 qwen-image-2.0-pro 仅支持以下 5 种输出尺寸（宽*高）。
const KNOWN_SIZES_QWEN_2_0_PRO = ['2048*2048', '2368*1728', '2688*1536', '1728*2368', '2536*2688'];
const DEFAULT_SIZE = '2048*2048';
const DEFAULT_TIMEOUT_MS = 120000;

interface ImageGenConfig {
  apiKey: string;
  baseURL: string;
  model: string;
}

/** 解析图像生成配置：imageGen 段优先，回退 models.moark（示例用的 moark 接口），再回退主 api。 */
function resolveImageGenConfig(): ImageGenConfig {
  const cfg = loadConfig() as unknown as Record<string, unknown>;
  const section = (cfg.imageGen || {}) as Record<string, unknown>;
  const moark = ((cfg.models as Record<string, unknown> | undefined)?.moark || {}) as Record<
    string,
    unknown
  >;
  const api = (cfg.api || {}) as Record<string, unknown>;

  const apiKey = (section.apiKey as string) || (moark.apiKey as string) || (api.apiKey as string);
  const baseURL =
    (section.baseURL as string) || (moark.baseURL as string) || (api.baseURL as string);
  const model = (section.model as string) || DEFAULT_MODEL;

  return { apiKey, baseURL, model };
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.gif': 'image/gif',
  };
  return map[ext.toLowerCase()] || 'image/jpeg';
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

/**
 * 把一个参考图描述（本地路径或 URL）规整成接口所需的字符串：
 * - URL 原样返回；
 * - 本地路径先经工作区校验，再读文件转 base64 data URL。
 * 返回 null 表示该项不可用（调用方应跳过并提示）。
 */
function prepareReferenceImage(ref: unknown): { value: string } | { error: string } {
  if (typeof ref !== 'string' || !ref.trim()) {
    return { error: '参考图必须为非空字符串（路径或 URL）' };
  }

  const raw = ref.trim();

  if (isHttpUrl(raw)) {
    return { value: raw };
  }

  const fullPath = resolveInWorkspace(raw);
  if (!fullPath) {
    return { error: `参考图路径超出允许访问的工作区范围: ${raw}` };
  }
  if (!fs.existsSync(fullPath)) {
    return { error: `参考图文件不存在: ${fullPath}` };
  }
  const ext = path.extname(fullPath).toLowerCase();
  if (!SUPPORTED_REF_FORMATS.has(ext)) {
    return { error: `不支持的参考图格式: ${ext}` };
  }
  const stat = fs.statSync(fullPath);
  if (stat.size > MAX_REF_SIZE) {
    return { error: `参考图过大（超过 10MB）: ${fullPath}` };
  }

  const base64 = fs.readFileSync(fullPath).toString('base64');
  return { value: `data:${getMimeType(ext)};base64,${base64}` };
}

async function saveGeneratedImages(
  items: Array<Record<string, unknown>>,
): Promise<{ saved: string[]; errors: string[] }> {
  const outDir = path.join(getBasePath(), 'generated-images');
  fs.mkdirSync(outDir, { recursive: true });

  const saved: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      let buffer: Buffer;
      let ext: string;

      if (typeof item.b64_json === 'string' && item.b64_json) {
        buffer = Buffer.from(item.b64_json, 'base64');
        ext = 'png';
      } else if (typeof item.url === 'string' && item.url) {
        // 优先使用响应里的直链，避免把大段 base64 在内存里多转一道。
        const resp = await fetch(item.url);
        if (!resp.ok) {
          errors.push(`第 ${i + 1} 张结果下载失败 (${resp.status} ${resp.statusText})`);
          continue;
        }
        buffer = Buffer.from(await resp.arrayBuffer());
        const fromUrl = (item.url.split('?')[0] || '').split('.').pop() || 'jpg';
        ext = SUPPORTED_REF_FORMATS.has(`.${fromUrl.toLowerCase()}`)
          ? fromUrl.toLowerCase()
          : 'jpg';
      } else {
        errors.push(`第 ${i + 1} 张结果缺少 url 与 b64_json，无法保存`);
        continue;
      }

      const filename = `qwen-image-${Date.now()}-${i}.${ext}`;
      const full = path.join(outDir, filename);
      fs.writeFileSync(full, buffer);
      saved.push(full);
    } catch (e: unknown) {
      errors.push(`第 ${i + 1} 张结果保存失败: ${(e as Error).message}`);
    }
  }

  return { saved, errors };
}

/**
 * 文生图 / 图生图生成工具。
 * @param prompt 生成提示词（必填）
 * @param referenceImages 参考图（本地路径或 URL 数组），对应 qwen-image 的 images 多图参考
 * @param model 模型名，默认 qwen-image-2.0-pro
 * @param size 输出尺寸（宽*高）。默认模型 qwen-image-2.0-pro 仅支持 5 种：2048*2048、2368*1728、2688*1536、1728*2368、2536*2688
 * @param seed 随机种子（整数）
 * @param negativePrompt 反向提示词
 * @param watermark 是否添加水印
 * @param n 生成数量
 */
async function generateImage(
  prompt: string,
  referenceImages?: string[],
  model?: string,
  size?: string,
  seed?: number,
  negativePrompt?: string,
  watermark?: boolean,
  n?: number,
): Promise<ToolResult> {
  if (!prompt || !prompt.trim()) {
    return { success: false, error: '请提供生成提示词（prompt）' };
  }

  const { apiKey, baseURL, model: resolvedModel } = resolveImageGenConfig();
  if (!apiKey) {
    return {
      success: false,
      error:
        '图像生成 API 密钥未配置。请在配置中设定 imageGen.apiKey（或 models.moark.apiKey），也可使用主 API Key 作为回退',
    };
  }
  if (!baseURL) {
    return {
      success: false,
      error: '图像生成 API 地址 (baseURL) 未配置。请设定 imageGen.baseURL 或 models.moark.baseURL',
    };
  }

  // 规整参考图：跳过不可用项并汇总提示，但只要有 prompt 仍允许无参考图生图。
  const images: string[] = [];
  const refWarnings: string[] = [];
  const sizeWarnings: string[] = [];
  if (Array.isArray(referenceImages)) {
    for (const ref of referenceImages) {
      const prepared = prepareReferenceImage(ref);
      if ('error' in prepared) {
        refWarnings.push(prepared.error);
      } else {
        images.push(prepared.value);
      }
    }
  }

  const endpoint = `${baseURL.replace(/\/+$/, '')}/images/generations`;

  const usedModel = model && model.trim() ? model.trim() : resolvedModel;
  const sizeVal = size && size.trim() ? size.trim() : DEFAULT_SIZE;
  // 对默认模型做尺寸合法性提示：不阻断（其他模型可能支持不同尺寸集），
  // 但能在 AI 误用时给出纠正反馈，避免靠 API 报错试错。
  if (
    usedModel === DEFAULT_MODEL &&
    size &&
    size.trim() &&
    !KNOWN_SIZES_QWEN_2_0_PRO.includes(size.trim())
  ) {
    sizeWarnings.push(
      `模型 ${DEFAULT_MODEL} 仅支持 5 种尺寸：2048*2048、2368*1728、2688*1536、1728*2368、2536*2688；` +
        `当前传入 "${size.trim()}" 不在其中，API 可能拒绝，已退回默认 ${DEFAULT_SIZE}`,
    );
  }

  const payload: Record<string, unknown> = {
    model: usedModel,
    prompt: prompt.trim(),
    // 接口要求 images 字段；无参考图时传空数组（与示例一致）。
    images,
    n: typeof n === 'number' ? n : 1,
    watermark: typeof watermark === 'boolean' ? watermark : false,
    seed: typeof seed === 'number' ? Math.trunc(seed) : 0,
    size: sizeVal,
  };
  if (negativePrompt && negativePrompt.trim()) {
    payload.negative_prompt = negativePrompt.trim();
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      // 图像生成可能较慢，超时给足余量。
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        error: `图像生成 API 请求失败 (${response.status} ${response.statusText}): ${errorText.slice(0, 500)}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const items = Array.isArray(data.data) ? (data.data as Array<Record<string, unknown>>) : [];

    if (items.length === 0) {
      return { success: false, error: '图像生成 API 返回为空，未生成任何图片' };
    }

    const { saved, errors } = await saveGeneratedImages(items);

    if (saved.length === 0) {
      return {
        success: false,
        error: `图片生成成功但全部保存失败: ${errors.join('; ')}`,
      };
    }

    const lines = [
      `[图像生成] 模型 ${payload.model} 生成 ${saved.length} 张图片：`,
      ...saved.map((s) => `- ${s}`),
    ];
    if (refWarnings.length > 0) {
      lines.push(`\n部分参考图被跳过: ${refWarnings.join('; ')}`);
    }
    if (sizeWarnings.length > 0) {
      lines.push(`\n${sizeWarnings.join('; ')}`);
    }
    if (errors.length > 0) {
      lines.push(`\n部分结果保存失败: ${errors.join('; ')}`);
    }

    return { success: true, data: lines.join('\n') };
  } catch (error: unknown) {
    const msg = (error as Error).message || String(error);
    // 超时是 fetch AbortSignal 抛出的特有错误名。
    if ((error as { name?: string })?.name === 'TimeoutError') {
      return { success: false, error: `图像生成超时（>${DEFAULT_TIMEOUT_MS / 1000}s 未响应）` };
    }
    return { success: false, error: `图像生成失败: ${msg}` };
  }
}

export { generateImage };
