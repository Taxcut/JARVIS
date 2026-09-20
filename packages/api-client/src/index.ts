import {
  healthSchema,
  readinessSchema,
  setupStatusSchema,
  systemSchema,
  errorSchema,
} from '@jarvis/protocol';
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly requestId?: string,
  ) {
    super(message);
  }
}
export function createClient(token: string, base = 'http://127.0.0.1:4310') {
  const url = new URL(base);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Phase 1 Core must use an HTTP loopback origin.');
  async function request<T>(
    path: string,
    parse: (value: unknown) => T,
    method = 'GET',
  ): Promise<T> {
    const response = await fetch(`${url.origin}/api/v1/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body: '{}' } : {}),
      signal: AbortSignal.timeout(5000),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const error = errorSchema.safeParse(data);
      throw new ApiError(
        error.success ? error.data.error.message : 'Core request failed.',
        response.status,
        error.success ? error.data.error.requestId : undefined,
      );
    }
    return parse(data);
  }
  return {
    health: () => request('health', healthSchema.parse),
    readiness: () => request('readiness', readinessSchema.parse),
    system: () => request('system/version', systemSchema.parse),
    setup: () => request('setup/status', setupStatusSchema.parse),
    verifyCore: () =>
      request('setup/core/verify', setupStatusSchema.parse, 'POST'),
  };
}
