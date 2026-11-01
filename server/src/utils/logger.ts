import { env } from '../config/env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// JSON.stringify convierte un Error en {}: se serializa a mano (la pila solo va al log).
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code;
    return { name: value.name, message: value.message, code, stack: value.stack, cause: value.cause };
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function write(level: Level, msg: string, fields: Fields = {}): void {
  if (LEVELS[level] < LEVELS[env.LOG_LEVEL]) return;
  const time = new Date().toISOString();
  let line: string;
  try {
    line = JSON.stringify({ level, time, msg, ...fields }, replacer);
  } catch {
    line = JSON.stringify({ level, time, msg, logError: 'campos no serializables' });
  }
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(`${line}\n`);
}

// Una línea JSON por evento: level, time, msg y los campos (requestId, method, route, status, ms, userId…).
export const logger = {
  debug: (msg: string, fields?: Fields) => write('debug', msg, fields),
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
};
