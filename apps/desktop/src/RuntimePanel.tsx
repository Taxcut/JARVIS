import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { z } from 'zod';
import { runtimeStateSchema, type Snapshot } from '@jarvis/protocol';
const localSchema = z.object({
  version: z.literal(1),
  instanceId: z.uuid(),
  runtimeVersion: z.string(),
  state: runtimeStateSchema,
  startedAt: z.string(),
  lastConnectedAt: z.string().nullable(),
  lastHeartbeatAt: z.string().nullable(),
  deviceId: z.uuid().nullable(),
  startup: z.string(),
  wakeGeneration: z.number(),
  reconnectAttempt: z.number(),
  lastError: z.string().nullable(),
  securityState: z.string().nullable(),
  syncSequence: z.string(),
  platformObserver: z.boolean(),
  executionAvailable: z.literal(false),
});
type Local = z.infer<typeof localSchema>;
export function RuntimePanel({
  base,
  authenticated,
  snapshot,
  diagnostics = false,
}: {
  base: string;
  authenticated: boolean;
  snapshot: Snapshot | null;
  diagnostics?: boolean;
}) {
  const [local, setLocal] = useState<Local | null>(null),
    [startup, setStartup] = useState('NOT_CONFIGURED'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [time, setTime] = useState(Date.now());
  useEffect(() => {
    if (!isTauri()) return;
    let closed = false,
      pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const [state, start] = await Promise.all([
          invoke('runtime_status'),
          invoke<string>('runtime_startup', { enable: null }),
        ]);
        if (!closed) {
          setLocal(state ? localSchema.parse(state) : null);
          setStartup(start);
          setTime(Date.now());
        }
      } catch {
        if (!closed) {
          setLocal(null);
          setError('Local runtime status could not be read.');
        }
      } finally {
        pending = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      closed = true;
      clearInterval(timer);
    };
  }, []);
  async function action(command: string, args: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    try {
      const result = await invoke<unknown>(command, args);
      if (
        result &&
        typeof result === 'object' &&
        'error' in result &&
        result.error
      )
        throw new Error(String(result.error));
      const state = await invoke('runtime_status');
      setLocal(state ? localSchema.parse(state) : null);
      setStartup(await invoke('runtime_startup', { enable: null }));
    } catch (e) {
      setError(
        typeof e === 'string'
          ? e
          : e instanceof Error
            ? e.message
            : 'Runtime action could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel setup">
      <div>
        <div className="eyebrow">BACKGROUND RUNTIME</div>
        <h2>
          {local ? local.state.replaceAll('_', ' ') : 'Runtime not running'}
        </h2>
        <p>
          Your runtime stays active when this dashboard closes. Voice runs here
          when enabled. Computer execution remains unavailable.
        </p>
        {!isTauri() ? (
          <p>Open the native JARVIS desktop to manage this device’s runtime.</p>
        ) : (
          <>
            <p>
              Start at login: <strong>{startup.replaceAll('_', ' ')}</strong>
            </p>
            {local && (
              <p>
                Core: {local.securityState ?? 'Not authenticated'} · Realtime:{' '}
                {local.state === 'ONLINE' ? 'Connected' : 'Not connected'}
              </p>
            )}
            <div className="actions">
              <button
                className="secondary"
                disabled={busy || !!local}
                onClick={() => void action('runtime_start')}
              >
                Start runtime
              </button>
              <button
                className="secondary"
                disabled={busy || !local || !authenticated}
                onClick={() => void action('runtime_connect', { base })}
              >
                Connect runtime to Core
              </button>
              <button
                className="secondary"
                disabled={busy || !local}
                onClick={() => void action('runtime_reconnect')}
              >
                Reconnect runtime
              </button>
              <button
                className="secondary"
                disabled={busy || !local}
                onClick={() => void action('runtime_stop')}
              >
                Stop runtime
              </button>
            </div>
            <div className="actions">
              <button
                className="secondary"
                disabled={
                  busy || startup === 'ENABLED' || startup === 'UNAVAILABLE'
                }
                onClick={() => void action('runtime_startup', { enable: true })}
              >
                Enable start at login
              </button>
              <button
                className="secondary"
                disabled={
                  busy || !['ENABLED', 'APPROVAL_REQUIRED'].includes(startup)
                }
                onClick={() =>
                  void action('runtime_startup', { enable: false })
                }
              >
                Disable start at login
              </button>
            </div>
            {startup === 'UNAVAILABLE' && (
              <p className="hint">
                Startup requires an installed JARVIS app with its runtime
                helper. See JARVISSETUP.
              </p>
            )}
            {startup === 'APPROVAL_REQUIRED' && (
              <p className="hint">
                Allow JARVIS in System Settings → General → Login Items &
                Extensions.
              </p>
            )}
            <p className="hint">
              Connecting creates a separate restricted session for this trusted
              device. Stopping leaves your device enrolled; disabling login
              startup prevents the next automatic launch.
            </p>
          </>
        )}
        {diagnostics && local && (
          <dl>
            <dt>Runtime version / instance</dt>
            <dd>
              {local.runtimeVersion} / {local.instanceId}
            </dd>
            <dt>Started</dt>
            <dd>{new Date(local.startedAt).toLocaleString()}</dd>
            <dt>Last Core connection</dt>
            <dd>
              {local.lastConnectedAt
                ? new Date(local.lastConnectedAt).toLocaleString()
                : 'Not connected'}
            </dd>
            <dt>Last heartbeat</dt>
            <dd>
              {local.lastHeartbeatAt
                ? new Date(local.lastHeartbeatAt).toLocaleString()
                : 'Not reported'}
            </dd>
            <dt>Reconnect attempt / wake generation</dt>
            <dd>
              {local.reconnectAttempt} / {local.wakeGeneration}
            </dd>
            <dt>OS lifecycle observer</dt>
            <dd>{local.platformObserver ? 'Available' : 'Unavailable'}</dd>
            <dt>Last error</dt>
            <dd>{local.lastError ?? 'None'}</dd>
          </dl>
        )}
        <div role="status">{error && <p className="error">{error}</p>}</div>
        {snapshot?.devices.map((device) => {
          const presence = snapshot.runtimePresence?.find(
            (r) => r.deviceId === device.id,
          );
          const state = presence
            ? Date.parse(presence.expiresAt) < time &&
              !['REVOKED', 'AUTH_REQUIRED'].includes(presence.state)
              ? 'OFFLINE'
              : presence.state
            : 'NOT CONFIGURED';
          return (
            <article key={device.id}>
              <h3>{device.displayName}</h3>
              <p>
                Device trust: {device.trustState} · Runtime: {state}
              </p>
              {presence && (
                <p className="hint">
                  Last seen {new Date(presence.lastSeen).toLocaleString()} ·
                  Runtime {presence.runtimeVersion} · Start at login{' '}
                  {presence.startup.toLowerCase().replaceAll('_', ' ')} ·
                  Execution unavailable
                </p>
              )}
              {diagnostics && presence && (
                <dl>
                  {Object.entries(presence.capabilities).map(
                    ([name, state]) => (
                      <div key={name}>
                        <dt>{name}</dt>
                        <dd>{state}</dd>
                      </div>
                    ),
                  )}
                </dl>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
