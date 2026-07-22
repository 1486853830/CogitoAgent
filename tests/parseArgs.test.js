/**
 * 参数解析器测试
 */

// 模拟 parseArgs 函数
function parseArgs(argsStr) {
  if (!argsStr || argsStr.trim() === '') {
    return [];
  }

  const trimmed = argsStr.trim();

  // 尝试解析 JSON 格式
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const jsonObj = JSON.parse(trimmed);
      return { isJson: true, data: jsonObj };
    } catch {
      // JSON 解析失败，继续用逗号分隔方式
    }
  }

  // 逗号分隔方式（向后兼容）
  const result = [];
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

describe('parseArgs', () => {
  describe('逗号分隔格式', () => {
    test('应该正确解析简单参数', () => {
      const result = parseArgs('arg1, arg2, arg3');
      expect(result).toEqual(['arg1', 'arg2', 'arg3']);
    });

    test('应该正确解析带引号的参数', () => {
      const result = parseArgs('"hello world", "test"');
      expect(result).toEqual(['hello world', 'test']);
    });

    test('应该正确解析单引号参数', () => {
      const result = parseArgs("'hello', 'world'");
      expect(result).toEqual(['hello', 'world']);
    });

    test('应该处理空字符串', () => {
      const result = parseArgs('');
      expect(result).toEqual([]);
    });

    test('应该处理空白字符串', () => {
      const result = parseArgs('   ');
      expect(result).toEqual([]);
    });

    test('应该处理单个参数', () => {
      const result = parseArgs('single');
      expect(result).toEqual(['single']);
    });
  });

  describe('JSON 格式', () => {
    test('应该正确解析 JSON 对象', () => {
      const result = parseArgs('{"path": "file.txt", "content": "hello"}');
      expect(result.isJson).toBe(true);
      expect(result.data).toEqual({ path: 'file.txt', content: 'hello' });
    });

    test('应该正确解析带嵌套的 JSON', () => {
      const result = parseArgs('{"options": {"timeout": 5000}}');
      expect(result.isJson).toBe(true);
      expect(result.data.options.timeout).toBe(5000);
    });

    test('应该正确解析带数组的 JSON', () => {
      const result = parseArgs('{"tags": ["a", "b", "c"]}');
      expect(result.isJson).toBe(true);
      expect(result.data.tags).toEqual(['a', 'b', 'c']);
    });

    test('应该处理无效 JSON（回退到逗号分隔）', () => {
      const result = parseArgs('{invalid json}');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
