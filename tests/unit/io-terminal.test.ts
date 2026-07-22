import { jest } from '@jest/globals';

// --- Mock readline ---
const mockRl = {
  on: jest.fn(),
  setPrompt: jest.fn(),
  prompt: jest.fn(),
  close: jest.fn(),
  question: jest.fn((_q: string, cb: (answer: string) => void) => cb('')),
};
const createInterface = jest.fn(() => mockRl);

jest.unstable_mockModule('readline', () => ({
  default: { createInterface },
  createInterface,
}));

const {
  init,
  print,
  println,
  printBlank,
  printDivider,
  printTitle,
  printTag,
  printBanner,
  printReasoning,
  resetReasoningTag,
  closeReasoning,
  printContent,
  resetContentTag,
  printToolBlock,
  rainbow,
  waitForConfirm,
  exit,
  onCleanup,
  COLORS,
} = await import('../../src/io/terminal.ts');

describe('io/terminal.ts', () => {
  let writeSpy: jest.Spied<typeof process.stdout.write>;
  let logSpy: jest.Spied<typeof console.log>;
  let resumeSpy: jest.Spied<typeof process.stdin.resume>;

  beforeEach(() => {
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    resumeSpy = jest.spyOn(process.stdin, 'resume').mockImplementation(() => undefined);
    mockRl.on.mockClear();
    mockRl.setPrompt.mockClear();
    mockRl.prompt.mockClear();
    mockRl.close.mockClear();
    mockRl.question.mockClear();
    createInterface.mockClear();
    resetReasoningTag();
    resetContentTag();
  });

  afterEach(() => {
    writeSpy.mockRestore();
    logSpy.mockRestore();
    resumeSpy.mockRestore();
  });

  describe('COLORS', () => {
    it('should expose ANSI color codes', () => {
      expect(COLORS.reset).toBe('\x1b[0m');
      expect(COLORS.bold).toBe('\x1b[1m');
      expect(COLORS.red).toBe('\x1b[91m');
      expect(COLORS.green).toBe('\x1b[92m');
      expect(COLORS.cyan).toBe('\x1b[96m');
    });
  });

  describe('rainbow', () => {
    it('should wrap each character with a color code and reset at the end', () => {
      const result = rainbow('ab');
      expect(result).toContain(COLORS.red);
      expect(result).toContain(COLORS.yellow);
      expect(result.endsWith(COLORS.reset)).toBe(true);
    });

    it('should preserve all original characters', () => {
      const result = rainbow('hi');
      // strip ANSI to verify content
      const stripped = result.replace(/\x1b\[[0-9;]*m/g, '');
      expect(stripped).toBe('hi');
    });
  });

  describe('printTag', () => {
    it('should return a tagged string with bg + text color and reset', () => {
      const tag = printTag('OK');
      expect(tag).toContain('OK');
      expect(tag).toContain(COLORS.bgBlue);
      expect(tag).toContain(COLORS.white);
      expect(tag.endsWith(COLORS.reset)).toBe(true);
    });

    it('should accept custom colors', () => {
      const tag = printTag('GO', 'bgCyan', 'bold');
      expect(tag).toContain(COLORS.bgCyan);
      expect(tag).toContain(COLORS.bold);
    });
  });

  describe('print / println / printBlank', () => {
    it('print should write text to stdout', () => {
      print('hello');
      expect(writeSpy).toHaveBeenCalledWith('hello');
    });

    it('print should wrap text with color when color given', () => {
      print('hi', 'red');
      expect(writeSpy).toHaveBeenCalledWith(COLORS.red + 'hi' + COLORS.reset);
    });

    it('print should write plain text for unknown color', () => {
      print('hi', 'nope');
      expect(writeSpy).toHaveBeenCalledWith('hi');
    });

    it('println should write text then newline', () => {
      println('line');
      expect(writeSpy).toHaveBeenCalledWith('line');
      expect(writeSpy).toHaveBeenCalledWith('\n');
    });

    it('printBlank should write a newline', () => {
      printBlank();
      expect(writeSpy).toHaveBeenCalledWith('\n');
    });
  });

  describe('printDivider', () => {
    it('should log a divider line using console.log', () => {
      printDivider();
      expect(logSpy).toHaveBeenCalledTimes(1);
      const out = logSpy.mock.calls[0][0] as string;
      expect(out).toContain('─');
      expect(out).toContain(COLORS.gray);
    });

    it('should use custom char and color', () => {
      printDivider('=', 'cyan');
      const out = logSpy.mock.calls[0][0] as string;
      expect(out).toContain('=');
      expect(out).toContain(COLORS.cyan);
    });
  });

  describe('printTitle', () => {
    it('should log a decorated title', () => {
      printTitle('Hello');
      expect(logSpy).toHaveBeenCalled();
      const last = logSpy.mock.calls[logSpy.mock.calls.length - 1][0] as string;
      expect(last).toContain('Hello');
      expect(last).toContain('╭');
      expect(last).toContain('╮');
    });
  });

  describe('printBanner', () => {
    it('should log the banner with the app name', () => {
      printBanner();
      expect(logSpy).toHaveBeenCalledTimes(1);
      const out = logSpy.mock.calls[0][0] as string;
      expect(out).toContain('CogitoAgent');
    });
  });

  describe('printReasoning / closeReasoning', () => {
    it('should print the reasoning header on first call', () => {
      printReasoning('thinking...');
      const writes = writeSpy.mock.calls.map((c) => c[0]);
      expect(writes.some((w) => String(w).includes('思考过程'))).toBe(true);
      expect(writes.some((w) => String(w).includes('thinking...'))).toBe(true);
    });

    it('should not repeat the header on subsequent calls', () => {
      printReasoning('a');
      printReasoning('b');
      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      const headerCount = calls.filter((w) => w.includes('思考过程')).length;
      expect(headerCount).toBe(1);
    });

    it('closeReasoning should print the closing border and reset', () => {
      printReasoning('x');
      closeReasoning();
      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((w) => w.includes('└'))).toBe(true);
    });

    it('closeReasoning should do nothing when no reasoning printed', () => {
      closeReasoning();
      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((w) => w.includes('└'))).toBe(false);
    });

    it('resetReasoningTag should reset state so header prints again', () => {
      printReasoning('a');
      resetReasoningTag();
      printReasoning('b');
      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.filter((w) => w.includes('思考过程')).length).toBe(2);
    });
  });

  describe('printContent / resetContentTag', () => {
    it('should print content header on first call', () => {
      printContent('reply');
      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((w) => w.includes('回复内容'))).toBe(true);
      expect(calls.some((w) => w.includes('reply'))).toBe(true);
    });

    it('should close prior reasoning block when starting content', () => {
      printReasoning('think');
      printContent('reply');
      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((w) => w.includes('回复内容'))).toBe(true);
    });

    it('resetContentTag should reset state', () => {
      printContent('a');
      resetContentTag();
      printContent('b');
      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.filter((w) => w.includes('回复内容')).length).toBe(2);
    });
  });

  describe('printToolBlock', () => {
    it('should render a tool-result block when title is 工具结果', () => {
      printToolBlock('result-data', '工具结果');
      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((w) => w.includes('工具结果'))).toBe(true);
      expect(calls.some((w) => w.includes('result-data'))).toBe(true);
    });

    it('should extract tool name from [TOOL] content', () => {
      printToolBlock('[TOOL] search(query)', '工具调用');
      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((w) => w.includes('search'))).toBe(true);
    });

    it('should show unknown tool name when no [TOOL] match', () => {
      printToolBlock('plain text', '工具调用');
      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((w) => w.includes('未知工具'))).toBe(true);
    });
  });

  describe('init', () => {
    it('should create a readline interface and register line handler', () => {
      const cb = (input: string) => {};
      init(cb);
      expect(createInterface).toHaveBeenCalledTimes(1);
      expect(mockRl.on).toHaveBeenCalledWith('line', expect.any(Function));
      expect(mockRl.setPrompt).toHaveBeenCalledWith('');
      expect(mockRl.prompt).toHaveBeenCalled();
    });

    it('should forward trimmed input to the user callback', () => {
      let received: string | null = null;
      init((input) => {
        received = input;
      });
      const lineHandler = mockRl.on.mock.calls.find((c) => c[0] === 'line')?.[1] as (
        s: string,
      ) => void;
      lineHandler('  hello  ');
      expect(received).toBe('hello');
    });
  });

  describe('onCleanup', () => {
    it('should register a cleanup callback invoked during exit', async () => {
      init(() => {});
      const cleanup = jest.fn();
      onCleanup(cleanup);

      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
      jest.useFakeTimers();
      try {
        await exit();
        expect(cleanup).toHaveBeenCalledTimes(1);
      } finally {
        exitSpy.mockRestore();
        jest.useRealTimers();
      }
    });
  });

  describe('waitForConfirm', () => {
    it('should resolve true when answer is yes', async () => {
      init(() => {});
      mockRl.question.mockImplementation((_q: string, cb: (a: string) => void) => cb('yes'));
      await expect(waitForConfirm('continue?')).resolves.toBe(true);
    });

    it('should resolve false when answer is not yes', async () => {
      init(() => {});
      mockRl.question.mockImplementation((_q: string, cb: (a: string) => void) => cb('no'));
      await expect(waitForConfirm('continue?')).resolves.toBe(false);
    });
  });

  describe('exit', () => {
    it('should close readline and call process.exit after delay', async () => {
      init(() => {});
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
      jest.useFakeTimers();
      try {
        const p = exit();
        await p;
        expect(mockRl.close).toHaveBeenCalled();
        // process.exit should not have fired before timer
        expect(exitSpy).not.toHaveBeenCalled();
        jest.advanceTimersByTime(100);
        expect(exitSpy).toHaveBeenCalledWith(0);
      } finally {
        exitSpy.mockRestore();
        jest.useRealTimers();
      }
    });

    it('should handle cleanup callback errors gracefully', async () => {
      init(() => {});
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      onCleanup(() => {
        throw new Error('cleanup failed');
      });

      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
      jest.useFakeTimers();
      try {
        await exit();
        expect(errorSpy).toHaveBeenCalled();
        jest.advanceTimersByTime(100);
        expect(exitSpy).toHaveBeenCalledWith(0);
      } finally {
        errorSpy.mockRestore();
        exitSpy.mockRestore();
        jest.useRealTimers();
      }
    });
  });
});
