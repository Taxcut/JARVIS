import { it, expect } from 'vitest';
import { evaluatePolicy, capabilities, type PolicyContext } from './index.js';
import type { Capability } from '@jarvis/schemas';
const context: PolicyContext = {
  trusted: true,
  revoked: false,
  lockdown: false,
  grantedCapabilities: Object.keys(capabilities) as Capability[],
  rules: [],
};
it('asks by default for every known capability', () => {
  for (const id of Object.keys(capabilities)) {
    expect(evaluatePolicy(id, context)).toMatchObject({
      decision: 'ASK',
      executionAuthorized: false,
    });
  }
});
it('only permits explicit low risk allows', () => {
  expect(
    evaluatePolicy('device.status.read', {
      ...context,
      rules: [{ capability: 'device.status.read', decision: 'ALLOW' }],
    }).decision,
  ).toBe('ALLOW');
  for (const id of ['files.read', 'files.write', 'terminal.execute'] as const) {
    expect(
      evaluatePolicy(id, {
        ...context,
        rules: [{ capability: id, decision: 'ALLOW' }],
      }).decision,
    ).toBe('ASK');
  }
});
it('denies unknown, revoked, untrusted, lockdown and ungranted requests', () => {
  expect(evaluatePolicy('root.shell', context).decision).toBe('DENY');
  for (const patch of [
    { revoked: true },
    { trusted: false },
    { lockdown: true },
    { grantedCapabilities: [] },
  ]) {
    expect(
      evaluatePolicy('device.status.read', { ...context, ...patch }).decision,
    ).toBe('DENY');
  }
});
it('deny takes precedence independently of ordering', () => {
  const allow = {
    capability: 'device.status.read',
    decision: 'ALLOW',
  } as const;
  const deny = { capability: 'device.status.read', decision: 'DENY' } as const;
  for (const rules of [
    [allow, deny],
    [deny, allow],
  ])
    expect(
      evaluatePolicy('device.status.read', { ...context, rules }).decision,
    ).toBe('DENY');
});
