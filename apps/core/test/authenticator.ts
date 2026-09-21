// Test-only virtual authenticator. Real P-256 signatures and WebAuthn wire data
// exercise the maintained verifier; no production verifier is mocked.
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
export function cbor(value: unknown): Buffer {
  const head = (major: number, size: number) =>
    size < 24
      ? Buffer.from([(major << 5) | size])
      : size < 256
        ? Buffer.from([(major << 5) | 24, size])
        : Buffer.from([(major << 5) | 25, size >> 8, size & 255]);
  if (typeof value === 'number')
    return head(value < 0 ? 1 : 0, value < 0 ? -1 - value : value);
  if (typeof value === 'string') {
    const b = Buffer.from(value);
    return Buffer.concat([head(3, b.length), b]);
  }
  if (Buffer.isBuffer(value))
    return Buffer.concat([head(2, value.length), value]);
  const entries =
    value instanceof Map
      ? [...value.entries()]
      : Object.entries(value as object);
  return Buffer.concat([
    head(5, entries.length),
    ...entries.flatMap(([k, v]) => [cbor(k), cbor(v)]),
  ]);
}
const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest();
export function authenticator() {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const id = randomBytes(32).toString('base64url');
  let counter = 0;
  function data(
    challenge: string,
    register: boolean,
    origin: string,
    rp: string,
    uv: boolean,
  ) {
    const client = Buffer.from(
      JSON.stringify({
        type: register ? 'webauthn.create' : 'webauthn.get',
        challenge,
        origin,
        crossOrigin: false,
      }),
    );
    const count = Buffer.alloc(4);
    count.writeUInt32BE(register ? 0 : ++counter);
    let auth = Buffer.concat([
      hash(rp),
      Buffer.from([1 | (uv ? 4 : 0) | (register ? 64 : 0)]),
      count,
    ]);
    if (register) {
      const jwk = keys.publicKey.export({ format: 'jwk' });
      const cose = cbor(
        new Map<number, unknown>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, Buffer.from(jwk.x!, 'base64url')],
          [-3, Buffer.from(jwk.y!, 'base64url')],
        ]),
      );
      auth = Buffer.concat([
        auth,
        Buffer.alloc(16),
        Buffer.from([0, 32]),
        Buffer.from(id, 'base64url'),
        cose,
      ]);
    }
    return { client, auth };
  }
  return {
    id,
    register(
      challenge: string,
      origin = 'http://localhost:4310',
      rp = 'localhost',
      uv = true,
    ) {
      const { client, auth } = data(challenge, true, origin, rp, uv);
      return {
        id,
        rawId: id,
        type: 'public-key',
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: client.toString('base64url'),
          attestationObject: cbor({
            fmt: 'none',
            attStmt: {},
            authData: auth,
          }).toString('base64url'),
          transports: ['internal'],
        },
      };
    },
    authenticate(
      challenge: string,
      origin = 'http://localhost:4310',
      rp = 'localhost',
      uv = true,
    ) {
      const { client, auth } = data(challenge, false, origin, rp, uv);
      return {
        id,
        rawId: id,
        type: 'public-key',
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON: client.toString('base64url'),
          authenticatorData: auth.toString('base64url'),
          signature: sign(
            'sha256',
            Buffer.concat([auth, hash(client)]),
            keys.privateKey,
          ).toString('base64url'),
        },
      };
    },
  };
}
