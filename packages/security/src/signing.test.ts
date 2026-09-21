import { expect, it } from 'vitest';
import fixture from '../fixtures/signing-v1.json';
import { canonicalRequest, fingerprint, verifySignature } from './signing.js';
it('rejects an identity-point Ed25519 forgery', () => {
  const point = Buffer.alloc(32);
  point[0] = 1;
  const signature = Buffer.alloc(64);
  signature[0] = 1;
  expect(
    verifySignature(
      point.toString('base64url'),
      'forged',
      signature.toString('base64url'),
    ),
  ).toBe(false);
});
it('matches the native Ed25519 canonical signing fixture and rejects substitution', () => {
  expect(canonicalRequest(fixture.input)).toBe(fixture.canonical);
  expect(fingerprint(fixture.publicKey)).toBe(fixture.fingerprint);
  expect(
    verifySignature(fixture.publicKey, fixture.canonical, fixture.signature),
  ).toBe(true);
  expect(
    verifySignature(
      fixture.publicKey,
      fixture.canonical + 'x',
      fixture.signature,
    ),
  ).toBe(false);
  expect(
    verifySignature(fixture.publicKey, 'wrong key', fixture.signature),
  ).toBe(false);
  for (const input of [
    { ...fixture.input, version: '2' },
    { ...fixture.input, path: '/api/v1/test?x=1' },
    { ...fixture.input, deviceId: 'injected\nvalue' },
  ])
    expect(() => canonicalRequest(input)).toThrow();
});
