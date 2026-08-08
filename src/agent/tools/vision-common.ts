import fs from 'fs';
import path from 'path';
import { loadConfig } from '../../config.ts';
import { getBasePath } from './path.ts';

const SUPPORTED_FORMATS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);

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

function encodeImageToBase64(imagePath: string): string {
  const buffer = fs.readFileSync(imagePath);
  return buffer.toString('base64');
}

function buildPrompt(prompt: string | undefined, defaultPrompt: string): string {
  if (prompt && prompt.trim()) {
    return prompt.trim();
  }
  return defaultPrompt;
}

export interface VisionToolConfig {
  section: 'ocr' | 'vision';
  defaultPrompt: string;
  resultLabel: string;
  errorPrefix: string;
  failMessage: string;
}

async function callVLApi(
  imageBase64: string,
  mimeType: string,
  userPrompt: string,
  config: VisionToolConfig,
): Promise<string> {
  const cfg: Record<string, unknown> = loadConfig() as unknown as Record<string, unknown>;
  const toolCfg = (cfg[config.section] || {}) as Record<string, unknown>;

  const apiKey =
    (toolCfg.apiKey as string) || ((cfg.api as Record<string, unknown>)?.apiKey as string);
  if (!apiKey) {
    throw new Error(
      `${config.errorPrefix} API 密钥未配置。请在配置中设定 ${config.section}.apiKey，或设置对应环境变量，也可使用主 API Key (COGITO_API_KEY) 作为回退`,
    );
  }

  const baseURL =
    (toolCfg.baseURL as string) || ((cfg.api as Record<string, unknown>)?.baseURL as string);
  const model = (toolCfg.model as string) || 'InternVL3-78B';

  const url = baseURL.endsWith('/') ? `${baseURL}chat/completions` : `${baseURL}/chat/completions`;

  const payload = {
    model: model,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userPrompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    max_tokens: 2048,
    temperature: 0.1,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    // 防止视觉 API 无响应导致工具永久挂起
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${config.errorPrefix} API 请求失败 (${response.status}): ${errorText}`);
  }

  const data: Record<string, unknown> = (await response.json()) as Record<string, unknown>;
  if (
    data.choices &&
    (data.choices as Record<string, unknown>[])[0] &&
    (data.choices as Record<string, unknown>[])[0].message &&
    ((data.choices as Record<string, unknown>[])[0].message as Record<string, unknown>).content
  ) {
    return ((data.choices as Record<string, unknown>[])[0].message as Record<string, unknown>)
      .content as string;
  }

  throw new Error(`${config.errorPrefix} API 返回格式错误：未找到识别结果`);
}

async function analyzeLocalImage(
  imagePath: string,
  prompt: string | undefined,
  config: VisionToolConfig,
): Promise<{ success: boolean; data?: string; error?: string }> {
  if (!imagePath || !imagePath.trim()) {
    return { success: false, error: '请提供图片路径' };
  }

  const basePath = getBasePath();
  const fullPath = path.isAbsolute(imagePath) ? imagePath : path.join(basePath, imagePath);

  try {
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `图片文件不存在: ${fullPath}` };
    }

    const ext = path.extname(fullPath).toLowerCase();
    if (!SUPPORTED_FORMATS.has(ext)) {
      return {
        success: false,
        error: `不支持的图片格式: ${ext}。支持格式: ${[...SUPPORTED_FORMATS].join(', ')}`,
      };
    }

    const stat = fs.statSync(fullPath);
    if (stat.size > 10 * 1024 * 1024) {
      return { success: false, error: '图片文件过大（超过10MB），请压缩后再试' };
    }

    const mimeType = getMimeType(ext);
    const base64Data = encodeImageToBase64(fullPath);
    const userPrompt = buildPrompt(prompt, config.defaultPrompt);

    const resultText = await callVLApi(base64Data, mimeType, userPrompt, config);

    return {
      success: true,
      data: `${config.resultLabel} ${fullPath}\n\n${resultText}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `${config.failMessage}: ${(error as Error).message}` };
  }
}

async function analyzeImageUrl(
  imageUrl: string,
  prompt: string | undefined,
  config: VisionToolConfig,
): Promise<{ success: boolean; data?: string; error?: string }> {
  if (!imageUrl || !imageUrl.trim()) {
    return { success: false, error: '请提供图片 URL' };
  }

  if (!imageUrl.match(/^https?:\/\//i)) {
    return { success: false, error: '请提供有效的图片 URL（以 http:// 或 https:// 开头）' };
  }

  try {
    const userPrompt = buildPrompt(prompt, config.defaultPrompt);
    const resultText = await callVLApi(imageUrl, '', userPrompt, config);

    return {
      success: true,
      data: `${config.resultLabel} ${imageUrl}\n\n${resultText}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `${config.failMessage}: ${(error as Error).message}` };
  }
}

export { analyzeLocalImage, analyzeImageUrl };
