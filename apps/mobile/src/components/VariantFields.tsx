/** Campos de UNA variante (alta de producto, "agregar variante" y "agregar como variante"). Cada variante lleva su propio código de barras. */
import React, { useState } from 'react';
import { FIELD_HELP, autoVariantLabel } from '@amara/shared';
import { Button, Card, Chip, ChipRow, Field, H2, Muted } from './ui';
import { CameraScanner } from './CameraScanner';

export interface VariantDraft { label: string; barcode: string; cost: string; price: string; min: string; qty: string }
export const emptyVariant = (label = ''): VariantDraft => ({ label, barcode: '', cost: '', price: '', min: '0', qty: '' });

/** Nombre que se usa si no se escribe uno (lo da el sistema: «Única» o «Variante N»). */
export { autoVariantLabel };

export function VariantFields({ index, total, v, onChange, location, onLocation, showLocation, autoLabel }: {
  /** Nombre automático (por omisión «Única» o «Variante N»). */
  autoLabel?: string;
  index: number;
  total: number;
  v: VariantDraft;
  onChange: (next: VariantDraft) => void;
  location?: string;
  onLocation?: (t: string) => void;
  showLocation?: boolean;
}) {
  const [scanning, setScanning] = useState(false);
  const [noCode, setNoCode] = useState(false);
  const auto = autoLabel ?? autoVariantLabel(index, total);
  const set = (k: keyof VariantDraft) => (t: string) => onChange({ ...v, [k]: t });
  return (
    <Card tone="gold">
      <H2>{total > 1 ? `Variante ${index + 1} de ${total}` : 'Variante'}</H2>
      <Field label={`Nombre de la variante (opcional) — automático: «${auto}»`} value={v.label} placeholder={auto} onChangeText={set('label')} autoCapitalize="sentences" hint={`${FIELD_HELP.variant} Si lo dejas vacío, el sistema la llama «${auto}».`} />
      <Muted>Código de barras de esta variante:</Muted>
      <ChipRow>
        <Chip label="Nuevo código" selected={!noCode} onPress={() => { setNoCode(false); setScanning(true); }} />
        <Chip label="Sin código propio" selected={noCode} onPress={() => { setNoCode(true); setScanning(false); onChange({ ...v, barcode: '' }); }} />
      </ChipRow>
      {noCode ? (
        <Muted>Esta variante no tendrá código de barras del fabricante: el sistema le da un código interno para imprimir su etiqueta. (Dos variantes no pueden compartir el mismo código de barras porque la caja no sabría cuál se está vendiendo.)</Muted>
      ) : (
        <>
          <Field label="Código de barras" value={v.barcode} onChangeText={set('barcode')} autoCapitalize="none" autoCorrect={false} hint={FIELD_HELP.barcode} />
          <Button title={scanning ? 'Cerrar cámara' : 'Escanear código de barras'} variant="secondary" onPress={() => setScanning((s) => !s)} />
          {scanning ? <CameraScanner height={200} onScan={(d) => { onChange({ ...v, barcode: d }); setScanning(false); }} /> : null}
        </>
      )}
      <Field label="Costo (lo que te costó a ti, como gerente)" value={v.cost} onChangeText={set('cost')} keyboardType="decimal-pad" hint={FIELD_HELP.cost} />
      <Field label="Precio de venta" value={v.price} onChangeText={set('price')} keyboardType="decimal-pad" hint={FIELD_HELP.price} />
      <Field label="Existencia mínima" value={v.min} onChangeText={set('min')} keyboardType="number-pad" hint={FIELD_HELP.minStock} />
      <Field label="Existencia inicial en esta sucursal (1 o más)" value={v.qty} onChangeText={set('qty')} keyboardType="number-pad" hint={FIELD_HELP.qty} />
      {showLocation ? <Field label="Lugar" value={location ?? ''} onChangeText={onLocation ?? (() => undefined)} autoCapitalize="sentences" hint={FIELD_HELP.location} /> : null}
      {index === 0 && total > 1 ? <Muted>Las demás variantes se llenan abajo.</Muted> : null}
    </Card>
  );
}

/** Convierte un borrador en el cuerpo que espera el servidor; devuelve un texto de error si algo no cuadra. */
export function draftToApi(
  v: VariantDraft,
  parseMoney: (t: string) => number | null,
  parseInt0: (t: string, o: { allowZero: boolean }) => number | null,
  location?: string,
  autoLabel = 'Única',
): { variant: { label: string; unit: 'pieza'; barcode?: string; costCents: number; priceCents: number; minStock: number; location?: string }; qty: number } | string {
  const label = v.label.trim() || autoLabel;
  const name = label;
  const costCents = parseMoney(v.cost);
  const priceCents = parseMoney(v.price);
  const min = parseInt0(v.min, { allowZero: true });
  const qty = parseInt0(v.qty, { allowZero: true });
  if (costCents === null || priceCents === null) return `Variante «${name}»: escribe costo y precio válidos (por ejemplo 85.50).`;
  if (min === null) return `Variante «${name}»: el mínimo debe ser un número entero.`;
  if (qty === null || qty < 1) return `Variante «${name}»: la existencia inicial es obligatoria (1 o más, no puede quedar en 0).`;
  return { variant: { label, unit: 'pieza', barcode: v.barcode.trim() || undefined, costCents, priceCents, minStock: min, location: location?.trim() || undefined }, qty };
}
