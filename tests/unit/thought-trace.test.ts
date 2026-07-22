import { jest } from '@jest/globals';
import {
  traceStep,
  updateTraceStep,
  clearThoughtTrace,
  getThoughtTrace,
} from '../../src/agent/thought-trace.ts';

describe('thought-trace.ts', () => {
  // Suppress console errors that may come from broadcast when ws-server is not initialized
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    clearThoughtTrace();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearThoughtTrace();
  });

  describe('traceStep', () => {
    it('should return a step object with id, name, details, status, startTime, duration', () => {
      let step: ReturnType<typeof traceStep> | undefined;
      try {
        step = traceStep('test-step', { foo: 'bar' });
      } catch {
        // broadcast may throw if ws-server not initialized
      }
      expect(step).toBeDefined();
      expect(typeof step!.id).toBe('string');
      expect(step!.name).toBe('test-step');
      expect(step!.details).toEqual({ foo: 'bar' });
      expect(step!.status).toBeDefined();
      expect(typeof step!.startTime).toBe('string');
      expect(step!.duration).toBe(0);
    });

    it('should use provided name and details', () => {
      const step = traceStep('my-step', { key: 'value', count: 3 });
      expect(step.name).toBe('my-step');
      expect(step.details).toEqual({ key: 'value', count: 3 });
    });

    it('should default status to running', () => {
      const step = traceStep('default-status');
      expect(step.status).toBe('running');
    });

    it('should accept custom status completed', () => {
      const step = traceStep('completed-step', {}, 'completed');
      expect(step.status).toBe('completed');
    });

    it('should accept custom status failed', () => {
      const step = traceStep('failed-step', {}, 'failed');
      expect(step.status).toBe('failed');
    });
  });

  describe('getThoughtTrace', () => {
    it('should return array', () => {
      const trace = getThoughtTrace();
      expect(Array.isArray(trace)).toBe(true);
    });
  });

  describe('clearThoughtTrace', () => {
    it('should clear the trace (getThoughtTrace returns empty after clear)', () => {
      traceStep('step1');
      expect(getThoughtTrace().length).toBeGreaterThan(0);
      clearThoughtTrace();
      expect(getThoughtTrace()).toEqual([]);
    });
  });

  describe('updateTraceStep', () => {
    it('should update existing step status', () => {
      const step = traceStep('to-update');
      updateTraceStep(step.id, { status: 'completed' });
      const trace = getThoughtTrace();
      const updated = trace.find((s) => s.id === step.id);
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('completed');
    });

    it('should not crash for non-existent id', () => {
      expect(() => updateTraceStep('non-existent-id', { status: 'failed' })).not.toThrow();
    });
  });
});
