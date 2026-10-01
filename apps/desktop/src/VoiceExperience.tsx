import { Notice } from './Notice.js';
import { useVisualPreferences } from './visual-preferences.js';
import { lazy, Suspense, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { VoicePhase } from '@jarvis/protocol';
import type { BodyState, Quality } from './IntelligenceBody.js';
const IntelligenceBody = lazy(() =>
  import('./IntelligenceBody.js').then((module) => ({
    default: module.IntelligenceBody,
  })),
);
import type { Voice } from './use-voice.js';
export function bodyState(
  phase: VoicePhase | undefined,
  connected: boolean,
): BodyState {
  if (!connected) return 'OFFLINE';
  if (phase === 'SPEAKING') return 'SPEAKING';
  if (phase === 'LISTENING' || phase === 'INTERRUPTED') return 'LISTENING';
  if (phase === 'THINKING' || phase === 'STARTING') return 'THINKING';
  if (
    phase === 'LOCKDOWN' ||
    phase === 'DEGRADED' ||
    phase === 'PERMISSION_REQUIRED'
  )
    return 'ALERT';
  return 'IDLE';
}
export function VoiceExperience({
  voice,
  onSetup,
  connected,
}: {
  voice: Voice;
  onSetup: () => void;
  connected: boolean;
}) {
  const { preferences, update, reduced } = useVisualPreferences();
  const quality = preferences.quality;
  const status = voice.status,
    state = bodyState(status?.phase, connected),
    settings = status?.settings;
  const copy = !connected
    ? 'A quiet beginning.'
    : status?.phase === 'SPEAKING'
      ? 'At your service, Sir.'
      : status?.phase === 'THINKING'
        ? 'One moment, Sir.'
        : status?.phase === 'LISTENING'
          ? 'Go ahead, Sir.'
          : settings?.enabled
            ? 'Say “Jarvis.”'
            : 'Ready when you are, Sir.';
  return (
    <section className="voice-experience" aria-labelledby="presence-title">
      <div className="presence-topline">
        <span>
          <i className={`signal ${connected ? 'online' : ''}`} />
          {connected ? 'TRUSTED CONNECTION' : 'AWAITING CONNECTION'}
        </span>
        <span>PERSONAL INTELLIGENCE / 04</span>
      </div>
      <div className="presence-stage">
        <Suspense
          fallback={
            <div
              className="intelligence-body body-loading"
              aria-label="Preparing JARVIS presence"
            >
              <img src="/brand/approved-j-master.png" alt="" />
            </div>
          }
        >
          <IntelligenceBody
            state={state}
            level={status?.outputLevel ?? 0}
            bands={status?.outputBands ?? [0, 0, 0]}
            quality={quality}
            reduced={reduced}
          />
        </Suspense>
        <div className="body-caption">
          <span className="state-label">{state}</span>
          <h2 id="presence-title">{copy}</h2>
          <p role="status">
            {!connected
              ? 'Connect your Core and secure your identity to begin.'
              : (status?.message ??
                'Start your background runtime to prepare voice.')}
          </p>
        </div>
        <div className="orbit-note left">
          <span>LOCAL FIRST</span>
          <b>
            YOUR SPACE.
            <br />
            YOUR CONTROL.
          </b>
        </div>
        <div className="orbit-note right">
          <span>AUDIO CHANNEL</span>
          <b>
            {status?.cloudAudio
              ? 'CONVERSATION ACTIVE'
              : status?.microphone
                ? 'LOCAL WAKE ONLY'
                : 'MICROPHONE OFF'}
          </b>
        </div>
      </div>
      <div className="voice-actions">
        {!connected ? (
          <button className="primary" onClick={onSetup}>
            Begin Setup <span aria-hidden="true">↗</span>
          </button>
        ) : settings ? (
          <>
            <button
              className={settings.enabled ? 'secondary' : 'primary'}
              disabled={voice.busy}
              onClick={() =>
                void voice.configure({
                  ...settings,
                  enabled: !settings.enabled,
                  muted: false,
                })
              }
            >
              {settings.enabled ? 'Turn voice off' : 'Enable voice'}
              <span aria-hidden="true">{settings.enabled ? '○' : '◉'}</span>
            </button>
            {settings.enabled && (
              <button
                className="secondary"
                aria-pressed={settings.muted}
                disabled={voice.busy}
                onClick={() =>
                  void voice.configure({ ...settings, muted: !settings.muted })
                }
              >
                {settings.muted ? 'Unmute microphone' : 'Mute microphone'}
              </button>
            )}
          </>
        ) : (
          <button className="secondary" onClick={onSetup}>
            Connect runtime <span aria-hidden="true">↗</span>
          </button>
        )}
        <label className="quality-label">
          Visual quality
          <select
            value={quality}
            onChange={(e) => {
              const value = e.target.value as Quality;
              update({ quality: value });
            }}
          >
            {(['CINEMATIC', 'HIGH', 'BALANCED', 'LOW_POWER'] as const).map(
              (q) => (
                <option key={q} value={q}>
                  {q.replace('_', ' ').toLowerCase()}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <p className="privacy-note">
        {status?.cloudAudio
          ? 'Conversation audio is sent to OpenAI. Speech is generated locally.'
          : status?.microphone
            ? 'Wake detection stays on this device. No audio is being sent online.'
            : 'Your microphone is off. Voice starts only when you enable it.'}
      </p>
      <Notice message={voice.error} />
      <div className="conversation-strip">
        <div className="section-heading">
          <h3>Conversation</h3>
          <span>PRIVATE · MEMORY ONLY</span>
          {!!status?.transcripts.length && (
            <button
              className="text-button"
              onClick={() => void voice.control('clear')}
            >
              Clear
            </button>
          )}
        </div>
        {status?.transcripts.length ? (
          <div
            className="transcript"
            role="log"
            aria-label="Live conversation"
            aria-live="polite"
          >
            {status.transcripts.map((t) => (
              <div className={`utterance ${t.role}`} key={t.id}>
                <span>{t.role === 'owner' ? 'YOU' : 'JARVIS'}</span>
                <p>
                  {t.text}
                  {t.interrupted && <small> · interrupted</small>}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="conversation-empty">
            <span aria-hidden="true">〰</span>
            <p>
              Your next conversation begins here.
              <small>
                {connected
                  ? 'Say “Jarvis” or “Hey Jarvis” after enabling voice.'
                  : 'No conversation has been recorded.'}
              </small>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
type AudioDevice = {
  id: string;
  name: string;
  input: boolean;
  output: boolean;
};
export function VoiceSettings({ voice }: { voice: Voice }) {
  const { preferences, update, systemReduced } = useVisualPreferences();
  const [devices, setDevices] = useState<AudioDevice[]>([]),
    [deviceError, setDeviceError] = useState('');
  useEffect(() => {
    if (!voice.native) return;
    let closed = false;
    void invoke<AudioDevice[]>('voice_devices')
      .then((d) => {
        if (!closed) setDevices(d);
      })
      .catch(() => {
        if (!closed)
          setDeviceError(
            'Audio devices could not be listed. Reconnect your device and reopen Settings.',
          );
      });
    return () => {
      closed = true;
    };
  }, [voice.native]);
  const s = voice.status?.settings;
  return (
    <section className="panel voice-settings">
      <div className="eyebrow">VOICE & PRESENCE</div>
      <h2>A voice that feels familiar.</h2>
      <p>
        British English · Kokoro · George. Speech stays local. Conversation uses
        OpenAI after you wake JARVIS.
      </p>
      {s ? (
        <div className="settings-grid">
          <label>
            Microphone
            <select
              value={s.inputDevice ?? ''}
              onChange={(e) =>
                void voice.configure({
                  ...s,
                  inputDevice: e.target.value || null,
                })
              }
            >
              <option value="">System default</option>
              {devices
                .filter((d) => d.input)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Speaker
            <select
              value={s.outputDevice ?? ''}
              onChange={(e) =>
                void voice.configure({
                  ...s,
                  outputDevice: e.target.value || null,
                })
              }
            >
              <option value="">System default</option>
              {devices
                .filter((d) => d.output)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Voice volume <output>{Math.round(s.volume * 100)}%</output>
            <input
              type="range"
              min="0"
              max="1"
              step=".05"
              value={s.volume}
              onChange={(e) =>
                void voice.configure({ ...s, volume: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Speech pace <output>{s.speechRate.toFixed(2)}×</output>
            <input
              type="range"
              min=".85"
              max="1.15"
              step=".01"
              value={s.speechRate}
              onChange={(e) =>
                void voice.configure({
                  ...s,
                  speechRate: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Wake sensitivity <output>{Math.round(s.sensitivity * 100)}%</output>
            <input
              type="range"
              min="0"
              max="1"
              step=".1"
              value={s.sensitivity}
              onChange={(e) =>
                void voice.configure({
                  ...s,
                  sensitivity: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.greeting}
              onChange={(e) =>
                void voice.configure({ ...s, greeting: e.target.checked })
              }
            />
            Greet me on startup
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.soundCues}
              onChange={(e) =>
                void voice.configure({ ...s, soundCues: e.target.checked })
              }
            />
            Subtle interface sounds
          </label>
        </div>
      ) : (
        <p className="hint">
          Open the desktop and connect its background runtime to configure
          voice.
        </p>
      )}
      <div className="settings-grid visual-settings">
        <label>
          Startup animation
          <select
            value={preferences.startup}
            onChange={(e) =>
              update({ startup: e.target.value as 'full' | 'reduced' | 'off' })
            }
          >
            <option value="full">Cinematic · shorter on repeat launches</option>
            <option value="reduced">Reduced · simple fade</option>
            <option value="off">Off · open workspace immediately</option>
          </select>
        </label>
        <label>
          Visual quality
          <select
            value={preferences.quality}
            onChange={(e) => update({ quality: e.target.value as Quality })}
          >
            <option value="CINEMATIC">Cinematic</option>
            <option value="HIGH">High</option>
            <option value="BALANCED">Balanced</option>
            <option value="LOW_POWER">Low power</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={preferences.reducedMotion}
            onChange={(e) => update({ reducedMotion: e.target.checked })}
          />
          Reduce motion
        </label>
        {systemReduced && (
          <p className="hint">
            Your system’s reduced-motion preference is active.
          </p>
        )}
      </div>
      <p className="hint">
        Muted means no capture. “Jarvis, stop listening” turns voice off until
        you enable it again. Transcripts disappear when the runtime closes;
        clear them at any time.
      </p>
      <Notice message={deviceError} />
      <Notice message={voice.error} />
      {s && (
        <button
          className="secondary"
          disabled={voice.busy}
          onClick={() => void voice.control('retry')}
        >
          Reconnect audio
        </button>
      )}
    </section>
  );
}
