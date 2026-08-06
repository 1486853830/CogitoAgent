import { parseArgs, parseToolCall, parseAllToolCalls } from '../../src/agent/tool-parser';

describe('tool-parser.ts', () => {
  describe('parseArgs', () => {
    it('should parse simple quoted args', () => {
      const result = parseArgs('"hello", "world"') as string[];
      expect(result).toEqual(['hello', 'world']);
    });

    it('should unescape \\n in quoted args into real newlines', () => {
      const result = parseArgs('"print(\'a\')\\nprint(\'b\')", "python"') as string[];
      expect(result).toEqual(["print('a')\nprint('b')", 'python']);
      expect(result[0].includes('\\n')).toBe(false);
    });

    it('should unescape \\t, \\r, quotes and backslash', () => {
      const result = parseArgs('"a\\tb\\r\\"c\\\\d"') as string[];
      expect(result).toEqual(['a\tb\r"c\\d']);
    });

    it('should decode \\uXXXX escapes', () => {
      const result = parseArgs('"\\u4e2d\\u6587"') as string[];
      expect(result).toEqual(['中文']);
    });

    it('should preserve unknown escapes like \\d and \\s', () => {
      const result = parseArgs('"\\d+\\s+"') as string[];
      expect(result).toEqual(['\\d+\\s+']);
    });

    it('should parse JSON-style object args', () => {
      const result = parseArgs('{"code":"print(1)\\nprint(2)","language":"python"}') as {
        isJson: boolean;
        data: Record<string, unknown>;
      };
      expect(result.isJson).toBe(true);
      expect(result.data.language).toBe('python');
    });
  });

  describe('parseToolCall', () => {
    it('should extract tool and unescaped code args', () => {
      const result = parseToolCall(
        '[TOOL] executeCode("print(\'第一行\')\\nprint(\'第二行\')", "python") [/TOOL]',
      );
      expect(result).not.toBeNull();
      if (result) {
        expect(result.tool).toBe('executeCode');
        const args = result.args as string[];
        expect(args[0]).toBe("print('第一行')\nprint('第二行')");
      }
    });
  });

  describe('parseAllToolCalls', () => {
    it('should extract multiple tool calls', () => {
      const result = parseAllToolCalls(
        'text [TOOL] runPython("print(1)\\nprint(2)") [/TOOL] more [TOOL] runJavaScript("return 1") [/TOOL]',
      );
      expect(result).toHaveLength(2);
      expect((result[0].args as string[])[0]).toBe('print(1)\nprint(2)');
      expect((result[1].args as string[])[0]).toBe('return 1');
    });
  });
});
