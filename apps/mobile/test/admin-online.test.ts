import test from 'node:test';
import assert from 'node:assert/strict';
import { asList, buildQuery, daysAgoIso } from '../src/lib/admin-online.ts';

test('asList acepta lista, {items} o nada', () => {
  assert.deepEqual(asList([1, 2]), [1, 2]);
  assert.deepEqual(asList({ items: [3], total: 9 }), [3]);
  assert.deepEqual(asList(null), []);
  assert.deepEqual(asList({}), []);
});

test('buildQuery omite vacíos y escapa', () => {
  assert.equal(buildQuery({ a: 1, b: '', c: undefined, d: null, q: 'rosa blanca' }), '?a=1&q=rosa%20blanca');
  assert.equal(buildQuery(), '');
});

test('daysAgoIso resta días exactos', () => {
  assert.equal(daysAgoIso(30, new Date('2026-10-31T00:00:00.000Z')), '2026-10-01T00:00:00.000Z');
});
