import { describe, it, expect } from 'vitest';
import { parseEnvironment } from './index.js';
const valid = {
  DATABASE_URL: 'postgresql://localhost/jarvis',
  JARVIS_API_TOKEN: 'a'.repeat(64),
};
describe('configuration', () => {
  it('requires credentials and postgres URL', () => {
    expect(() => parseEnvironment({})).toThrow();
    expect(() =>
      parseEnvironment({ ...valid, DATABASE_URL: 'https://example.com' }),
    ).toThrow();
    expect(() =>
      parseEnvironment({ ...valid, JARVIS_API_TOKEN: 'weak' }),
    ).toThrow();
  });
  it('restricts network binding and validates optional phone', () => {
    expect(() =>
      parseEnvironment({ ...valid, JARVIS_HOST: '0.0.0.0' }),
    ).toThrow();
    expect(() =>
      parseEnvironment({ ...valid, JARVIS_OWNER_PHONE: 'invalid' }),
    ).toThrow();
    expect(parseEnvironment(valid)).toMatchObject({
      NODE_ENV: 'development',
      JARVIS_HOST: '127.0.0.1',
      JARVIS_PORT: 4310,
    });
  });
  it.each([0, 65536, 1.5])('rejects invalid port %s', (port) =>
    expect(() => parseEnvironment({ ...valid, JARVIS_PORT: port })).toThrow(),
  );
});
