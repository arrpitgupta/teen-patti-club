import { z } from 'zod';

const EnvSchema = z.object({
  MONGODB_URI: z.string().optional(),
  CLIENT_ORIGIN: z.string().default('http://localhost:5317'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}
