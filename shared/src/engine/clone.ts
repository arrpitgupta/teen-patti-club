/** Deep copy for plain JSON-like engine state (objects, arrays, primitives). */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v: unknown) => deepClone(v)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = deepClone(v);
  return out as T;
}
