import { useEffect, useState } from 'react';
import type { Voice } from './use-voice.js';
export function BootSequence({
  voice,
  connected,
}: {
  voice: Voice;
  connected: boolean;
}) {
  const [visible, setVisible] = useState(true),
    [waited, setWaited] = useState(false);
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => setWaited(true), reduced ? 0 : 1800);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!waited) return;
    if (connected || !voice.native || voice.runtime === 'UNAVAILABLE') {
      setVisible(false);
    }
    const timeout = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(timeout);
  }, [waited, connected, voice.native, voice.runtime]);
  useEffect(() => {
    if (visible || !connected || !voice.status?.settings.enabled) return;
    void voice.control('greet'); // Runtime enforces its own 30-minute cooldown.
    // Run only once per startup, not on status telemetry updates.
  }, [visible, connected]);
  if (!visible) return null;
  return (
    <div
      className="boot-sequence"
      role="dialog"
      aria-modal="false"
      aria-label="JARVIS startup"
    >
      <div className="boot-orbit" />
      <img src="/brand/approved-j-master.png" alt="JARVIS" />
      <h2>JARVIS</h2>
      <span>PERSONAL INTELLIGENCE</span>
      <p role="status">
        {connected
          ? 'Trusted connection established.'
          : voice.runtime === 'ONLINE'
            ? 'Runtime connected. Verifying owner session…'
            : 'Preparing your workspace…'}
      </p>
      <button className="text-button" onClick={() => setVisible(false)}>
        Enter workspace <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
