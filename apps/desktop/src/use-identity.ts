import { useEffect, useState } from 'react';
import {
  snapshotSchema,
  type Snapshot,
  type SyncState,
} from '@jarvis/protocol';
import {
  api,
  authenticate,
  connectSync,
  isTauri,
  nativeStatus,
  resume,
  type NativeIdentity,
} from './identity-client.js';
export function useIdentity(base: string) {
  const [native, setNative] = useState<NativeIdentity | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [sync, setSync] = useState<SyncState>('OFFLINE');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    setSnapshot(null);
    setAuthenticated(false);
    void nativeStatus()
      .then(async (value) => {
        if (cancelled) return;
        setNative(value);
        if (value.resumable) {
          try {
            await resume(base);
            if (!cancelled) setAuthenticated(true);
          } catch {
            if (!cancelled)
              setNotice('Sign in with your passkey to reconnect.');
          }
        }
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'Native secure storage is unavailable. Identity cannot be created safely.',
          );
      });
    return () => {
      cancelled = true;
    };
  }, [base]);
  useEffect(() => {
    if (!authenticated) return;
    return connectSync(base, setSnapshot, setSync);
  }, [authenticated, base]);
  const run = async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : typeof e === 'string'
            ? e
            : 'The operation could not be completed.',
      );
      return undefined;
    } finally {
      setBusy(false);
      setNotice('');
    }
  };
  const login = (
    mode: string,
    token: string | null = null,
    extra: Record<string, unknown> = {},
  ) =>
    run(async () => {
      setNotice(
        mode === 'pair'
          ? 'Waiting for approval on your trusted device…'
          : 'Confirm the passkey request in your system browser.',
      );
      await authenticate(base, mode, token, extra);
      setAuthenticated(true);
      setSnapshot(
        snapshotSchema.parse(
          await api(base, 'GET', '/api/v1/identity/snapshot'),
        ),
      );
    });
  const mutate = (
    input: Record<string, unknown>,
    purpose?: string,
    target?: string,
  ) =>
    run(async () => {
      let grant: string | undefined;
      if (purpose) {
        setNotice(
          'Confirm this security action with your passkey in the browser.',
        );
        grant = (await authenticate(base, 'stepup', null, { purpose, target }))
          .grant;
      }
      const result = await api(base, 'POST', '/api/v1/identity/mutate', {
        version: 1,
        ...input,
        ...(grant ? { grant } : {}),
      });
      return result as Record<string, unknown>;
    });
  const addPasskey = () =>
    run(async () => {
      if (!snapshot) return;
      setNotice(
        'Verify your existing passkey, then register the new one in your browser.',
      );
      const { grant } = await authenticate(base, 'stepup', null, {
        purpose: 'passkey.add',
        target: snapshot.owner.id,
      });
      await authenticate(base, 'add', null, { grant });
    });
  return {
    native,
    snapshot,
    sync,
    authenticated,
    busy,
    error,
    notice,
    login,
    mutate,
    addPasskey,
  };
}
export type IdentityController = ReturnType<typeof useIdentity>;
