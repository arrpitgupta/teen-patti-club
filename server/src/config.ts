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
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}
