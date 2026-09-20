import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect } from 'vitest';
import { App } from './App.js';
it('renders an honest disconnected first run without operational fixtures', () => {
  const html = renderToStaticMarkup(createElement(App));
  for (const text of [
    'Begin Setup',
    'Not connected',
    'No enrolled devices',
    'No missions yet',
    'Voice not configured',
    'Phone Link not configured',
    'Setup required',
  ])
    expect(html).toContain(text);
  expect(html).not.toContain('Connected · database ready');
  expect(html).not.toContain('Core verified');
  expect(html).not.toContain('test fixture');
});
