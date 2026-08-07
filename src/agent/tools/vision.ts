/**
 * 视觉分析工具（Vision）
 * 使用视觉大模型分析图片内容
 * 基于 OpenAI 兼容 API，使用 fetch 实现，无需额外依赖
 */

import { analyzeLocalImage, analyzeImageUrl } from './vision-common.ts';
import type { VisionToolConfig } from './vision-common.ts';

const VISION_CONFIG: VisionToolConfig = {
  section: 'vision',
  defaultPrompt: '请详细描述这张图片的内容',
  resultLabel: '[视觉分析结果]',
  errorPrefix: '视觉',
  failMessage: '视觉分析失败',
};

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
  return analyzeLocalImage(imagePath, prompt, VISION_CONFIG);
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
  return analyzeImageUrl(imageUrl, prompt, VISION_CONFIG);
}

export { vision, visionFromUrl };
