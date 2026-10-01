import { useEffect, useRef, useState } from 'react';
import type { Voice } from './use-voice.js';
import { useVisualPreferences } from './visual-preferences.js';
export function BootSequence({
  voice,
  connected,
}: {
  voice: Voice;
  connected: boolean;
}) {
  const { preferences, reduced } = useVisualPreferences();
  const [visible, setVisible] = useState(() => preferences.startup !== 'off');
  const greeted = useRef(false);
  const [repeat] = useState(() => {
    try {
      return localStorage.getItem('jarvis.launched') === 'yes';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('jarvis.launched', 'yes');
    } catch {
      /* Optional local preference. */
    }
  }, []);
  useEffect(() => {
    if (!visible) return;
    // Readiness wins over animation. A slow/offline launch is always skippable.
    if (
      preferences.startup === 'off' ||
      connected ||
      voice.runtime === 'ONLINE'
    ) {
      setVisible(false);
      return;
    }
    const duration =
      reduced || preferences.startup === 'reduced' ? 250 : repeat ? 2300 : 5000;
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [visible, connected, voice.runtime, preferences.startup, reduced, repeat]);
  useEffect(() => {
    if (
      visible ||
      greeted.current ||
      !connected ||
      !voice.status?.ttsReady ||
      !voice.status.settings.enabled ||
      voice.status.settings.muted
    )
      return;
    greeted.current = true;
    void voice.control('greet');
  }, [visible, connected, voice]);
  if (!visible) return null;
  const compact = reduced || preferences.startup === 'reduced';
  return (
    <div
      className={`boot-sequence ${compact ? 'boot-reduced' : ''} ${repeat ? 'boot-repeat' : ''}`}
      role="region"
      aria-label="JARVIS startup"
    >
      <div className="boot-orbit" aria-hidden="true" />
      <img src="/brand/approved-j-master.png" alt="JARVIS" />
      <h2>JARVIS</h2>
      <span>PERSONAL INTELLIGENCE</span>
      <p role="status">
        {voice.runtime === 'AUTH_REQUIRED'
          ? 'Owner verification is needed. Your workspace is available.'
          : voice.runtime === 'UNAVAILABLE'
            ? 'Looking for your background runtime…'
            : 'Preparing your secure workspace…'}
      </p>
      <button className="text-button" onClick={() => setVisible(false)}>
        Enter workspace <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}
