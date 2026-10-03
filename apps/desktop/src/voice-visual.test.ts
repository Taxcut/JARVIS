import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { VoiceExperience } from './VoiceExperience.js';
import { IntelligenceBody, type BodyState } from './IntelligenceBody.js';
import type { Voice } from './use-voice.js';
import type { VoicePhase, VoiceStatus } from '@jarvis/protocol';
// Test-only fixtures. They never enter Core, runtime persistence or production UI.
const fixture = (phase: VoicePhase): VoiceStatus => ({
  version: 1,
  phase,
  settings: {
    enabled: true,
    muted: false,
    inputDevice: null,
    outputDevice: null,
    sensitivity: 0.5,
    speechRate: 0.96,
    volume: 0.7,
    soundCues: true,
    greeting: true,
  },
  microphone: true,
  cloudAudio: false,
  wakeReady: true,
  ttsReady: true,
  sttReady: true,
  localModel: 'READY',
  lastFirstTokenMs: null,
  providerConnected: phase === 'LISTENING',
  permission: 'GRANTED',
  message: 'Isolated visual fixture',
  inputLevel: 0,
  outputLevel: phase === 'SPEAKING' ? 0.12 : 0,
  outputBands: [0.02, 0.08, 0.03],
  transcripts: [],
  generation: 0,
  wakeCount: 0,
  lastWake: null,
  lastFirstAudioMs: null,
  executionAvailable: false,
});
for (const phase of [
  'WAKE_ONLY',
  'LISTENING',
  'THINKING',
  'SPEAKING',
  'LOCKDOWN',
  'DEGRADED',
] as const)
  it(`preserves the ${phase} product surface`, () => {
    const voice: Voice = {
      status: fixture(phase),
      runtime: 'ONLINE',
      native: true,
      error: '',
      busy: false,
      configure: async () => {},
      control: async () => {},
    };
    expect(
      renderToStaticMarkup(
        createElement(VoiceExperience, {
          voice,
          connected: true,
          onSetup: () => {},
        }),
      ),
    ).toMatchSnapshot();
  });
for (const state of [
  'IDLE',
  'LISTENING',
  'THINKING',
  'SPEAKING',
  'ALERT',
  'OFFLINE',
] as BodyState[])
  it(`exposes an accessible ${state} body fallback`, () => {
    expect(
      renderToStaticMarkup(
        createElement(IntelligenceBody, {
          state,
          level: 0,
          bands: [0, 0, 0],
          quality: 'LOW_POWER',
          reduced: true,
        }),
      ),
    ).toContain(`JARVIS presence: ${state.toLowerCase()}`);
  });
