import { z } from 'zod';

const EnvSchema = z.object({
  MONGODB_URI: z.string().optional(),
  CLIENT_ORIGIN: z.string().default('http://localhost:5317'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Web push ("your turn" notifications). Generate with: npx web-push generate-vapid-keys
  // Without them, development uses throwaway keys and production has push turned off.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  /** Contact for push services: a mailto: or https: URL. */
  VAPID_SUBJECT: z.string().optional(),
  /** Set by Render: the deployed commit (shown by /health so a deploy can be checked). */
  RENDER_GIT_COMMIT: z.string().optional(),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}

/** Things that are wrong in production but don't stop the server. */
export function productionWarnings(config: Config): string[] {
  if (config.NODE_ENV !== 'production') return [];
  const out: string[] = [];
  const origins = config.CLIENT_ORIGIN.split(',').map((o) => o.trim());
  if (origins.some((o) => !o.startsWith('https://'))) {
    out.push(
      `CLIENT_ORIGIN should be the https:// address of the client (got ${config.CLIENT_ORIGIN}).`,
    );
  }
  // (Missing VAPID keys are reported by push.ts.)
  if (config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY && !config.VAPID_SUBJECT) {
    out.push('VAPID_SUBJECT is not set: using a placeholder contact for push services.');
  }
  return out;
}
