import { createHash, createPublicKey, verify } from 'node:crypto';
export function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
export function canonicalRequest(input: {
  version: string;
  deviceId: string;
  sessionId: string;
  method: string;
  path: string;
  body: string;
  timestamp: string;
  nonce: string;
  correlationId: string;
}): string {
  if (
    input.version !== '1' ||
    !/^(GET|POST)$/.test(input.method) ||
    !/^\/api\/v1\/[a-z0-9/-]+$/.test(input.path) ||
    Object.values(input).some(
      (value) => value.includes('\n') && value !== input.body,
    )
  )
    throw new Error('Unsupported canonical request');
  return [
    'JARVIS-REQUEST-V1',
    input.deviceId,
    input.sessionId,
    input.method,
    input.path,
    digest(input.body),
    input.timestamp,
    input.nonce,
    input.correlationId,
  ].join('\n');
}
export function verifySignature(
  publicKey: string,
  message: string,
  signature: string,
): boolean {
  try {
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(publicKey) ||
      !/^[A-Za-z0-9_-]{86}$/.test(signature)
    )
      return false;
    const raw = Buffer.from(publicKey, 'base64url');
    const key = createPublicKey({
      key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
      format: 'der',
      type: 'spki',
    });
    return verify(
      null,
      Buffer.from(message),
      key,
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}
export function fingerprint(publicKey: string): string {
  return digest(Buffer.from(publicKey, 'base64url'));
}
export function canonicalProof(
  id: string,
  challenge: string,
  deviceId: string,
  publicKey: string,
): string {
  return ['JARVIS-PROOF-V1', id, challenge, deviceId, publicKey].join('\n');
}
