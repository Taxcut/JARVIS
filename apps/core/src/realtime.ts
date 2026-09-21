import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { syncHelloSchema, syncEventSchema } from '@jarvis/protocol';
import { digest } from '@jarvis/security/signing';
import { type Context, IdentityStore, deny } from './identity-store.js';
interface Peer {
  socket: WebSocket;
  ctx?: Context;
  sequence: string;
  busy: boolean;
  dirty: boolean;
  alive: boolean;
  timer: ReturnType<typeof setTimeout>;
}
export async function registerRealtime(
  app: FastifyInstance,
  store: IdentityStore,
) {
  await app.register(websocket, {
    options: { maxPayload: 2048, perMessageDeflate: false },
  });
  const peers = new Set<Peer>();
  let listener: PoolClient | undefined;
  let stopping = false;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  const send = (peer: Peer, message: unknown) => {
    if (peer.socket.bufferedAmount > 1024 * 1024) {
      peer.socket.close(1013, 'Slow consumer');
      return;
    }
    peer.socket.send(JSON.stringify(message));
  };
  const drain = async (peer: Peer, initial = false) => {
    if (!peer.ctx) return;
    if (peer.busy) {
      peer.dirty = true;
      return;
    }
    peer.busy = true;
    try {
      do {
        peer.dirty = false;
        const result = await store.tx(async (q) => {
          await store.current(q, peer.ctx!);
          const watermark = (
            await q.query<{ seq: string }>(
              'SELECT sync_sequence::text AS seq FROM users WHERE id=$1',
              [peer.ctx!.ownerId],
            )
          ).rows[0]!.seq;
          if (!initial && watermark === peer.sequence) return null;
          const min = (
            await q.query<{ min: string | null }>(
              'SELECT min(sequence)::text AS min FROM sync_events WHERE owner_id=$1',
              [peer.ctx!.ownerId],
            )
          ).rows[0]!.min;
          const resync =
            peer.sequence === '0' ||
            BigInt(peer.sequence) > BigInt(watermark) ||
            (min === null
              ? peer.sequence !== watermark
              : BigInt(peer.sequence) < BigInt(min) - 1n);
          const rows = resync
            ? []
            : (
                await q.query(
                  `SELECT id,version,sequence::text,type,owner_id AS "ownerId",resource_id AS "resourceId",revision,timestamp,correlation_id AS "correlationId",payload FROM sync_events WHERE owner_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 10001`,
                  [peer.ctx!.ownerId, peer.sequence],
                )
              ).rows;
          const snapshot = await store.snapshot(q, peer.ctx!);
          return {
            version: 1,
            type: resync || rows.length > 10000 ? 'snapshot' : 'update',
            fromSequence: peer.sequence,
            events:
              rows.length > 10000
                ? []
                : rows.map((row) =>
                    syncEventSchema.parse(JSON.parse(JSON.stringify(row))),
                  ),
            snapshot,
          };
        });
        if (result) {
          send(peer, result);
          peer.sequence = result.snapshot.sequence;
        }
        initial = false;
      } while (peer.dirty && peer.socket.readyState === 1);
    } catch {
      peer.socket.close(4001, 'Authentication or synchronization unavailable');
    } finally {
      peer.busy = false;
    }
  };
  let connecting = false;
  const scheduleReconnect = () => {
    if (stopping) return;
    if (reconnect) clearTimeout(reconnect);
    reconnect = setTimeout(() => {
      void connect();
    }, 2000);
  };
  const connect = async () => {
    if (stopping || connecting || listener) return;
    connecting = true;
    try {
      const client = await store.pool.connect();
      if (stopping) {
        client.release();
        return;
      }
      listener = client;
      const failed = () => {
        if (listener !== client) return;
        listener = undefined;
        client.release(true);
        for (const peer of peers) peer.socket.close(1012, 'Sync restarting');
        scheduleReconnect();
      };
      client.on('error', failed);
      client.on('end', failed);
      client.on('notification', () => {
        for (const peer of peers) void drain(peer);
      });
      await client.query('LISTEN jarvis_sync');
    } catch {
      if (listener) {
        listener.release(true);
        listener = undefined;
      }
      scheduleReconnect();
    } finally {
      connecting = false;
    }
  };
  app.addHook('onReady', connect);
  const heartbeat = setInterval(() => {
    for (const peer of peers) {
      if (!peer.alive) {
        peer.socket.terminate();
        continue;
      }
      peer.alive = false;
      peer.socket.ping();
      // Recheck expiration even when there are no mutations. This is security
      // liveness, not the primary state synchronization mechanism.
      void drain(peer);
    }
  }, 15000);
  heartbeat.unref();
  // Release the checked-out LISTEN connection before onClose hooks can end
  // the owning database pool. onClose hooks run in reverse registration order.
  app.addHook('preClose', async () => {
    stopping = true;
    clearInterval(heartbeat);
    if (reconnect) clearTimeout(reconnect);
    for (const peer of peers) {
      clearTimeout(peer.timer);
      peer.socket.terminate();
    }
    const client = listener;
    listener = undefined;
    if (client) {
      await client.query('UNLISTEN jarvis_sync').catch(() => {});
      client.release();
    }
  });
  app.get('/api/v1/realtime', { websocket: true }, (socket) => {
    if (!listener || peers.size >= 32) {
      socket.close(1013, 'Capacity unavailable');
      return;
    }
    const peer: Peer = {
      socket,
      sequence: '0',
      busy: false,
      dirty: false,
      alive: true,
      timer: setTimeout(() => socket.close(4001, 'Handshake required'), 5000),
    };
    peers.add(peer);
    socket.on('pong', () => {
      peer.alive = true;
      send(peer, { version: 1, type: 'heartbeat' });
    });
    socket.on('close', () => {
      peers.delete(peer);
      clearTimeout(peer.timer);
    });
    let handling = false;
    socket.on('message', (data) => {
      if (handling || peer.ctx) {
        socket.close(4000, 'Unexpected message');
        return;
      }
      handling = true;
      void (async () => {
        try {
          const hello = syncHelloSchema.parse(JSON.parse(data.toString()));
          const ctx = await store.tx(async (q) => {
            const ticket = (
              await q.query<{ session_id: string }>(
                'DELETE FROM sync_tickets WHERE secret_hash=$1 AND expires_at>now() RETURNING session_id',
                [digest(hello.ticket)],
              )
            ).rows[0];
            if (!ticket) return deny();
            const row = (
              await q.query<{ owner_id: string; device_id: string }>(
                'SELECT owner_id,device_id FROM sessions WHERE id=$1',
                [ticket.session_id],
              )
            ).rows[0];
            if (!row) return deny();
            const value = {
              ownerId: row.owner_id,
              deviceId: row.device_id,
              sessionId: ticket.session_id,
              correlationId: randomUUID(),
              requestId: randomUUID(),
            };
            await store.current(q, value);
            return value;
          });
          if (
            [...peers].filter((p) => p.ctx?.sessionId === ctx.sessionId)
              .length >= 4
          )
            return socket.close(1013, 'Session connection limit');
          peer.ctx = ctx;
          peer.sequence = hello.lastSequence;
          clearTimeout(peer.timer);
          await drain(peer, true);
        } catch {
          socket.close(4001, 'Handshake rejected');
        }
      })();
    });
  });
}
