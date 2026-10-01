// Deliberately separate from the production entry point. No identity, API or native invocation.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { IntelligenceBody, type BodyState } from '../../src/IntelligenceBody';
import '../../src/style.css';
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
createRoot(document.getElementById('root')!).render(<VisualFixture />);
