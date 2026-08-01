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
        return p.slice(1, -1);
      }
      return p;
    });
  }

  const result: unknown[] = [];
  const parts = trimmed.split(',');
  for (const part of parts) {
    const p = part.trim();
    if ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'"))) {
      result.push(p.slice(1, -1));
    } else {
      result.push(p);
    }
  }
  return result;
}

export { parseArgs, parseToolCall, parseAllToolCalls };
