import { safeParseJSON } from '../utils/llm-validator.ts';

interface ToolCallResult {
  tool: string;
  args: unknown[] | { isJson: boolean; data: Record<string, unknown> };
}

function parseToolCall(text: string): ToolCallResult | null {
  const fullMatch = text.match(/\[TOOL\]\s*(\w+)\s*\(([\s\S]*?)\)\s*\[\/TOOL\]/);
  if (fullMatch) {
    const tool = fullMatch[1];
    const argsStr = fullMatch[2];
    const args = parseArgs(argsStr);
    return { tool, args };
  }
  return null;
}

function parseAllToolCalls(text: string): ToolCallResult[] {
  const results: ToolCallResult[] = [];
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
 * 将参数解析为 JS 值。
 * AI 常写 `{limit: 5}` / `{author: 'x'}` 这类非严格 JSON 的对象字面量（key 未加引号），
 * 而 JSON.parse 只接受双引号 key。这里先尝试标准 JSON，失败后补齐 key 引号再解析。
 * 仅处理 `{...}` 形式的对象；其他内容（含数组字面量）原样返回字符串，由各工具的
 * parseJson / normalizeTags 等既有逻辑处理，避免改变既有参数语义。
 */
function tryParseObjectLiteral(value: string): unknown {
  const trimmed = value.trim();
  if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    return value;
  }

  const parsed = safeParseJSON<Record<string, unknown>>(trimmed);
  if (parsed.success && parsed.data !== null) {
    return parsed.data;
  }

  // 兼容 JS 对象字面量：单引号转双引号、补齐未加引号的 key
  const normalized = trimmed
    .replace(/'/g, '"')
    .replace(/([{,]\s*|^)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
  const loose = safeParseJSON<Record<string, unknown>>(normalized);
  if (loose.success && loose.data !== null) {
    return loose.data;
  }

  return value;
}

function parseArgs(
  argsStr: string,
): unknown[] | { isJson: boolean; data: Record<string, unknown> } {
  if (!argsStr || argsStr.trim() === '') {
    return [];
  }

  const trimmed = argsStr.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const parsed = safeParseJSON<Record<string, unknown>>(trimmed);
    if (parsed.success && parsed.data) {
      return { isJson: true, data: parsed.data };
    }
  }

  const args: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  let bracketDepth = 0;

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
    } else if (!inQuote && (char === '[' || char === '{')) {
      // 嵌套数组/对象：跟踪括号深度，括号内的逗号不应拆分参数
      bracketDepth++;
      current += char;
    } else if (!inQuote && (char === ']' || char === '}')) {
      if (bracketDepth > 0) bracketDepth--;
      current += char;
    } else if (char === ',' && !inQuote && bracketDepth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args.map((arg) => {
    const p = arg.trim();
    if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
      return unescapeQuoted(p.slice(1, -1));
    }
    return tryParseObjectLiteral(p);
  });
}

/**
 * 还原引号字符串中的转义序列（对齐 JSON 语义）。
 * LLM 在 [TOOL] name("...") 风格参数里常把多行代码写成字面 "\n"，
 * 若不还原会被原样写进 .py 文件导致 SyntaxError。
 * 未知转义（如 \d、\s）原样保留，避免破坏正则/路径等字面反斜杠。
 */
function unescapeQuoted(str: string): string {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = str[i + 1];
    if (next === undefined) {
      out += '\\';
      break;
    }
    switch (next) {
      case 'n':
        out += '\n';
        i++;
        break;
      case 'r':
        out += '\r';
        i++;
        break;
      case 't':
        out += '\t';
        i++;
        break;
      case 'b':
        out += '\b';
        i++;
        break;
      case 'f':
        out += '\f';
        i++;
        break;
      case '\\':
        out += '\\';
        i++;
        break;
      case '"':
        out += '"';
        i++;
        break;
      case "'":
        out += "'";
        i++;
        break;
      case 'u': {
        const hex = str.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 5;
        } else {
          out += '\\u';
          i++;
        }
        break;
      }
      default:
        // 未知转义（\d、\s、\w 等）原样保留
        out += '\\' + next;
        i++;
    }
  }
  return out;
}

export { parseArgs, parseToolCall, parseAllToolCalls };
