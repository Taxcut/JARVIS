import { invoke, isTauri } from '@tauri-apps/api/core';
import { z } from 'zod';
import {
  candidateSchema,
  snapshotSchema,
  syncEventSchema,
  type Snapshot,
  type SyncState,
  type DeviceCandidate,
} from '@jarvis/protocol';
export { isTauri };
export interface NativeIdentity {
  device: DeviceCandidate;
  fingerprint: string;
  resumable: boolean;
}
export const nativeStatus = async (): Promise<NativeIdentity> =>
  z
    .object({
      device: candidateSchema,
      fingerprint: z.string(),
      resumable: z.boolean(),
    })
    .parse(await invoke('native_status'));
export const api = (
  base: string,
  method: 'GET' | 'POST',
  path: string,
  body: unknown = {},
) => invoke<unknown>('native_api', { base, method, path, body });
export const resume = (base: string) => invoke('native_resume', { base });
export async function authenticate(
  base: string,
  mode: string,
  token: string | null = null,
  extra: Record<string, unknown> = {},
): Promise<{
  grant?: string | undefined;
  authenticated?: boolean | undefined;
  sessionId?: string | undefined;
}> {
  const { id } = z
    .object({ version: z.literal(1), id: z.uuid() })
    .parse(await invoke('native_begin', { base, mode, token, extra }));
  // Only a user-initiated, three-minute browser ceremony is polled. Authoritative
  // product state uses WebSocket events, never periodic snapshot polling.
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const result = z
      .object({
        version: z.literal(1),
        pending: z.boolean().optional(),
        grant: z.string().optional(),
        authenticated: z.boolean().optional(),
        sessionId: z.uuid().optional(),
      })
      .parse(await invoke('native_poll', { id }));
    if (!result.pending) return result;
  }
  throw new Error('Passkey ceremony expired. Please try again.');
}
export type SyncCursor = { sequence: string; snapshot: Snapshot | null };
const messageSchema = z.object({
  version: z.literal(1),
  type: z.enum(['snapshot', 'update']),
  fromSequence: z.string(),
  events: z.array(syncEventSchema),
  snapshot: snapshotSchema,
});
export function reconcile(cursor: SyncCursor, raw: unknown): SyncCursor {
  const message = messageSchema.parse(raw);
  const end = BigInt(message.snapshot.sequence),
    current = BigInt(cursor.sequence);
  if (message.type === 'snapshot')
    return { sequence: message.snapshot.sequence, snapshot: message.snapshot };
  if (end <= current) return cursor; // Duplicate batch is idempotent.
  if (message.fromSequence !== cursor.sequence) throw new Error('Replay gap');
  let previous = current;
  const ids = new Set<string>();
  for (const event of message.events) {
    if (
      BigInt(event.sequence) <= previous ||
      BigInt(event.sequence) > end ||
      ids.has(event.id) ||
      event.ownerId !== message.snapshot.owner.id
    )
      throw new Error('Out-of-order stream');
    previous = BigInt(event.sequence);
    ids.add(event.id);
  }
  if (previous !== end) throw new Error('Incomplete stream');
  return { sequence: message.snapshot.sequence, snapshot: message.snapshot };
}
export function connectSync(
  base: string,
  changed: (value: Snapshot) => void,
  status: (state: SyncState) => void,
) {
  let closed = false,
    socket: WebSocket | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  let received = Date.now(),
    attempt = 0;
  let cursor: SyncCursor = { sequence: '0', snapshot: null };
  const connect = async () => {
    if (closed) return;
    status(attempt ? 'DEGRADED' : 'CONNECTING');
    try {
      const { ticket } = z
        .object({ version: z.literal(1), ticket: z.string() })
        .parse(await api(base, 'POST', '/api/v1/sync/ticket'));
      if (closed) return;
      socket = new WebSocket(`${base.replace('http:', 'ws:')}/api/v1/realtime`);
      socket.onopen = () => {
        received = Date.now();
        status('SYNCING');
        socket?.send(
          JSON.stringify({ version: 1, ticket, lastSequence: cursor.sequence }),
        );
      };
      socket.onmessage = (event) => {
        try {
          received = Date.now();
          const value: unknown = JSON.parse(event.data as string);
          if (
            z
              .object({ version: z.literal(1), type: z.literal('heartbeat') })
              .safeParse(value).success
          )
            return;
          cursor = reconcile(cursor, value);
          if (cursor.snapshot) changed(cursor.snapshot);
          attempt = 0;
          status('LIVE');
        } catch {
          cursor = { sequence: '0', snapshot: null };
          status('DEGRADED');
          socket?.close();
        }
      };
      socket.onclose = () => {
        if (!closed) retry();
      };
      socket.onerror = () => {
        status('DEGRADED');
        socket?.close();
      };
    } catch {
      if (!closed) retry();
    }
  };
  const retry = () => {
    status(attempt >= 3 ? 'OFFLINE' : 'DEGRADED');
    if (timer) clearTimeout(timer);
    timer = setTimeout(
      () => {
        void connect();
      },
      Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)),
    );
  };
  const stale = setInterval(() => {
    if (
      socket?.readyState === WebSocket.OPEN &&
      Date.now() - received > 40000
    ) {
      status('DEGRADED');
      socket.close();
    }
  }, 5000);
  void connect();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    if (stale) clearInterval(stale);
    socket?.close();
  };
}
