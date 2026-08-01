/**
 * 视觉分析工具（Vision）
 * 使用视觉大模型分析图片内容
 * 基于 OpenAI 兼容 API，使用 fetch 实现，无需额外依赖
 */

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

function buildVisionPrompt(prompt?: string): string {
  if (prompt && prompt.trim()) {
    return prompt.trim();
  }
  return '请详细描述这张图片的内容';
}

async function callVLApi(
  imageBase64: string,
  mimeType: string,
  userPrompt: string,
): Promise<string> {
  const cfg: Record<string, unknown> = loadConfig() as unknown as Record<string, unknown>;
  const visionCfg = (cfg.vision || {}) as Record<string, unknown>;

  const apiKey =
    (visionCfg.apiKey as string) || ((cfg.api as Record<string, unknown>)?.apiKey as string);
  if (!apiKey) {
    throw new Error(
      '视觉 API 密钥未配置。请在 .env 中设置 COGITO_VISION_API_KEY，或使用主 API Key (COGITO_API_KEY) 作为回退',
    );
  }

  const baseURL =
    (visionCfg.baseURL as string) || ((cfg.api as Record<string, unknown>).baseURL as string);
  const model = (visionCfg.model as string) || 'InternVL3-78B';

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
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`视觉 API 请求失败 (${response.status}): ${errorText}`);
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

  throw new Error('视觉 API 返回格式错误：未找到识别结果');
}

/**
 * 分析本地图片
 * @param {string} imagePath - 图片文件路径（相对工作区或绝对路径）
 * @param {string} [prompt] - 可选的自定义提示词，默认识别图片内容
 * @returns {Promise<Object>} 返回识别结果，包含 success/data/error
 */
async function vision(
  imagePath: string,
  prompt?: string,
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
    const visionPrompt = buildVisionPrompt(prompt);

    const resultText = await callVLApi(base64Data, mimeType, visionPrompt);

    return {
      success: true,
      data: `[视觉分析结果] ${imagePath}\n\n${resultText}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `视觉分析失败: ${(error as Error).message}` };
  }
}

/**
 * 分析网络图片 URL
 * @param {string} imageUrl - 图片的网络 URL 地址
 * @param {string} [prompt] - 可选的自定义提示词
 * @returns {Promise<Object>} 返回分析结果
 */
async function visionFromUrl(
  imageUrl: string,
  prompt?: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  if (!imageUrl || !imageUrl.trim()) {
    return { success: false, error: '请提供图片 URL' };
  }

  if (!imageUrl.match(/^https?:\/\//i)) {
    return { success: false, error: '请提供有效的图片 URL（以 http:// 或 https:// 开头）' };
  }

  try {
    const userPrompt = prompt && prompt.trim() ? prompt.trim() : '请详细描述这张图片的内容';
    const resultText = await callVLApi(imageUrl, '', userPrompt);

    return {
      success: true,
      data: `[视觉分析结果] ${imageUrl}\n\n${resultText}`,
    };
  } catch (error: unknown) {
    return { success: false, error: `视觉分析失败: ${(error as Error).message}` };
  }
}

export { vision, visionFromUrl };
