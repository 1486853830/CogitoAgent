import { jest } from '@jest/globals';
import {
  debug,
  info,
  warn,
  error,
  agent,
  agentDebug,
  system,
  tool,
  toolDebug,
  setLevel,
  getLevel,
  LOG_LEVELS,
} from '../../src/io/logger.ts';

describe('io/logger.ts', () => {
  let logSpy: jest.Spied<typeof console.log>;
  let warnSpy: jest.Spied<typeof console.warn>;
  let errorSpy: jest.Spied<typeof console.error>;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    setLevel('INFO');
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    setLevel('INFO');
  });

  describe('LOG_LEVELS', () => {
    it('should define correct numeric level values', () => {
      expect(LOG_LEVELS.DEBUG).toBe(0);
      expect(LOG_LEVELS.INFO).toBe(1);
      expect(LOG_LEVELS.WARN).toBe(2);
      expect(LOG_LEVELS.ERROR).toBe(3);
    });
  });

  describe('setLevel / getLevel', () => {
    it('should set level by string name', () => {
      setLevel('DEBUG');
      expect(getLevel()).toBe('DEBUG');
      setLevel('WARN');
      expect(getLevel()).toBe('WARN');
      setLevel('ERROR');
      expect(getLevel()).toBe('ERROR');
    });

    it('should set level by numeric value', () => {
      setLevel(0);
      expect(getLevel()).toBe('DEBUG');
      setLevel(2);
      expect(getLevel()).toBe('WARN');
    });

    it('should fall back to INFO for unknown string', () => {
      setLevel('NONEXISTENT');
      expect(getLevel()).toBe('INFO');
    });

    it('should handle lowercase string input', () => {
      setLevel('debug');
      expect(getLevel()).toBe('DEBUG');
    });
  });

  describe('info', () => {
    it('should call console.log with formatted message', () => {
      info('hello');
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('[INFO]');
      expect(output).toContain('hello');
      expect(output).toMatch(/^\[\d{4}-\d{2}-\d{2}T/);
    });

    it('should join multiple arguments with spaces', () => {
      info('a', 'b', 'c');
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('a b c');
    });
  });

  describe('debug', () => {
    it('should not output when level is INFO', () => {
      setLevel('INFO');
      debug('dbg');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should output to console.log when level is DEBUG', () => {
      setLevel('DEBUG');
      debug('dbg');
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('[DEBUG]');
      expect(output).toContain('dbg');
    });
  });

  describe('warn', () => {
    it('should call console.warn', () => {
      warn('careful');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
      const output = warnSpy.mock.calls[0][0] as string;
      expect(output).toContain('[WARN]');
      expect(output).toContain('careful');
    });

    it('should not output when level is ERROR', () => {
      setLevel('ERROR');
      warn('careful');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('error', () => {
    it('should call console.error', () => {
      error('boom');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
      const output = errorSpy.mock.calls[0][0] as string;
      expect(output).toContain('[ERROR]');
      expect(output).toContain('boom');
    });

    it('should always output at every level >= ERROR', () => {
      setLevel('ERROR');
      error('boom');
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('module-prefixed loggers', () => {
    it('agent should log with [AGENT] prefix at INFO level', () => {
      agent('running');
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('[AGENT]');
      expect(output).toContain('running');
    });

    it('system should log with [SYSTEM] prefix', () => {
      system('started');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0][0]).toContain('[SYSTEM]');
    });

    it('tool should log with [TOOL] prefix', () => {
      tool('called');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0][0]).toContain('[TOOL]');
    });

    it('agentDebug should only output in DEBUG level', () => {
      setLevel('INFO');
      agentDebug('hidden');
      expect(logSpy).not.toHaveBeenCalled();

      setLevel('DEBUG');
      agentDebug('shown');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0][0]).toContain('[AGENT]');
    });

    it('toolDebug should only output in DEBUG level', () => {
      setLevel('INFO');
      toolDebug('hidden');
      expect(logSpy).not.toHaveBeenCalled();

      setLevel('DEBUG');
      toolDebug('shown');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls[0][0]).toContain('[TOOL]');
    });
  });

  describe('message formatting', () => {
    it('should JSON-stringify object arguments', () => {
      info('data', { key: 'value' });
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('"key": "value"');
    });

    it('should handle arrays as stringified objects', () => {
      info('items', [1, 2, 3]);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('1');
      expect(output).toContain('2');
      expect(output).toContain('3');
    });

    it('should stringify numbers and booleans directly', () => {
      info('count', 42, true);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('42');
      expect(output).toContain('true');
    });

    it('should fall back to String() for non-serializable objects', () => {
      const circular: any = {};
      circular.self = circular;
      info('circular', circular);
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('circular');
    });

    it('should handle null argument', () => {
      info('value is', null);
      expect(logSpy).toHaveBeenCalledTimes(1);
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toContain('null');
    });

    it('should include ISO timestamp prefix', () => {
      info('msg');
      const output = logSpy.mock.calls[0][0] as string;
      expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('level filtering', () => {
    it('should only output error when level is ERROR', () => {
      setLevel('ERROR');
      debug('d');
      info('i');
      warn('w');
      error('e');
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('should output warn and error when level is WARN', () => {
      setLevel('WARN');
      debug('d');
      info('i');
      warn('w');
      error('e');
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('should output everything when level is DEBUG', () => {
      setLevel('DEBUG');
      debug('d');
      info('i');
      warn('w');
      error('e');
      expect(logSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });
});
