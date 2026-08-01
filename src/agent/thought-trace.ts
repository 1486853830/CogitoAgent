import { broadcast } from '../io/ws-server.ts';

interface ThoughtTraceStep {
  id: string;
  name: string;
  details: Record<string, unknown>;
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  duration: number;
}

let thoughtTrace: ThoughtTraceStep[] = [];

function traceStep(
  name: string,
  details: Record<string, unknown> = {},
  status: 'running' | 'completed' | 'failed' = 'running',
): ThoughtTraceStep {
  const step: ThoughtTraceStep = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 11),
    name,
    details,
    status,
    startTime: new Date().toISOString(),
    duration: 0,
  };
  thoughtTrace.push(step);
  broadcast('thought-trace', { action: 'add', step });
  return step;
}

function updateTraceStep(id: string, updates: Partial<ThoughtTraceStep>): void {
  const step = thoughtTrace.find((s) => s.id === id);
  if (step) {
    const start = new Date(step.startTime).getTime();
    step.duration = Math.round(((Date.now() - start) / 1000) * 100) / 100;
    Object.assign(step, updates);
    broadcast('thought-trace', { action: 'update', step });
  }
}

function clearThoughtTrace(): void {
  thoughtTrace = [];
  broadcast('thought-trace', { action: 'clear' });
}

function getThoughtTrace(): ThoughtTraceStep[] {
  return [...thoughtTrace];
}

export { traceStep, updateTraceStep, clearThoughtTrace, getThoughtTrace };
