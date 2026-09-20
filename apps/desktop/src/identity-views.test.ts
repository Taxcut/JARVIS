import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { IdentityViews } from './IdentityViews.js';
import type { IdentityController } from './use-identity.js';
const id = '11111111-1111-4111-8111-111111111111';
const controller: IdentityController = {
  native: null,
  sync: 'LIVE',
  authenticated: true,
  busy: false,
  error: '',
  notice: '',
  login: async () => {},
  mutate: async () => undefined,
  addPasskey: async () => {},
  snapshot: {
    version: 1,
    sequence: '1',
    owner: {
      id,
      displayName: null,
      preferredAddress: 'Sir',
      revision: 1,
      securityRevision: 1,
      securityState: 'NORMAL',
      createdAt: '2026-09-20T00:00:00.000Z',
    },
    devices: [],
    passkeys: [],
    sessions: [],
    enrollments: [],
    approvals: [],
    recoveryCodesRemaining: 0,
    audit: [],
  },
};
it('renders real empty owner/security/device/approval projections without invented operational records', () => {
  const render = (page: string, identity = controller) =>
    renderToStaticMarkup(createElement(IdentityViews, { page, identity }));
  expect(render('Owner')).toContain('Sir');
  expect(render('Security')).toContain('0 unused codes');
  expect(render('Devices')).toContain('No enrollment requests.');
  expect(render('Approvals')).toContain('No approval requests.');
  expect(render('Approvals')).toContain(
    'They do not authorize or perform execution.',
  );
  const stale = render('Owner', { ...controller, sync: 'OFFLINE' });
  expect(stale).toContain('Shown data may be stale');
  expect(stale).toContain('disabled');
  for (const page of ['Owner', 'Security', 'Devices', 'Approvals'])
    expect(render(page)).not.toMatch(
      /Security score|Demo device|Sample mission/,
    );
});
