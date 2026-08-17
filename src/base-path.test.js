import assert from 'node:assert/strict';
import test from 'node:test';
import { stripBasePath, withBasePath } from './base-path.js';

test('withBasePath keeps root deployment paths unchanged', () => {
  assert.equal(withBasePath('/cases.json', '/'), '/cases.json');
});

test('withBasePath prefixes subpath deployment URLs', () => {
  assert.equal(withBasePath('/cases.json', '/gpt-image-2/'), '/gpt-image-2/cases.json');
  assert.equal(withBasePath('/api/me?fresh=1', '/gpt-image-2/'), '/gpt-image-2/api/me?fresh=1');
});

test('withBasePath keeps external and browser URLs unchanged', () => {
  for (const url of ['https://example.com/a', 'http://example.com/a', 'blob:test', 'data:image/png;base64,AA']) {
    assert.equal(withBasePath(url, '/gpt-image-2/'), url);
  }
});

test('stripBasePath exposes app-relative routes', () => {
  assert.equal(stripBasePath('/gpt-image-2/community/result', '/gpt-image-2/'), '/community/result');
  assert.equal(stripBasePath('/community', '/'), '/community');
});
