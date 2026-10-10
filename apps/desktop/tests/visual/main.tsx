// Deliberately separate from the production entry point. No identity, API or native invocation.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IntelligenceBody, type BodyState } from '../../src/IntelligenceBody';
import '../../src/style.css';
import { VoiceExperience, VoiceSettings } from '../../src/VoiceExperience';
import { RuntimeDiagnostics } from '../../src/RuntimePanel';
import { ConfirmAction } from '../../src/ConfirmAction';
import type { VoiceStatus, VoicePhase } from '@jarvis/protocol';
import type { Voice } from '../../src/use-voice';
const query = new URLSearchParams(location.search);
const view = query.get('view') ?? 'body';
// Isolated origin only: deterministic motion, without changing native preferences.
localStorage.setItem(
  'jarvis.visualPreferences',
  JSON.stringify({ quality: 'HIGH', startup: 'off', reducedMotion: true }),
);
function ProductFixture() {
  const [phase, setPhase] = useState<VoicePhase>(
    (query.get('phase') ?? 'STARTING') as VoicePhase,
  );
  const [confirmed, setConfirmed] = useState(0);
  const [settings, setSettings] = useState({
    enabled: true,
    muted: false,
    inputDevice: null,
    outputDevice: null,
    sensitivity: 0.5,
    speechRate: 0.96,
    volume: 0.7,
    soundCues: false,
    greeting: false,
  } as VoiceStatus['settings']);
  const status: VoiceStatus = {
    version: 1,
    phase,
    settings,
    microphone: ['WAKE_ONLY', 'LISTENING', 'THINKING', 'SPEAKING'].includes(
      phase,
    ),
    cloudAudio: false,
    wakeReady: true,
    ttsReady: true,
    sttReady: true,
    localModel: phase === 'STARTING' ? 'LOADING' : 'READY',
    lastFirstTokenMs: null,
    providerConnected: false,
    permission: 'GRANTED',
    message:
      phase === 'STARTING'
        ? 'Loading the local conversation model. Your workspace remains available.'
        : 'Local voice processing enabled.',
    inputLevel: 0,
    outputLevel: phase === 'SPEAKING' ? 0.18 : 0,
    outputBands: phase === 'SPEAKING' ? [0.07, 0.15, 0.04] : [0, 0, 0],
    transcripts: [],
    generation: 0,
    wakeCount: 0,
    lastWake: null,
    lastFirstAudioMs: null,
    executionAvailable: false,
  };
  const voice: Voice = {
    status,
    runtime: 'ONLINE',
    error: '',
    busy: false,
    native: false,
    configure: async (s) => {
      setSettings(s);
    },
    control: async () => {},
  };
  return (
    <main className="visual-fixture product-fixture">
      <header>
        <h1>Isolated product fixture</h1>
        <p>No identity, audio devices or connected services.</p>
      </header>
      {view === 'settings' ? (
        <VoiceSettings voice={voice} />
      ) : view === 'diagnostics' ? (
        <section className="panel identity-panel">
          <div className="eyebrow">BACKGROUND RUNTIME</div>
          <h2>Diagnostics</h2>
          <p>Isolated offline fixture. No operational data.</p>
          <RuntimeDiagnostics
            local={{
              version: 1,
              instanceId: '00000000-0000-4000-8000-000000000000',
              runtimeVersion: '0.4.0',
              state: 'OFFLINE',
              startedAt: '2026-01-01T12:00:00Z',
              lastConnectedAt: null,
              lastHeartbeatAt: null,
              deviceId: null,
              startup: 'DISABLED',
              wakeGeneration: 0,
              reconnectAttempt: 0,
              lastError:
                'Core is unavailable. Check the connection and reconnect.',
              securityState: null,
              syncSequence: '0',
              platformObserver: true,
              executionAvailable: false,
            }}
          />
        </section>
      ) : view === 'confirmation' ? (
        <>
          <ConfirmAction
            disabled={false}
            action="Revoke this session?"
            consequence="This session will stop receiving trusted access. Revoking the current session signs you out."
            reversal="Sign in again with a valid passkey to create a new session."
            onClick={() => setConfirmed(confirmed + 1)}
          >
            Revoke session
          </ConfirmAction>
          <p role="status">Fixture confirmations: {confirmed}</p>
        </>
      ) : (
        <>
          <label>
            Voice state{' '}
            <select
              value={phase}
              onChange={(e) => setPhase(e.target.value as VoicePhase)}
            >
              {[
                'STARTING',
                'WAKE_ONLY',
                'LISTENING',
                'THINKING',
                'SPEAKING',
                'PERMISSION_REQUIRED',
                'DEGRADED',
                'LOCKDOWN',
              ].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <VoiceExperience voice={voice} connected={true} onSetup={() => {}} />
        </>
      )}
    </main>
  );
}
const states: BodyState[] = [
  'IDLE',
  'LISTENING',
  'THINKING',
  'SPEAKING',
  'ALERT',
  'OFFLINE',
];
function VisualFixture() {
  const [state, setState] = useState<BodyState>('IDLE');
  return (
    <main className="visual-fixture">
      <header>
        <h1>Isolated visual fixture</h1>
        <label>
          Body state{' '}
          <select
            value={state}
            onChange={(e) => setState(e.target.value as BodyState)}
          >
            {states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </header>
      <section className="presence-stage" aria-label={`Fixture ${state}`}>
        <IntelligenceBody
          state={state}
          quality="HIGH"
          reduced={true}
          seed={41}
          level={state === 'SPEAKING' ? 0.18 : 0}
          bands={state === 'SPEAKING' ? [0.07, 0.15, 0.04] : [0, 0, 0]}
        />
        <div className="body-caption">
          <span className="state-label">{state}</span>
          <h2>JARVIS presence</h2>
          <p>
            Deterministic test input · no production data or connected services
          </p>
        </div>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  view === 'body' ? <VisualFixture /> : <ProductFixture />,
);
