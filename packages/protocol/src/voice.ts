import { z } from 'zod';
export const voiceSettingsSchema = z.strictObject({
  enabled: z.boolean(),
  muted: z.boolean(),
  inputDevice: z.string().min(1).max(512).nullable(),
  outputDevice: z.string().min(1).max(512).nullable(),
  sensitivity: z.number().min(0).max(1),
  speechRate: z.number().min(0.85).max(1.15),
  volume: z.number().min(0).max(1),
  soundCues: z.boolean(),
  greeting: z.boolean(),
});
export const voicePhaseSchema = z.enum([
  'DISABLED',
  'MUTED',
  'STARTING',
  'WAKE_ONLY',
  'LISTENING',
  'THINKING',
  'SPEAKING',
  'INTERRUPTED',
  'PERMISSION_REQUIRED',
  'UNAVAILABLE',
  'DEGRADED',
  'AUTH_REQUIRED',
  'LOCKDOWN',
  'SUSPENDED',
]);
export const voiceStatusSchema = z.object({
  version: z.literal(1),
  phase: voicePhaseSchema,
  settings: voiceSettingsSchema,
  microphone: z.boolean(),
  cloudAudio: z.boolean(),
  wakeReady: z.boolean(),
  ttsReady: z.boolean(),
  providerConnected: z.boolean(),
  permission: z.string().max(40),
  message: z.string().max(300),
  inputLevel: z.number().finite(),
  outputLevel: z.number().finite(),
  outputBands: z.tuple([
    z.number().finite(),
    z.number().finite(),
    z.number().finite(),
  ]),
  transcripts: z
    .array(
      z.object({
        id: z.string().max(80),
        role: z.enum(['owner', 'assistant']),
        text: z.string().max(1000),
        finalText: z.boolean(),
        interrupted: z.boolean(),
      }),
    )
    .max(6),
  generation: z.number().int().nonnegative(),
  wakeCount: z.number().int().nonnegative(),
  lastWake: z.string().nullable(),
  lastFirstAudioMs: z.number().nonnegative().nullable(),
  executionAvailable: z.literal(false),
});
export type VoiceStatus = z.infer<typeof voiceStatusSchema>;
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;
export type VoicePhase = z.infer<typeof voicePhaseSchema>;
