import { Notice } from './Notice.js';
import { ProductIcon } from './ProductIcon.js';
import { VoiceExperience, VoiceSettings } from './VoiceExperience.js';
import { useVoice } from './use-voice.js';
import { BootSequence } from './BootSequence.js';
import { RuntimePanel } from './RuntimePanel.js';
import { useIdentity } from './use-identity.js';
import { IdentityViews, IdentityEntry } from './IdentityViews.js';
import { api } from './identity-client.js';
import { setupStatusSchema } from '@jarvis/protocol';
import { useState } from 'react';
import { createClient } from '@jarvis/api-client';
import type { SetupStatus } from '@jarvis/protocol';
const sections = [
  'Core',
  'Assistant',
  'Missions',
  'Devices',
  'Remote',
  'Memory',
  'Automations',
  'Calls',
  'Security',
  'Owner',
  'Approvals',
  'Diagnostics',
  'Settings',
] as const;
type Section = (typeof sections)[number];
const empty: Record<Section, [string, string]> = {
  Owner: [
    'Your identity, Sir.',
    'Your single-owner profile and security state.',
  ],
  Approvals: [
    'No approval requests.',
    'Durable owner decisions, with no execution authority.',
  ],
  Core: [
    'Your foundation, ready to begin.',
    'Connect to your local Core to verify the database and begin setup.',
  ],
  Assistant: [
    'A quiet beginning.',
    'Your private voice conversation. Wake JARVIS when you’re ready.',
  ],
  Missions: [
    'No missions yet.',
    'Mission planning and execution are not implemented in this phase.',
  ],
  Devices: [
    'No enrolled devices.',
    'Enroll and manage devices with cryptographic identity. Computer execution remains unavailable.',
  ],
  Remote: [
    'No remote sessions.',
    'Secure, visible remote access is planned. Remote control is not available.',
  ],
  Memory: [
    'A clean slate.',
    'The memory system has not been implemented. Nothing has been stored.',
  ],
  Automations: [
    'No automations configured.',
    'Scheduled actions will become available in a later phase.',
  ],
  Calls: [
    'Phone Link is not configured.',
    'Calling and messaging are not available in this phase.',
  ],
  Security: [
    'Setup required.',
    'Manage your passkeys, sessions, recovery codes and security state.',
  ],
  Diagnostics: [
    'Observe the real system.',
    'Connect to Core to check its health and database readiness.',
  ],
  Settings: [
    'Built around you, Sir.',
    'Your voice, your devices, your preferences.',
  ],
};
export function App() {
  const [page, setPage] = useState<Section>('Core');
  const [setup, setSetup] = useState(false);
  const [token, setToken] = useState('');
  const [base, setBase] = useState('http://127.0.0.1:4310');
  const identity = useIdentity(base);
  const voice = useVoice();
  const [state, setState] = useState<SetupStatus | null>(null);
  const [connection, setConnection] = useState('Not connected');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function connect(verify = false) {
    setBusy(true);
    setError('');
    try {
      if (identity.authenticated) {
        setState(
          setupStatusSchema.parse(
            await api(
              base,
              verify ? 'POST' : 'GET',
              verify ? '/api/v1/setup/core/verify' : '/api/v1/setup/status',
            ),
          ),
        );
        setConnection('Connected · database ready');
        return;
      }
      const client = createClient(token, base);
      await client.health();
      await client.readiness();
      setState(verify ? await client.verifyCore() : await client.setup());
      setConnection('Connected · database ready');
    } catch {
      setState(null);
      setConnection('Unavailable');
      setError(
        'Could not verify Core. Check the address, local access token, running PostgreSQL, and migrations.',
      );
    } finally {
      setBusy(false);
    }
  }
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date()),
  );
  const greeting =
    hour < 5 || hour >= 23
      ? 'Good night'
      : hour < 12
        ? 'Good morning'
        : hour < 18
          ? 'Good afternoon'
          : 'Good evening';
  return (
    <div
      className={`shell ${!setup && (page === 'Core' || page === 'Assistant') ? 'presence-page' : ''}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <BootSequence voice={voice} connected={identity.sync === 'LIVE'} />
      <aside>
        <a
          className="brand"
          href="#core"
          onClick={() => {
            setPage('Core');
            setSetup(false);
            setError('');
          }}
          aria-label="JARVIS home"
        >
          <img
            className="brand-mark"
            src="/brand/approved-j-master.png"
            alt=""
          />
          <span>
            JARVIS<small>PERSONAL INTELLIGENCE</small>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {sections.map((name) => (
            <button
              key={name}
              className={page === name ? 'active' : ''}
              aria-current={page === name ? 'page' : undefined}
              onClick={() => {
                setPage(name);
                setSetup(false);
                setError('');
              }}
            >
              <span className="nav-symbol" aria-hidden="true">
                <ProductIcon name={name} />
              </span>
              {name}
              {name === 'Core' && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="small-dot" /> PRIVATE BY DESIGN
          <small>VOICE & PRESENCE · v0.4.0</small>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1}>
        <header>
          <div className="breadcrumb">
            JARVIS <span>/</span> {setup ? 'SETUP' : page.toUpperCase()}
          </div>
          <div className="connection">
            <span className="small-dot" />
            {identity.authenticated ? identity.sync : connection}
          </div>
        </header>
        <div className="content">
          <div className="eyebrow">YOUR PERSONAL INTELLIGENCE SYSTEM</div>
          <h1>
            {page === 'Core' && !setup
              ? `${greeting}, ${identity.snapshot?.owner.preferredAddress ?? 'Sir'}.`
              : setup
                ? 'Establish your foundation.'
                : page}
          </h1>
          <p className="intro">
            {setup
              ? 'Connect the real system. Every step reflects actual implementation.'
              : page === 'Core'
                ? 'A considered presence. Entirely yours.'
                : empty[page][1]}
          </p>
          {setup ? (
            <>
              <section className="setup panel">
                <div>
                  <div className="eyebrow">01 / JARVIS CORE</div>
                  <h2>Connect to your local Core</h2>
                  <p>
                    Start PostgreSQL, run migrations, and start Core using the
                    repository setup guide. Enter the access token from your
                    private .env file.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void connect(true);
                    }}
                  >
                    <label htmlFor="core-url">Core address</label>
                    <input
                      disabled={busy}
                      id="core-url"
                      type="url"
                      value={base}
                      onChange={(e) => {
                        setBase(e.target.value);
                        setState(null);
                        setConnection('Not connected');
                      }}
                      required
                    />
                    <label htmlFor="token">Local access token</label>
                    <input
                      disabled={busy}
                      id="token"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={token}
                      onChange={(e) => {
                        setToken(e.target.value);
                        setState(null);
                        setConnection('Not connected');
                      }}
                      required={!identity.authenticated}
                      minLength={64}
                      maxLength={64}
                    />
                    <p className="hint">
                      Held only in memory for this session. This is bootstrap
                      access only, permanently disabled after owner creation.
                    </p>
                    <button
                      className="primary"
                      disabled={
                        busy || (!identity.authenticated && token.length !== 64)
                      }
                    >
                      {busy ? 'Verifying…' : 'Verify Core & save progress'}
                      <span aria-hidden="true">↗</span>
                    </button>
                  </form>
                  <div role="status" aria-live="polite">
                    {state?.core === 'verified' && (
                      <p className="success">
                        Core verified. Progress is saved in PostgreSQL. Owner
                        and security setup remain incomplete.
                      </p>
                    )}
                    <Notice message={error} />
                  </div>
                </div>
                <ol className="steps">
                  {[
                    'JARVIS Core',
                    'Owner Identity',
                    'Owner Passkey',
                    'Current Device Identity',
                    'Device Enrollment',
                    'Voice',
                    'Phone Link',
                    'Security',
                    'System Test',
                  ].map((name, i) => (
                    <li key={name}>
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      <div>
                        {name}
                        <small>
                          {i === 0
                            ? state?.core === 'verified'
                              ? 'Verified'
                              : 'Available now'
                            : name === 'Owner Identity'
                              ? identity.snapshot
                                ? 'Secured'
                                : 'Available now'
                              : name === 'Owner Passkey'
                                ? identity.snapshot?.passkeys.some(
                                    (p) => !p.revokedAt,
                                  )
                                  ? 'Registered'
                                  : 'Required'
                                : name === 'Current Device Identity'
                                  ? identity.native
                                    ? 'Native secure storage ready'
                                    : 'Native desktop required'
                                  : name === 'Device Enrollment'
                                    ? identity.snapshot?.devices.some(
                                        (d) =>
                                          d.id === identity.native?.device.id &&
                                          d.trustState === 'trusted',
                                      )
                                      ? 'Trusted'
                                      : 'Required'
                                    : name === 'Voice'
                                      ? voice.status?.microphone &&
                                        voice.status.ttsReady
                                        ? 'Local voice ready'
                                        : 'Configure in Settings'
                                      : name === 'Security'
                                        ? identity.snapshot
                                            ?.recoveryCodesRemaining
                                          ? 'Recovery codes available'
                                          : 'Recovery setup required'
                                        : 'Future phase · not configured'}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
              {!identity.authenticated ? (
                <IdentityEntry identity={identity} token={token} />
              ) : (
                <p className="hint">
                  Owner secured. Manage recovery in Security and voice in
                  Settings. Phone and remote control remain future work.
                </p>
              )}
            </>
          ) : ['Owner', 'Security', 'Devices', 'Approvals'].includes(page) ? (
            <>
              <IdentityViews key={page} page={page} identity={identity} />
              {page === 'Devices' && (
                <RuntimePanel
                  base={base}
                  authenticated={identity.authenticated}
                  snapshot={identity.snapshot}
                />
              )}
            </>
          ) : page === 'Settings' || page === 'Diagnostics' ? (
            <>
              {page === 'Settings' && <VoiceSettings voice={voice} />}
              <RuntimePanel
                base={base}
                authenticated={identity.authenticated}
                snapshot={identity.snapshot}
                diagnostics={page === 'Diagnostics'}
              />
            </>
          ) : page === 'Core' || page === 'Assistant' ? (
            <VoiceExperience
              voice={voice}
              connected={identity.sync === 'LIVE'}
              onSetup={() =>
                identity.sync === 'LIVE' ? setPage('Settings') : setSetup(true)
              }
            />
          ) : (
            <section className="empty panel">
              <div className="empty-mark" aria-hidden="true">
                {page.slice(0, 1)}
              </div>
              <div className="eyebrow">{page.toUpperCase()} / FOUNDATION</div>
              <h2>{empty[page][0]}</h2>
              <p>{empty[page][1]}</p>
              {(page === 'Security' || page === 'Devices') && (
                <button className="secondary" onClick={() => setSetup(true)}>
                  View setup
                </button>
              )}
              <div role="status">
                <Notice message={error} />
              </div>
            </section>
          )}
          <footer>
            <span>DESIGNED FOR DELIBERATE ACTION</span>
            <span>PRIVATE INTELLIGENCE · macOS + Windows</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
