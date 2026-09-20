import { z } from 'zod';
export const riskSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const decisionSchema = z.enum(['ALLOW', 'ASK', 'DENY']);
export const capabilitySchema = z.enum([
  'device.status.read',
  'device.process.list',
  'device.app.launch',
  'device.app.close',
  'device.power.restart',
  'device.power.shutdown',
  'files.search',
  'files.read',
  'files.write',
  'terminal.execute',
  'screen.capture',
  'screen.inspect',
  'remote.connect',
  'phone.call',
  'sms.send',
  'memory.read',
  'memory.write',
]);
export type Capability = z.infer<typeof capabilitySchema>;
export type Risk = z.infer<typeof riskSchema>;
export type Decision = z.infer<typeof decisionSchema>;
export const deviceSchema = z
  .strictObject({
    id: z.uuid(),
    ownerId: z.uuid(),
    displayName: z.string().min(1).max(100),
    platform: z.enum(['macos', 'windows']),
    architecture: z.enum(['arm64', 'x64']),
    runtimeVersion: z.string().min(1).max(64),
    publicKey: z.string().min(1).max(4096),
    enrollmentStatus: z.enum(['pending', 'enrolled', 'rejected']),
    trustState: z.enum(['untrusted', 'trusted', 'revoked']),
    lastSeen: z.iso.datetime({ offset: true }).nullable(),
    revokedAt: z.iso.datetime({ offset: true }).nullable(),
    capabilities: z.array(capabilitySchema),
    metadata: z.record(z.string(), z.string()).default({}),
  })
  .refine(
    (d) =>
      d.trustState !== 'trusted' ||
      (d.enrollmentStatus === 'enrolled' && d.revokedAt === null),
    { message: 'Trusted devices must be enrolled and not revoked' },
  )
  .refine((d) => (d.trustState === 'revoked') === (d.revokedAt !== null), {
    message: 'Revocation state and timestamp must agree',
  });
export type Device = z.infer<typeof deviceSchema>;
export const personalitySchema = z.strictObject({
  address: z.literal('Sir').default('Sir'),
  responseLength: z
    .enum(['adaptive', 'short', 'medium', 'long'])
    .default('adaptive'),
  tone: z.literal('refined-calm-competent').default('refined-calm-competent'),
  dryHumor: z.boolean().default(true),
  wakePhrases: z
    .tuple([z.literal('Jarvis'), z.literal('Hey Jarvis')])
    .default(['Jarvis', 'Hey Jarvis']),
});
