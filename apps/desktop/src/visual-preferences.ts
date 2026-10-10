import { useEffect, useState } from 'react';
import type { Quality } from './IntelligenceBody.js';

export type VisualPreferences = {
  quality: Quality;
  startup: 'full' | 'reduced' | 'off';
  reducedMotion: boolean;
};
export const defaultVisualPreferences: VisualPreferences = {
  quality: 'HIGH',
  startup: 'full',
  reducedMotion: false,
};
export function parseVisualPreferences(raw: unknown): VisualPreferences {
  const p =
    raw && typeof raw === 'object' ? (raw as Partial<VisualPreferences>) : {};
  return {
    quality: ['CINEMATIC', 'HIGH', 'BALANCED', 'LOW_POWER'].includes(
      p.quality ?? '',
    )
      ? p.quality!
      : 'HIGH',
    startup: ['full', 'reduced', 'off'].includes(p.startup ?? '')
      ? p.startup!
      : 'full',
    reducedMotion: p.reducedMotion === true,
  };
}
function read(): VisualPreferences {
  try {
    const value = localStorage.getItem('jarvis.visualPreferences');
    return parseVisualPreferences(
      value
        ? JSON.parse(value)
        : { quality: localStorage.getItem('jarvis.visualQuality') },
    );
  } catch {
    return defaultVisualPreferences;
  }
}
export function useVisualPreferences() {
  const [preferences, setPreferences] = useState(read);
  const [systemReduced, setSystemReduced] = useState(false);
  useEffect(() => {
    const refresh = (event: Event) =>
      setPreferences(
        event instanceof CustomEvent
          ? parseVisualPreferences(event.detail)
          : read(),
      );
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => setSystemReduced(media.matches);
    motion();
    window.addEventListener('jarvis-visual-preferences', refresh);
    window.addEventListener('storage', refresh);
    media.addEventListener('change', motion);
    return () => {
      window.removeEventListener('jarvis-visual-preferences', refresh);
      window.removeEventListener('storage', refresh);
      media.removeEventListener('change', motion);
    };
  }, []);
  const reduced = preferences.reducedMotion || systemReduced;
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reduced);
  }, [reduced]);
  function update(patch: Partial<VisualPreferences>) {
    const next = parseVisualPreferences({ ...preferences, ...patch });
    setPreferences(next);
    try {
      localStorage.setItem('jarvis.visualPreferences', JSON.stringify(next));
    } catch {
      /* This window still honors the selected setting. */
    }
    window.dispatchEvent(
      new CustomEvent('jarvis-visual-preferences', { detail: next }),
    );
  }
  return { preferences, update, reduced, systemReduced };
}
