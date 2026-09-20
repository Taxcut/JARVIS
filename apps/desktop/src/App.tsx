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
  'Diagnostics',
  'Settings',
] as const;
type Section = (typeof sections)[number];
const empty: Record<Section, [string, string]> = {
  Core: [
    'Your foundation, ready to begin.',
    'Connect to your local Core to verify the database and begin setup.',
  ],
  Assistant: [
    'A quiet beginning.',
    'Conversation and voice are planned for a later phase. No conversation has been created.',
  ],
  Missions: [
    'No missions yet.',
    'Mission planning and execution are not implemented in this phase.',
  ],
  Devices: [
    'No enrolled devices.',
    'Trusted device enrollment will be available in a later phase. No device authority has been granted.',
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
    'The capability policy foundation is in place. Owner identity, enrollment, and execution approval are not implemented.',
  ],
  Diagnostics: [
    'Observe the real system.',
    'Connect to Core to check its health and database readiness.',
  ],
  Settings: [
    'Built around you, Sir.',
    'The personality foundation supports adaptive response length and a calm, refined tone. Voice and personalization controls are not available yet.',
  ],
};
export function App() {
  const [page, setPage] = useState<Section>('Core');
  const [setup, setSetup] = useState(false);
  const [token, setToken] = useState('');
  const [base, setBase] = useState('http://127.0.0.1:4310');
  const [state, setState] = useState<SetupStatus | null>(null);
  const [connection, setConnection] = useState('Not connected');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function connect(verify = false) {
    setBusy(true);
    setError('');
    try {
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
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="shell">
      <aside>
        <a
          className="brand"
          href="#core"
          onClick={() => {
            setPage('Core');
            setSetup(false);
          }}
          aria-label="JARVIS home"
        >
          <span className="brand-mark">J</span>
          <span>
            JARVIS<small>COMMAND CENTER</small>
          </span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {sections.map((name, i) => (
            <button
              key={name}
              className={page === name ? 'active' : ''}
              aria-current={page === name ? 'page' : undefined}
              onClick={() => {
                setPage(name);
                setSetup(false);
              }}
            >
              <span className="nav-symbol" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              {name}
              {name === 'Core' && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="small-dot" /> FOUNDATION
          <small>Phase 01 · v0.1.0</small>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            JARVIS <span>/</span> {setup ? 'SETUP' : page.toUpperCase()}
          </div>
          <div className="connection">
            <span className="small-dot" />
            {connection}
          </div>
        </header>
        <div className="content">
          <div className="eyebrow">YOUR PERSONAL INTELLIGENCE SYSTEM</div>
          <h1>
            {page === 'Core' && !setup
              ? `${greeting}, Sir.`
              : setup
                ? 'Establish your foundation.'
                : page}
          </h1>
          <p className="intro">
            {setup
              ? 'Connect the real system. Every step reflects actual implementation.'
              : page === 'Core'
                ? 'A clean beginning. Your command center is waiting to be configured.'
                : empty[page][1]}
          </p>
          {setup ? (
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
                    required
                    minLength={64}
                    maxLength={64}
                  />
                  <p className="hint">
                    Held only in memory for this session. This is bootstrap
                    access; owner identity is not yet implemented.
                  </p>
                  <button
                    className="primary"
                    disabled={busy || token.length !== 64}
                  >
                    {busy ? 'Verifying…' : 'Verify Core & save progress'}
                    <span aria-hidden="true">↗</span>
                  </button>
                </form>
                <div role="status" aria-live="polite">
                  {state?.core === 'verified' && (
                    <p className="success">
                      Core verified. Progress is saved in PostgreSQL. Owner and
                      security setup remain incomplete.
                    </p>
                  )}
                  {error && <p className="error">{error}</p>}
                </div>
              </div>
              <ol className="steps">
                {[
                  'JARVIS Core',
                  'Owner Identity',
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
                          : 'Planned · not implemented'}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : page === 'Core' ? (
            <>
              <section className="hero panel">
                <div className="hero-copy">
                  <div className="eyebrow">JARVIS CORE / FOUNDATION</div>
                  <h2>
                    Your system.
                    <br />
                    Before the first command.
                  </h2>
                  <p>
                    Connect Core to begin. Devices, voice, and capabilities will
                    remain inactive until their future setup is complete.
                  </p>
                  <button className="primary" onClick={() => setSetup(true)}>
                    Begin Setup <span aria-hidden="true">↗</span>
                  </button>
                  <div className="hero-note">
                    No devices enrolled. No actions authorized.
                  </div>
                </div>
                <div className="presence" aria-hidden="true">
                  <div className="axis horizontal" />
                  <div className="axis vertical" />
                  <div className="orb">
                    <span>J</span>
                  </div>
                  <span className="presence-label">AWAITING CONFIGURATION</span>
                </div>
              </section>
              <div className="section-heading">
                <h2>System overview</h2>
                <span>INITIAL STATE</span>
              </div>
              <div className="cards">
                {[
                  [
                    'Core',
                    state?.core === 'verified' ? 'Verified' : 'Not configured',
                    'Connection & database',
                  ],
                  ['Devices', 'No enrolled devices', 'Trusted device network'],
                  [
                    'Assistant',
                    'Voice not configured',
                    'Conversation & presence',
                  ],
                  ['Calls', 'Phone Link not configured', 'Calls & messages'],
                  ['Missions', 'No missions yet', 'Planning & execution'],
                  ['Security', 'Setup required', 'Identity & permissions'],
                ].map(([name, status, description]) => (
                  <button
                    className="card"
                    key={name}
                    onClick={() => setPage(name as Section)}
                  >
                    <div className="card-top">
                      {name}
                      <span aria-hidden="true">↗</span>
                    </div>
                    <h3>{status}</h3>
                    <p>{description}</p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <section className="empty panel">
              <div className="empty-mark" aria-hidden="true">
                {page.slice(0, 1)}
              </div>
              <div className="eyebrow">{page.toUpperCase()} / FOUNDATION</div>
              <h2>{empty[page][0]}</h2>
              <p>{empty[page][1]}</p>
              {(page === 'Diagnostics' ||
                page === 'Security' ||
                page === 'Devices') && (
                <button className="secondary" onClick={() => setSetup(true)}>
                  View setup
                </button>
              )}
              {page === 'Diagnostics' && token && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void connect()}
                >
                  Check connection
                </button>
              )}
              <div role="status">
                {error && <p className="error">{error}</p>}
              </div>
            </section>
          )}
          <footer>
            <span>DESIGNED FOR DELIBERATE ACTION</span>
            <span>Local foundation · macOS + Windows</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
