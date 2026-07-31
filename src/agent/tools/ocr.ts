import fs from 'fs';
import path from 'path';
import { loadConfig } from '../../config.ts';
import { getBasePath } from './path.ts';

const SUPPORTED_FORMATS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif']);

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

function buildOcrPrompt(prompt?: string): string {
  if (prompt && prompt.trim()) {
    return prompt.trim();
  }
  return '请识别图片中的所有文字内容，并逐行输出。保持原有的格式和换行。';
}

async function callVLApi(
  imageBase64: string,
  mimeType: string,
  userPrompt: string,
): Promise<string> {
  const cfg: any = loadConfig();
  const ocrCfg = cfg.ocr || {};

  // OCR_API_KEY 回退到主 API Key（COGITO_API_KEY）
  const apiKey = ocrCfg.apiKey || cfg.api?.apiKey;
  if (!apiKey) {
    throw new Error(
      'OCR API 密钥未配置。请在 config.json 的 ocr.apiKey 中填入你的密钥，或设置环境变量 COGITO_OCR_API_KEY / OCR_API_KEY，也可设置主 API Key (COGITO_API_KEY) 作为回退',
    );
  }

  const baseURL = ocrCfg.baseURL || cfg.api.baseURL;
  const model = ocrCfg.model || 'InternVL3-78B';

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
    throw new Error(`OCR API 请求失败 (${response.status}): ${errorText}`);
  }

  const data: any = await response.json();
  if (
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content
  ) {
    return data.choices[0].message.content;
  }

  throw new Error('OCR API 返回格式错误：未找到识别结果');
}

/**
 * 识别图片中的文字内容（OCR）
 * 使用视觉大模型（如 InternVL3-78B）识别图片文字
 * @param {string} imagePath - 图片文件路径（相对工作区路径或绝对路径）
 * @param {string} [prompt] - 可选的自定义提示词，默认识别所有文字
 * @returns {Promise<Object>} 返回识别结果，包含 success/data/error
 */
async function ocr(imagePath: string, prompt?: string): Promise<any> {
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
    const ocrPrompt = buildOcrPrompt(prompt);

    const resultText = await callVLApi(base64Data, mimeType, ocrPrompt);

    return {
      success: true,
      data: `[OCR 识别结果] ${fullPath}\n\n${resultText}`,
    };
  } catch (error: any) {
    return { success: false, error: `OCR 识别失败: ${error.message}` };
  }
}

/**
 * 批量识别多张图片中的文字
 * @param {string} images - 图片路径列表，用逗号分隔（如 "img1.jpg, img2.png, img3.webp"）
 * @returns {Promise<Object>} 返回批量识别结果
 */
async function ocrBatch(images: string): Promise<any> {
  if (!images || !images.trim()) {
    return { success: false, error: '请提供图片路径列表' };
  }

  const imageList = images
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (imageList.length === 0) {
    return { success: false, error: '未提供有效的图片路径' };
  }

  const results = [];
  for (const img of imageList) {
    const result = await ocr(img);
    results.push({
      image: img,
      success: result.success,
      content: result.success ? result.data : `错误: ${result.error}`,
    });
  }

  const output = results
    .map(
      (r) => `--- ${r.image} ---
${r.content}`,
    )
    .join('\n\n');

  return {
    success: true,
    data: `[批量 OCR 识别结果] 共 ${results.length} 张图片\n\n${output}`,
  };
}

export { ocr, ocrBatch };
