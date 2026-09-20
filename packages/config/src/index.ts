import { z } from 'zod';
const postgresUrl = z
  .string()
  .url()
  .refine(
    (v) => ['postgres:', 'postgresql:'].includes(new URL(v).protocol),
    'Expected PostgreSQL URL',
  );
export const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  JARVIS_HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  JARVIS_PORT: z.coerce.number().int().min(1024).max(65535).default(4310),
  DATABASE_URL: postgresUrl,
  JARVIS_API_TOKEN: z
    .string()
    .regex(
      /^[a-f0-9]{64}$/,
      'Expected 32 random bytes encoded as lowercase hex',
    ),
  JARVIS_OWNER_PHONE: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});
export type Environment = z.infer<typeof environmentSchema>;
export function parseEnvironment(input: unknown): Environment {
  return environmentSchema.parse(input);
}
