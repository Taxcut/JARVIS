import { z } from 'zod';
const postgresUrl = z
  .string()
  .url()
  .refine(
    (v) => ['postgres:', 'postgresql:'].includes(new URL(v).protocol),
    'Expected PostgreSQL URL',
  );
export const environmentSchema = z.object({
  OPENAI_API_KEY: z.string().min(10).max(512).optional(),
  JARVIS_REALTIME_MODEL: z
    .enum(['gpt-realtime-2.1', 'gpt-realtime', 'gpt-realtime-mini'])
    .default('gpt-realtime-2.1'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  JARVIS_HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  JARVIS_PORT: z.coerce.number().int().min(1024).max(65535).default(4310),
  DATABASE_URL: postgresUrl,
  JARVIS_RP_ID: z
    .string()
    .regex(/^[a-z0-9.-]+$/)
    .default('localhost'),
  JARVIS_AUTH_ORIGIN: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        url.origin === value &&
        !url.username &&
        !url.password &&
        (url.protocol === 'https:' ||
          (url.protocol === 'http:' && url.hostname === 'localhost'))
      );
    }, 'Authentication requires an exact HTTPS or localhost origin')
    .default('http://localhost:4310'),
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
  const result = environmentSchema.parse(input);
  const host = new URL(result.JARVIS_AUTH_ORIGIN).hostname;
  if (host !== result.JARVIS_RP_ID && !host.endsWith(`.${result.JARVIS_RP_ID}`))
    throw new Error('Authentication origin does not match RP ID');
  return result;
}
