// Logger that never prints secrets (e.g. MONGODB_URI) even if they appear in an error message.

const secrets = new Set<string>();

export function registerSecret(value: string | undefined): void {
  if (value) secrets.add(value);
}

export function redact(text: string): string {
  let out = text;
  for (const s of secrets) out = out.split(s).join('[redacted]');
  // Credentials in any connection string.
  return out.replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/gi, '$1[redacted]@');
}

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.message}${a.stack ? `\n${a.stack}` : ''}`;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

let silent = false;
export function setSilent(value: boolean): void {
  silent = value;
}

export const log = {
  info: (...args: unknown[]) => {
    if (!silent) console.log(`[server] ${redact(format(args))}`);
  },
  warn: (...args: unknown[]) => {
    if (!silent) console.warn(`[server] ${redact(format(args))}`);
  },
  error: (...args: unknown[]) => {
    if (!silent) console.error(`[server] ${redact(format(args))}`);
  },
};
