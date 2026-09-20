import { useState } from 'react';
import type { IdentityController } from './use-identity.js';
const time = (value: string | null) =>
  value ? new Date(value).toLocaleString() : 'Not recorded';
function Rename({
  name,
  disabled,
  save,
}: {
  name: string;
  disabled: boolean;
  save: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState(name);
  return editing ? (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        save(value);
        setEditing(false);
      }}
    >
      <input
        aria-label="New name"
        value={value}
        maxLength={80}
        required
        onChange={(e) => setValue(e.target.value)}
      />
      <button disabled={disabled}>Save</button>
      <button type="button" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </form>
  ) : (
    <button
      className="secondary"
      disabled={disabled}
      onClick={() => {
        setValue(name);
        setEditing(true);
      }}
    >
      Rename
    </button>
  );
}
export function IdentityEntry({
  identity,
  token,
}: {
  identity: IdentityController;
  token: string;
}) {
  const [pairing, setPairing] = useState(''),
    [recovery, setRecovery] = useState('');
  return (
    <section className="panel identity-panel">
      <div className="eyebrow">OWNER / TRUSTED IDENTITY</div>
      <h2>Secure your connection, Sir.</h2>
      <p>
        Passkeys verify you in your system browser. This desktop keeps its
        device key and resume credential in native secure storage.
      </p>
      {identity.native ? (
        <p className="hint">
          This device · {identity.native.device.displayName} ·{' '}
          {identity.native.fingerprint.slice(0, 16)}
        </p>
      ) : (
        <p>Open the native JARVIS desktop to use secure device identity.</p>
      )}
      <div className="actions">
        <button
          disabled={!identity.native || identity.busy || token.length !== 64}
          onClick={() => void identity.login('bootstrap', token)}
        >
          Create owner & register passkey
        </button>
        <button
          disabled={!identity.native || identity.busy}
          onClick={() => void identity.login('login')}
        >
          Sign in with passkey
        </button>
      </div>
      <p className="hint">
        Owner creation requires the first-run bootstrap token and is permanently
        unavailable after setup.
      </p>
      <details>
        <summary>Enroll this device from an existing trusted device</summary>
        <label>
          One-time pairing secret
          <input
            type="password"
            autoComplete="off"
            value={pairing}
            onChange={(e) => setPairing(e.target.value)}
          />
        </label>
        <button
          disabled={!identity.native || identity.busy || pairing.length !== 43}
          onClick={() => {
            const value = pairing;
            setPairing('');
            void identity.login('pair', value);
          }}
        >
          Request enrollment
        </button>
      </details>
      <details>
        <summary>Recover access on this trusted device</summary>
        <p>
          A recovery code works only with this device’s existing trusted key.
          You will register a new passkey. Existing sessions will be revoked.
        </p>
        <label>
          One-time recovery code
          <input
            type="password"
            autoComplete="off"
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
          />
        </label>
        <button
          disabled={!identity.native || identity.busy || recovery.length !== 43}
          onClick={() => {
            const value = recovery;
            setRecovery('');
            void identity.login('recovery', null, { recoveryCode: value });
          }}
        >
          Recover with code
        </button>
      </details>
      <IdentityFeedback identity={identity} />
    </section>
  );
}
export function IdentityFeedback({
  identity,
}: {
  identity: IdentityController;
}) {
  return (
    <div role="status" aria-live="polite">
      {identity.notice && <p>{identity.notice}</p>}
      {identity.error && <p className="error">{identity.error}</p>}
    </div>
  );
}
export function IdentityViews({
  page,
  identity,
}: {
  page: string;
  identity: IdentityController;
}) {
  const s = identity.snapshot;
  const [codes, setCodes] = useState<string[] | null>(null),
    [pairing, setPairing] = useState<string | null>(null);
  if (!s) return <IdentityEntry identity={identity} token="" />;
  const disabled = identity.busy || identity.sync !== 'LIVE';
  const normal = s.owner.securityState === 'NORMAL';
  return (
    <div className="identity-content">
      <IdentityFeedback identity={identity} />
      {identity.sync !== 'LIVE' && (
        <p className="hint">
          {identity.sync} · Shown data may be stale. Changes are disabled until
          synchronization resumes.
        </p>
      )}
      {page === 'Owner' && (
        <section className="panel identity-panel">
          <h2>{s.owner.preferredAddress}</h2>
          <p>
            Owner since {time(s.owner.createdAt)} · {s.owner.securityState}
          </p>
          <form
            key={s.owner.revision}
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              void identity.mutate({
                action: 'owner.update',
                revision: s.owner.revision,
                displayName: data.get('displayName'),
                preferredAddress: data.get('preferredAddress'),
              });
            }}
          >
            <label>
              Display name (optional)
              <input
                name="displayName"
                defaultValue={s.owner.displayName ?? ''}
                maxLength={80}
              />
            </label>
            <label>
              Form of address
              <input
                name="preferredAddress"
                defaultValue={s.owner.preferredAddress}
                maxLength={80}
                required
              />
            </label>
            <button disabled={disabled || !normal}>Save profile</button>
          </form>
        </section>
      )}
      {page === 'Devices' && (
        <>
          <section className="panel identity-panel">
            <h2>Trusted devices</h2>
            {s.devices.map((d) => (
              <article className="identity-row" key={d.id}>
                <div>
                  <h3>{d.displayName}</h3>
                  <p>
                    {d.platform} · {d.trustState}
                    {d.id === identity.native?.device.id
                      ? ' · This device'
                      : ''}
                  </p>
                  <small>Last seen {time(d.lastSeen)}</small>
                  <details>
                    <summary>
                      Key fingerprint · {d.fingerprint.slice(0, 16)}
                    </summary>
                    <code>{d.fingerprint}</code>
                  </details>
                </div>
                <div className="actions">
                  {d.trustState === 'trusted' && (
                    <>
                      <Rename
                        name={d.displayName}
                        disabled={disabled || !normal}
                        save={(name) =>
                          void identity.mutate({
                            action: 'device.rename',
                            id: d.id,
                            revision: d.revision,
                            name,
                          })
                        }
                      />
                      <button
                        disabled={disabled || !normal}
                        onClick={() =>
                          void identity.mutate(
                            {
                              action: 'device.revoke',
                              id: d.id,
                              revision: d.revision,
                            },
                            'device.revoke',
                            d.id,
                          )
                        }
                      >
                        Revoke device
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
            <button
              disabled={disabled || !normal}
              onClick={() =>
                void identity
                  .mutate({ action: 'enrollment.create' })
                  .then((r) => {
                    if (typeof r?.secret === 'string') setPairing(r.secret);
                  })
              }
            >
              Add a device
            </button>
            {pairing && (
              <div className="secret-box">
                <p>
                  Enter this one-time secret on the new device within five
                  minutes. Verify its fingerprint below before approving.
                </p>
                <code>{pairing}</code>
                <button onClick={() => setPairing(null)}>Hide secret</button>
              </div>
            )}
          </section>
          <section className="panel identity-panel">
            <h2>Enrollment requests</h2>
            {s.enrollments.length === 0 ? (
              <p>No enrollment requests.</p>
            ) : (
              s.enrollments.map((e) => (
                <article className="identity-row" key={e.id}>
                  <div>
                    <h3>{e.device?.displayName ?? 'Waiting for device'}</h3>
                    <p>
                      {e.status} · Expires {time(e.expiresAt)}
                    </p>
                    {e.fingerprint && <code>{e.fingerprint}</code>}
                  </div>
                  {e.status === 'REQUESTED' && (
                    <div className="actions">
                      <button
                        disabled={disabled || !normal}
                        onClick={() =>
                          void identity.mutate(
                            {
                              action: 'enrollment.decide',
                              id: e.id,
                              revision: e.revision,
                              approve: true,
                            },
                            'device.approve',
                            e.id,
                          )
                        }
                      >
                        Verify & approve
                      </button>
                      <button
                        disabled={disabled || !normal}
                        onClick={() =>
                          void identity.mutate({
                            action: 'enrollment.decide',
                            id: e.id,
                            revision: e.revision,
                            approve: false,
                          })
                        }
                      >
                        Deny
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </section>
        </>
      )}
      {page === 'Security' && (
        <>
          <section className="panel identity-panel">
            <h2>Passkeys</h2>
            {s.passkeys.map((p) => (
              <article className="identity-row" key={p.id}>
                <div>
                  <h3>{p.name}</h3>
                  <p>
                    {p.revokedAt
                      ? 'Revoked'
                      : p.backedUp
                        ? 'Backed up passkey'
                        : 'Device passkey'}{' '}
                    · {p.deviceType}
                  </p>
                  <small>
                    Created {time(p.createdAt)} · Last used {time(p.lastUsed)}
                  </small>
                </div>
                {!p.revokedAt && (
                  <div className="actions">
                    <Rename
                      name={p.name}
                      disabled={disabled || !normal}
                      save={(name) =>
                        void identity.mutate({
                          action: 'passkey.rename',
                          id: p.id,
                          revision: p.revision,
                          name,
                        })
                      }
                    />
                    <button
                      disabled={
                        disabled ||
                        !normal ||
                        s.passkeys.filter((k) => !k.revokedAt).length <= 1
                      }
                      onClick={() =>
                        void identity.mutate(
                          {
                            action: 'passkey.revoke',
                            id: p.id,
                            revision: p.revision,
                          },
                          'passkey.revoke',
                          p.id,
                        )
                      }
                    >
                      Revoke passkey
                    </button>
                  </div>
                )}
              </article>
            ))}
            <button
              disabled={disabled || !normal}
              onClick={() => void identity.addPasskey()}
            >
              Add passkey
            </button>
          </section>
          <section className="panel identity-panel">
            <h2>Recovery codes</h2>
            <p>
              {s.recoveryCodesRemaining} unused codes. Keep them offline
              somewhere safe. Recovery also requires an existing trusted device.
            </p>
            <button
              disabled={disabled || !normal}
              onClick={() =>
                void identity
                  .mutate(
                    { action: 'recovery.regenerate' },
                    'recovery.regenerate',
                    s.owner.id,
                  )
                  .then((r) => {
                    if (Array.isArray(r?.codes))
                      setCodes(
                        r.codes.filter(
                          (x): x is string => typeof x === 'string',
                        ),
                      );
                  })
              }
            >
              {s.recoveryCodesRemaining
                ? 'Replace recovery codes'
                : 'Generate recovery codes'}
            </button>
            {codes && (
              <div className="secret-box">
                <p>
                  Shown once. Replacing codes invalidates all previous codes.
                </p>
                {codes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
                <button onClick={() => setCodes(null)}>
                  I have saved these codes · Hide
                </button>
              </div>
            )}
          </section>
          <section className="panel identity-panel">
            <h2>Security state · {s.owner.securityState}</h2>
            <p>
              Lockdown blocks security mutations and cancels pending enrollments
              and approvals. Owner authentication, inspection and explicit
              unlock remain available. Computer execution is not implemented.
            </p>
            <button
              disabled={disabled}
              onClick={() =>
                void identity.mutate(
                  {
                    action: 'lockdown.change',
                    state: normal ? 'LOCKDOWN' : 'NORMAL',
                    revision: s.owner.revision,
                  },
                  'lockdown.change',
                  normal ? 'LOCKDOWN' : 'NORMAL',
                )
              }
            >
              {normal ? 'Enter lockdown' : 'Verify & leave lockdown'}
            </button>
          </section>
          <section className="panel identity-panel">
            <h2>Sessions</h2>
            {s.sessions.map((v) => (
              <article className="identity-row" key={v.id}>
                <div>
                  <h3>
                    {s.devices.find((d) => d.id === v.deviceId)?.displayName ??
                      'Device'}
                  </h3>
                  <p>
                    {v.revokedAt
                      ? 'Revoked'
                      : new Date(v.expiresAt) <= new Date()
                        ? 'Expired'
                        : 'Active'}{' '}
                    · Last used {time(v.lastUsed)}
                  </p>
                  <small>Absolute expiry {time(v.expiresAt)}</small>
                </div>
                {!v.revokedAt && (
                  <button
                    disabled={disabled || !normal}
                    onClick={() =>
                      void identity.mutate(
                        {
                          action: 'session.revoke',
                          id: v.id,
                          revision: v.revision,
                        },
                        'session.revoke',
                        v.id,
                      )
                    }
                  >
                    Revoke session
                  </button>
                )}
              </article>
            ))}
          </section>
          <section className="panel identity-panel">
            <h2>Recent security history</h2>
            {s.audit.map((a) => (
              <article className="audit-row" key={a.id}>
                <span>{a.type}</span>
                <small>
                  {a.outcome} · {a.risk ?? '—'} · {time(a.timestamp)}
                </small>
              </article>
            ))}
          </section>
        </>
      )}
      {page === 'Approvals' && (
        <section className="panel identity-panel">
          <h2>Approval records</h2>
          <p>
            Approvals record owner decisions. They do not authorize or perform
            execution.
          </p>
          {s.approvals.length === 0 ? (
            <p>No approval requests.</p>
          ) : (
            s.approvals.map((a) => (
              <article className="identity-row" key={a.id}>
                <div>
                  <h3>{a.summary}</h3>
                  <p>
                    {a.risk} · {a.capability} · {a.status}
                  </p>
                  <small>Expires {time(a.expiresAt)}</small>
                </div>
                {a.status === 'PENDING' &&
                  new Date(a.expiresAt) > new Date() && (
                    <div className="actions">
                      {(['APPROVED', 'DENIED', 'CANCELLED'] as const).map(
                        (decision) => (
                          <button
                            key={decision}
                            disabled={disabled || !normal}
                            onClick={() =>
                              void identity.mutate({
                                action: 'approval.decide',
                                id: a.id,
                                revision: a.revision,
                                decision,
                                idempotencyKey: crypto.randomUUID(),
                              })
                            }
                          >
                            {decision === 'APPROVED'
                              ? 'Approve'
                              : decision === 'DENIED'
                                ? 'Deny'
                                : 'Cancel'}
                          </button>
                        ),
                      )}
                    </div>
                  )}
              </article>
            ))
          )}
        </section>
      )}
    </div>
  );
}
