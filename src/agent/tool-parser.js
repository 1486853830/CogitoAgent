/**
 * 工具调用解析模块
 * 从 AI 回复中提取 [TOOL]name(args)[/TOOL] 调用
 * 支持多种参数格式：JSON / 引号包裹 / 简单逗号分隔
 */

/**
 * 解析单个工具调用
 */
function parseToolCall(text) {
  const fullMatch = text.match(/\[TOOL\]\s*(\w+)\s*\(([\s\S]*?)\)\s*\[\/TOOL\]/);
  if (fullMatch) {
    const tool = fullMatch[1];
    const argsStr = fullMatch[2];
    const args = parseArgs(argsStr);
    return { tool, args };
  }
  return null;
}

/**
 * 解析所有工具调用
 */
function parseAllToolCalls(text) {
  const results = [];
  const regex = /\[TOOL\]\s*(\w+)\s*\(([\s\S]*?)\)\s*\[\/TOOL\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const tool = match[1];
    const argsStr = match[2];
    const args = parseArgs(argsStr);
    results.push({ tool, args });
  }
  return results;
}

/**
 * 解析工具参数
 * 支持：
 * 1. JSON 格式：{"path": "file.txt", "content": "hello"}
 * 2. 引号包裹的参数（支持内容含逗号）
 * 3. 简单逗号分隔
 */
function parseArgs(argsStr) {
  if (!argsStr || argsStr.trim() === '') {
    return [];
  }

  const trimmed = argsStr.trim();

  // JSON 格式
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const jsonObj = JSON.parse(trimmed);
      return { isJson: true, data: jsonObj };
    } catch {
      // 解析失败，继续用其他方式
    }
  }

  // 引号包裹的参数
  if (trimmed.includes('"') || trimmed.includes("'")) {
    try {
      const args = [];
      let current = '';
      let inQuote = false;
      let quoteChar = '';

      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];

        if ((char === '"' || char === "'") && !inQuote) {
          inQuote = true;
          quoteChar = char;
          current += char;
        } else if (char === quoteChar && inQuote) {
          inQuote = false;
          quoteChar = '';
          current += char;
        } else if (char === ',' && !inQuote) {
          args.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }

      if (current.trim()) {
        args.push(current.trim());
      }

      return args.map(arg => {
        const p = arg.trim();
        if ((p.startsWith('"') && p.endsWith('"')) ||
            (p.startsWith("'") && p.endsWith("'"))) {
          return p.slice(1, -1);
        }
        return p;
      });
    } catch {
      // 智能分割失败，回退
    }
  }

  // 简单逗号分隔
  const result = [];
  const parts = trimmed.split(',');
  for (const part of parts) {
    const p = part.trim();
    if ((p.startsWith('"') && p.endsWith('"')) ||
        (p.startsWith("'") && p.endsWith("'"))) {
      result.push(p.slice(1, -1));
    } else {
      result.push(p);
    }
  }
  return result;
}

export { parseArgs, parseToolCall, parseAllToolCalls };
