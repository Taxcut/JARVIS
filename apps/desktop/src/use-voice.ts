import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  voiceStatusSchema,
  type VoiceSettings,
  type VoiceStatus,
} from '@jarvis/protocol';
import { z } from 'zod';
export type Voice = ReturnType<typeof useVoice>;
export function useVoice() {
  const [status, setStatus] = useState<VoiceStatus | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [runtime, setRuntime] = useState('UNAVAILABLE');
  useEffect(() => {
    if (!isTauri()) return;
    let closed = false,
      pending = false,
      lastPoll = 0;
    const update = async () => {
      if (pending || (document.hidden && Date.now() - lastPoll < 1000)) return;
      lastPoll = Date.now();
      pending = true;
      try {
        const raw = await invoke('runtime_status');
        const value = z
          .object({ state: z.string(), voice: voiceStatusSchema.optional() })
          .nullable()
          .parse(raw);
        if (!closed) {
          setStatus(value?.voice ?? null);
          setRuntime(value?.state ?? 'UNAVAILABLE');
        }
      } catch {
        if (!closed) {
          setStatus(null);
          setRuntime('UNAVAILABLE');
        }
      } finally {
        pending = false;
      }
    };
    void update();
    const timer = setInterval(() => void update(), 100);
    return () => {
      closed = true;
      clearInterval(timer);
    };
  }, []);
  async function action(command: string, args: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const reply = await invoke<{ error?: string }>(command, args);
      if (reply?.error) throw new Error(reply.error);
    } catch (e) {
      setError(
        typeof e === 'string'
          ? e
          : e instanceof Error
            ? e.message
            : 'Voice could not be updated. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    status,
    runtime,
    error,
    busy,
    native: isTauri(),
    configure: (settings: VoiceSettings) =>
      action('voice_configure', { settings }),
    control: (actionName: 'retry' | 'clear' | 'greet') =>
      action('voice_control', { action: actionName }),
  };
}
