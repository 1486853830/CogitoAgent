/**
 * 视觉分析工具（Vision）
 * 使用视觉大模型分析图片内容，支持流式响应和 reasoning_content（思考过程）
 * 基于 OpenAI 兼容 API，使用 fetch 实现，无需额外依赖
 */

import fs from 'fs';
import path from 'path';
import { loadConfig } from '../../config.ts';
import { getBasePath } from './path.ts';

const SUPPORTED_FORMATS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);

const DEFAULT_VISION_MODEL = 'InternVL3-78B';
const DEFAULT_VISION_MAX_TOKENS = 512;

function getMimeType(ext: string): string {
  const map: any = {
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

/**
 * 解析 SSE 流式响应，收集 reasoning_content 和 content
 */
async function parseStreamingResponse(
  response: any,
): Promise<{ reasoning: string; content: string }> {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullReasoning = '';
  let fullContent = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // 保留未完成的行

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const chunk = JSON.parse(data);
        if (!chunk.choices || chunk.choices.length === 0) continue;

        const delta = chunk.choices[0].delta;
        if (delta.reasoning_content) {
          fullReasoning += delta.reasoning_content;
        }
        if (delta.content) {
          fullContent += delta.content;
        }
      } catch {
        // 跳过解析失败的行
      }
    }
  }

  return { reasoning: fullReasoning, content: fullContent };
}

/**
 * 获取视觉 API 配置
 * 优先使用 vision 专用配置，回退到主 API 配置
 */
function getVisionConfig(): { apiKey: string; baseURL: string; model: string } {
  const cfg: any = loadConfig();
  const visionCfg = cfg.vision || {};

  const apiKey = visionCfg.apiKey || cfg.api?.apiKey;
  const baseURL = visionCfg.baseURL || cfg.api?.baseURL;
  const model = visionCfg.model || DEFAULT_VISION_MODEL;

  if (!apiKey) {
    throw new Error(
      '视觉 API 密钥未配置。请在 .env 中设置 COGITO_VISION_API_KEY，或使用主 API Key (COGITO_API_KEY) 作为回退',
    );
  }
  if (!baseURL) {
    throw new Error('视觉 API 地址未配置。请在 .env 中设置 COGITO_VISION_API_BASE_URL');
  }

  return { apiKey, baseURL, model };
}

/**
 * 调用视觉 API（流式）
 */
async function callVisionAPI(
  imageUrl: string,
  mimeType: string,
  userPrompt: string,
): Promise<{ reasoning: string; content: string }> {
  const { apiKey, baseURL, model } = getVisionConfig();
  const url = baseURL.endsWith('/') ? `${baseURL}chat/completions` : `${baseURL}/chat/completions`;

  const payload = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          {
            type: 'image_url',
            image_url: { url: imageUrl },
          },
        ],
      },
    ],
    stream: true,
    max_tokens: DEFAULT_VISION_MAX_TOKENS,
    temperature: 0.7,
    top_p: 1,
    frequency_penalty: 0,
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

  const { reasoning, content } = await parseStreamingResponse(response);

  if (!content && !reasoning) {
    throw new Error('视觉 API 返回为空，请检查图片内容或模型是否支持视觉识别');
  }

  return { reasoning, content };
}

/**
 * 分析本地图片
 * 支持流式返回思考过程（reasoning）和最终分析结果
 * @param {string} imagePath - 图片文件路径（相对工作区或绝对路径）
 * @param {string} [prompt] - 可选的自定义提示词，如不提供则默认描述图片
 * @returns {Promise<Object>} 返回分析结果，包含 reasoning 思考过程和 content 分析内容
 */
async function vision(imagePath: string, prompt?: string): Promise<any> {
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
    const dataUrl = `data:${mimeType};base64,${base64Data}`;
    const userPrompt = prompt && prompt.trim() ? prompt.trim() : '请详细描述这张图片的内容';

    const { reasoning, content } = await callVisionAPI(dataUrl, mimeType, userPrompt);

    let result = `[视觉分析结果] ${imagePath}\n\n`;
    if (reasoning) {
      result += `【思考过程】\n${reasoning}\n\n`;
    }
    result += `【分析结果】\n${content}`;

    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: `视觉分析失败: ${error.message}` };
  }
}

/**
 * 分析网络图片 URL
 * @param {string} imageUrl - 图片的网络 URL 地址
 * @param {string} [prompt] - 可选的自定义提示词
 * @returns {Promise<Object>} 返回分析结果
 */
async function visionFromUrl(imageUrl: string, prompt?: string): Promise<any> {
  if (!imageUrl || !imageUrl.trim()) {
    return { success: false, error: '请提供图片 URL' };
  }

  if (!imageUrl.match(/^https?:\/\//i)) {
    return { success: false, error: '请提供有效的图片 URL（以 http:// 或 https:// 开头）' };
  }

  try {
    const userPrompt = prompt && prompt.trim() ? prompt.trim() : '请详细描述这张图片的内容';
    const { reasoning, content } = await callVisionAPI(imageUrl, '', userPrompt);

    let result = `[视觉分析结果] ${imageUrl}\n\n`;
    if (reasoning) {
      result += `【思考过程】\n${reasoning}\n\n`;
    }
    result += `【分析结果】\n${content}`;

    return { success: true, data: result };
  } catch (error: any) {
    return { success: false, error: `视觉分析失败: ${error.message}` };
  }
}

export { vision, visionFromUrl };
