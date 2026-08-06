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

  if (trimmed.includes('"') || trimmed.includes("'")) {
    const args: string[] = [];
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

    return args.map((arg) => {
      const p = arg.trim();
      if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
        return unescapeQuoted(p.slice(1, -1));
      }
      return p;
    });
  }

  const result: unknown[] = [];
  const parts = trimmed.split(',');
  for (const part of parts) {
    const p = part.trim();
    if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
      result.push(unescapeQuoted(p.slice(1, -1)));
    } else {
      result.push(p);
    }
  }
  return result;
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
