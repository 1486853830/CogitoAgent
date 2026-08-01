import {
  TOOL_OUTPUT_LIMITS,
  formatToolResult,
  formatLsResult,
  classifyToolError,
  formatToolError,
} from '../../src/agent/tool-utils.ts';

describe('tool-utils.ts', () => {
  describe('TOOL_OUTPUT_LIMITS', () => {
    it('should have default key with value 10000', () => {
      expect(TOOL_OUTPUT_LIMITS.default).toBe(10000);
    });

    it('should have ls key with value 5000', () => {
      expect(TOOL_OUTPUT_LIMITS.ls).toBe(5000);
    });
  });

  describe('formatLsResult', () => {
    it('should format with [目录] and [文件] headers for mixed dirs and files', () => {
      const data = [
        { name: 'folder1', type: 'dir' as const },
        { name: 'folder2', type: 'dir' as const },
        { name: 'file1.txt', type: 'file' as const },
        { name: 'file2.txt', type: 'file' as const },
      ];
      const result = formatLsResult(data);
      expect(result).toContain('[目录]');
      expect(result).toContain('folder1/');
      expect(result).toContain('folder2/');
      expect(result).toContain('[文件]');
      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');
    });

    it('should format only dirs', () => {
      const data = [
        { name: 'folder1', type: 'dir' as const },
        { name: 'folder2', type: 'dir' as const },
      ];
      const result = formatLsResult(data);
      expect(result).toContain('[目录]');
      expect(result).not.toContain('[文件]');
      expect(result).toContain('folder1/');
      expect(result).toContain('folder2/');
    });

    it('should format only files', () => {
      const data = [
        { name: 'file1.txt', type: 'file' as const },
        { name: 'file2.txt', type: 'file' as const },
      ];
      const result = formatLsResult(data);
      expect(result).not.toContain('[目录]');
      expect(result).toContain('[文件]');
      expect(result).toContain('file1.txt');
      expect(result).toContain('file2.txt');
    });

    it('should return empty string for empty array', () => {
      const result = formatLsResult([]);
      expect(result).toBe('');
    });
  });

  describe('formatToolResult', () => {
    it('should call formatLsResult for ls tool with array data', () => {
      const data = [
        { name: 'folder1', type: 'dir' as const },
        { name: 'file1.txt', type: 'file' as const },
      ];
      const result = formatToolResult('ls', data);
      expect(result).toContain('[目录]');
      expect(result).toContain('[文件]');
      expect(result).toContain('folder1/');
      expect(result).toContain('file1.txt');
    });

    it('should JSON.stringify object data for other tools', () => {
      const data = { foo: 'bar', num: 42 };
      const result = formatToolResult('otherTool', data);
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it('should return string for string data', () => {
      const result = formatToolResult('otherTool', 'hello world');
      expect(result).toBe('hello world');
    });

    it('should unwrap data property from objects that have it', () => {
      const result = formatToolResult('otherTool', { data: 'unwrapped string' });
      expect(result).toBe('unwrapped string');
    });
  });

  describe('classifyToolError', () => {
    it('should return network for ENOTFOUND', () => {
      const error = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      expect(classifyToolError(error)).toBe('network');
    });

    it('should return network for ECONNREFUSED', () => {
      const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      expect(classifyToolError(error)).toBe('network');
    });

    it('should return filesystem for ENOENT', () => {
      const error = Object.assign(new Error('no such file or directory'), { code: 'ENOENT' });
      expect(classifyToolError(error)).toBe('filesystem');
    });

    it('should return permission for EACCES', () => {
      const error = Object.assign(new Error('permission denied'), { code: 'EACCES' });
      expect(classifyToolError(error)).toBe('permission');
    });

    it('should return timeout for timeout message', () => {
      const error = new Error('operation timeout exceeded');
      expect(classifyToolError(error)).toBe('timeout');
    });

    it('should return unknown for unknown error', () => {
      const error = new Error('something went wrong');
      expect(classifyToolError(error)).toBe('unknown');
    });
  });

  describe('formatToolError', () => {
    it('should include 网络错误 in message for network error', () => {
      const error = Object.assign(new Error('dns lookup failed'), { code: 'ENOTFOUND' });
      const result = formatToolError(error, 'fetchTool');
      expect(result).toContain('网络错误');
    });

    it('should include 文件系统错误 for filesystem error', () => {
      const error = Object.assign(new Error('no such file'), { code: 'ENOENT' });
      const result = formatToolError(error, 'readTool');
      expect(result).toContain('文件系统错误');
    });

    it('should include 执行超时 for timeout', () => {
      const error = new Error('operation timeout');
      const result = formatToolError(error, 'slowTool');
      expect(result).toContain('执行超时');
    });

    it('should include 执行失败 for unknown error', () => {
      const error = new Error('unexpected failure');
      const result = formatToolError(error, 'mysteryTool');
      expect(result).toContain('执行失败');
    });

    it('should include suggestion text', () => {
      const error = new Error('unexpected failure');
      const result = formatToolError(error, 'mysteryTool');
      expect(result).toContain('提示:');
    });
  });
});
