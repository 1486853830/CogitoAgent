import { setLevel, getLevel, LOG_LEVELS } from '../../src/io/logger.ts';

describe('logger.ts', () => {
  afterEach(() => {
    setLevel('INFO');
  });

  describe('LOG_LEVELS', () => {
    it('should define correct log level values', () => {
      expect(LOG_LEVELS.DEBUG).toBe(0);
      expect(LOG_LEVELS.INFO).toBe(1);
      expect(LOG_LEVELS.WARN).toBe(2);
      expect(LOG_LEVELS.ERROR).toBe(3);
    });
  });

  describe('setLevel', () => {
    it('should set log level by string', () => {
      setLevel('DEBUG');
      expect(getLevel()).toBe('DEBUG');
    });

    it('should set log level by number', () => {
      setLevel(2);
      expect(getLevel()).toBe('WARN');
    });

    it('should default to INFO for invalid string', () => {
      setLevel('INVALID');
      expect(getLevel()).toBe('INFO');
    });
  });

  describe('getLevel', () => {
    it('should return current log level', () => {
      setLevel('DEBUG');
      expect(getLevel()).toBe('DEBUG');
      setLevel('ERROR');
      expect(getLevel()).toBe('ERROR');
    });
  });
});
