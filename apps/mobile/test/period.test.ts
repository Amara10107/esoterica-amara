import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, isDay, mondayOf, presetRange, validateRange } from '../src/lib/period.ts';

test('periodo: lunes de la semana y rangos sugeridos', () => {
  assert.equal(mondayOf('2026-10-22'), '2026-10-19'); // jueves
  assert.equal(mondayOf('2026-10-25'), '2026-10-19'); // domingo
  assert.equal(mondayOf('2026-10-19'), '2026-10-19'); // lunes
  assert.deepEqual(presetRange('semana', '2026-10-22'), { from: '2026-10-19', to: '2026-10-22' });
  assert.deepEqual(presetRange('semana_pasada', '2026-10-22'), { from: '2026-10-12', to: '2026-10-18' });
  assert.deepEqual(presetRange('mes', '2026-10-22'), { from: '2026-10-01', to: '2026-10-22' });
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('periodo: valida fechas', () => {
  assert.equal(isDay('2026-02-30'), false);
  assert.equal(isDay('2026-10-19'), true);
  assert.equal(isDay('19/10/2026'), false);
  assert.equal(validateRange('2026-10-19', '2026-10-25'), null);
  assert.ok(validateRange('2026-10-25', '2026-10-19'));
  assert.ok(validateRange('hoy', '2026-10-19'));
});
