import test from 'node:test';
import assert from 'node:assert/strict';
import { DARK_PALETTE, DEFAULT_THEME, LIGHT_PALETTE, PALETTE_KEYS, PALETTE_PRESETS, isDarkColor, normalizeHex, paletteToCssVars, paletteToMobile, resolvePalette, sanitizeTheme } from '../src/theme.ts';

test('tema: normalizeHex acepta #abc, abcdef y rechaza basura', () => {
  assert.equal(normalizeHex('#abc'), '#AABBCC');
  assert.equal(normalizeHex('d3ad64'), '#D3AD64');
  assert.equal(normalizeHex('#12345'), null);
  assert.equal(normalizeHex(null), null);
  assert.equal(normalizeHex('red'), null);
});

test('tema: sanitizeTheme usa claro por omisión y completa colores que faltan', () => {
  assert.deepEqual(sanitizeTheme(undefined).mode, 'claro');
  assert.deepEqual(sanitizeTheme({ mode: 'raro' }).mode, 'claro');
  const t = sanitizeTheme({ mode: 'personalizado', custom: { accent: '#ff0000', bg: 'nada' } });
  assert.equal(t.custom.accent, '#FF0000');
  assert.equal(t.custom.bg, LIGHT_PALETTE.bg);
  assert.equal(t.mode, 'personalizado');
});

test('tema: claro no cambia nada; oscuro y personalizado entregan paleta', () => {
  assert.equal(resolvePalette(DEFAULT_THEME), null);
  assert.deepEqual(resolvePalette({ ...DEFAULT_THEME, mode: 'oscuro' }), DARK_PALETTE);
  const c = { ...LIGHT_PALETTE, accent: '#112233' };
  assert.equal(resolvePalette({ mode: 'personalizado', custom: c })!.accent, '#112233');
});

test('tema: todas las paletas tienen los 9 colores válidos y variables CSS / móvil coherentes', () => {
  for (const p of PALETTE_PRESETS) {
    for (const k of PALETTE_KEYS) assert.ok(normalizeHex(p.palette[k]), `${p.id}.${k}`);
  }
  const css = paletteToCssVars(DARK_PALETTE);
  assert.equal(css['--bg'], DARK_PALETTE.bg);
  assert.equal(css['--gold'], DARK_PALETTE.accent);
  const m = paletteToMobile(DARK_PALETTE);
  assert.equal(m.card, DARK_PALETTE.card);
  assert.equal(m.dark, DARK_PALETTE.primary);
});

test('tema: isDarkColor', () => {
  assert.equal(isDarkColor('#000000'), true);
  assert.equal(isDarkColor('#FFFFFF'), false);
});
