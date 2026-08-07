/**
 * 启发式估算 token 数（API 未返回 usage 时兜底）
 * 中文约 1 token/1.5 字符，英文约 1 token/4 字符。
 * 集中于此一处实现，避免在 client/session 等模块重复导致统计口径分叉。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5) + Math.ceil(otherChars / 4);
}
