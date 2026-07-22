type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_FIELDS = [
  'password', 'passwordHash', 'token', 'secret', 'apiKey', 'api_key',
  'accessToken', 'refreshToken', 'authorization', 'cookie', 'session',
  'jwt', 'creditCard', 'cvv', 'ssn', 'stripeKey', 'stripe_secret',
];

const isDev = process.env.NODE_ENV === 'development';

function redact(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some(f => lowerKey.includes(f))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redact(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const safeData = data ? redact(data) : undefined;
  if (isDev) {
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    if (safeData) console[level](`${prefix} ${message}`, JSON.stringify(safeData, null, 2));
    else console[level](`${prefix} ${message}`);
  } else {
    const entry = JSON.stringify({ timestamp, level, message, ...safeData });
    if (level === 'error') console.error(entry);
    else console.log(entry);
  }
}

export const logger = {
  debug: (msg: string, data?: Record<string, unknown>) => log('debug', msg, data),
  info: (msg: string, data?: Record<string, unknown>) => log('info', msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => log('warn', msg, data),
  error: (msg: string, data?: Record<string, unknown>) => log('error', msg, data),
};
