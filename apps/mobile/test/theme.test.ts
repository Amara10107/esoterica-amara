import test from 'node:test';
import assert from 'node:assert/strict';
import { applyThemeToColors, colors } from '../src/theme.ts';

test('tema móvil: claro no cambia colores; oscuro y personalizado sí', () => {
  const before = { ...colors };
  applyThemeToColors({ mode: 'claro' });
  assert.deepEqual({ ...colors }, before, 'claro no toca nada');
  assert.equal(colors.card, '#FFFFFF');

  applyThemeToColors({ mode: 'personalizado', custom: { bg: '#101010', card: '#202020', surface: '#181818', text: '#EEEEEE', muted: '#AAAAAA', line: '#333333', accent: '#D3AD64', accentSoft: '#332211', primary: '#6B4A9E' } });
  assert.equal(colors.bg, '#101010');
  assert.equal(colors.card, '#202020');
  assert.equal(colors.gold, '#D3AD64');
  assert.equal(colors.dark, '#6B4A9E');
  assert.equal(colors.white, '#FFFFFF', 'white sigue siendo blanco (texto sobre botones)');
});
