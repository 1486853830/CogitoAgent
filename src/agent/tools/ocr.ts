import { analyzeLocalImage } from './vision-common.ts';
import type { VisionToolConfig } from './vision-common.ts';

const OCR_CONFIG: VisionToolConfig = {
  section: 'ocr',
  defaultPrompt: '请识别图片中的所有文字内容，并逐行输出。保持原有的格式和换行。',
  resultLabel: '[OCR 识别结果]',
  errorPrefix: 'OCR',
  failMessage: 'OCR 识别失败',
};

/**
 * 识别图片中的文字内容（OCR）
 * 使用视觉大模型（如 InternVL3-78B）识别图片文字
 * @param {string} imagePath - 图片文件路径（相对工作区路径或绝对路径）
 * @param {string} [prompt] - 可选的自定义提示词，默认识别所有文字
 * @returns {Promise<Object>} 返回识别结果，包含 success/data/error
 */
async function ocr(
  imagePath: string,
  prompt?: string,
): Promise<{ success: boolean; data?: string; error?: string }> {
  return analyzeLocalImage(imagePath, prompt, OCR_CONFIG);
}

/**
 * 批量识别多张图片中的文字
 * @param {string | string[]} images - 图片路径列表，可以是逗号分隔的字符串或字符串数组
 * @returns {Promise<Object>} 返回批量识别结果
 */
async function ocrBatch(
  images: string | string[] | Record<string, unknown>,
): Promise<{ success: boolean; data?: string; error?: string }> {
  let imageList: string[];

  // 处理 { images: [...] } 或 { images: "a,b" } 包装格式
  if (images && typeof images === 'object' && !Array.isArray(images)) {
    const inner = (images as Record<string, unknown>).images;
    if (Array.isArray(inner)) {
      imageList = inner.map((s) => String(s).trim()).filter(Boolean);
    } else if (typeof inner === 'string' && inner.trim()) {
      imageList = inner
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      return {
        success: false,
        error: '请提供图片路径列表（逗号分隔的字符串、数组或 {images: [...]} 对象）',
      };
    }
  } else if (Array.isArray(images)) {
    imageList = images.map((s) => String(s).trim()).filter(Boolean);
  } else if (typeof images === 'string' && images.trim()) {
    imageList = images
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    return {
      success: false,
      error: '请提供图片路径列表（逗号分隔的字符串、数组或 {images: [...]} 对象）',
    };
  }

  if (imageList.length === 0) {
    return { success: false, error: '未提供有效的图片路径' };
  }

  const results: { image: string; success: boolean; content: string }[] = [];
  for (const img of imageList) {
    const result = await ocr(img);
    results.push({
      image: img,
      success: result.success,
      content: result.success ? result.data! : `错误: ${result.error}`,
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
