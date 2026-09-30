import { expect, it } from 'vitest';
import { bodyState } from './VoiceExperience.js';
import { qualityProfiles } from './IntelligenceBody.js';
import { voiceStatusSchema } from '@jarvis/protocol';
it('shows actual audio and security states rather than an always-online presence', () => {
  expect(bodyState('SPEAKING', false)).toBe('OFFLINE');
  expect(bodyState('SPEAKING', true)).toBe('SPEAKING');
  expect(bodyState('LISTENING', true)).toBe('LISTENING');
  expect(bodyState('THINKING', true)).toBe('THINKING');
  expect(bodyState('LOCKDOWN', true)).toBe('ALERT');
  expect(bodyState('MUTED', true)).toBe('IDLE');
});
it('low power reduces particles, trails, resolution and frame rate', () => {
  for (const property of ['count', 'ratio', 'fps', 'trails'] as const)
    expect(qualityProfiles.LOW_POWER[property]).toBeLessThan(
      qualityProfiles.HIGH[property],
    );
});
it('rejects invented voice readiness and execution authorization', () => {
  expect(
    voiceStatusSchema.safeParse({
      version: 1,
      phase: 'READY',
      executionAvailable: true,
    }).success,
  ).toBe(false);
});
