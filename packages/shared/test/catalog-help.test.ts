import test from 'node:test';
import assert from 'node:assert/strict';
import { autoVariantLabel, generateSku, FIELD_HELP } from '../src/catalog-help.ts';

test('SKU automático: 3 letras del tipo sin acentos + 5 caracteres legibles', () => {
  const sku = generateSku('Imágenes', 'x');
  assert.match(sku, /^IMA-[A-HJ-NP-Z2-9]{5}$/);
  assert.match(generateSku('', 'Vela de miel'), /^VEL-/);
  assert.match(generateSku('', ''), /^PRD-/);
  assert.notEqual(generateSku('velas'), generateSku('velas'));
});
test('hay ayuda para cada campo del alta', () => {
  for (const k of ['name', 'type', 'category', 'sku', 'variant', 'barcode', 'cost', 'price', 'minStock', 'qty', 'location'] as const) assert.ok(FIELD_HELP[k].length > 10);
});

test('nombre automático de variante', () => {
  assert.equal(autoVariantLabel(0, 1), 'Única');
  assert.equal(autoVariantLabel(0, 3), 'Variante 1');
  assert.equal(autoVariantLabel(2, 3), 'Variante 3');
});
