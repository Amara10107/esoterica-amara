/**
 * Extras por tipo de producto (SOLO administrador). Muestra todos los tipos que hay en el inventario de este teléfono
 * (vela, pulsera, imagen...) y, dentro de cada uno, sus extras con precio. El vendedor solo ELIGE el extra al cobrar;
 * no puede cambiar el precio. Se guarda en el servidor (PUT /settings/extras) y los demás aparatos lo reciben al sincronizar.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { formatMXN, newId, sanitizeExtraCatalog, typeKey, uniqueTypes } from '@amara/shared';
import type { ExtraOption } from '@amara/shared';
import { Banner, Button, Card, Chip, ChipRow, Field, H1, H2, Loading, Muted, Row, Screen } from '../src/components/ui';
import { parseMoneyInput } from '../src/lib/money-input';
import { useApp } from '../src/state/AppContext';

export default function Extras() {
  const app = useApp();
  const { store, session, online, api } = app;
  const [saved, setSaved] = useState<ExtraOption[]>([]);
  const [items, setItems] = useState<ExtraOption[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { name: string; price: string }>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const canSave = online && !!session?.token;

  const load = useCallback(async () => {
    if (!store) return;
    let list: ExtraOption[] = await store.getExtraCatalog();
    let ts: string[] = await store.listProductTypes();
    if (canSave) {
      try {
        const [e, t] = await Promise.all([api.get<{ items?: unknown }>('/settings/extras'), api.get<{ types?: string[] }>('/settings/product-types')]);
        list = sanitizeExtraCatalog(e.items);
        ts = uniqueTypes([...ts, ...(t.types ?? [])]);
        setMsg(null);
      } catch {
        setMsg({ kind: 'warn', text: 'No se pudo leer del servidor: se muestran los extras guardados en el teléfono.' });
      }
    } else {
      setMsg({ kind: 'warn', text: 'Sin conexión: se muestran los extras guardados en el teléfono. Para cambiarlos se necesita internet.' });
    }
    setSaved(list);
    setItems(list);
    setTypes(ts);
    setLoaded(true);
  }, [store, canSave, api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const allTypes = useMemo(() => uniqueTypes([...types, ...items.map((i) => i.type)]), [types, items]);
  const dirty = JSON.stringify(items) !== JSON.stringify(saved);

  if (!session || !store) return <Loading />;
  if (!app.can('config.editar')) return <Screen><Banner kind="error" text="Solo el administrador puede configurar los extras." /></Screen>;
  if (!loaded) return <Loading />;

  const patch = (id: string, change: Partial<ExtraOption>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...change } : i)));

  function add(type: string) {
    const d = drafts[type] ?? { name: '', price: '' };
    const cents = parseMoneyInput(d.price);
    if (!d.name.trim() || cents === null) return setMsg({ kind: 'error', text: 'Escribe el nombre y el precio del extra.' });
    setItems((cur) => [...cur, { id: newId(), type, name: d.name.trim(), priceCents: cents, active: true }]);
    setDrafts((cur) => ({ ...cur, [type]: { name: '', price: '' } }));
    setMsg(null);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.put<{ items?: unknown }>('/settings/extras', { items });
      const confirmed = sanitizeExtraCatalog(res.items ?? items);
      await store!.setExtraCatalogLocal(confirmed);
      setSaved(confirmed);
      setItems(confirmed);
      setMsg({ kind: 'ok', text: 'Guardado. Los demás aparatos lo reciben al sincronizar.' });
      void app.syncNow('manual');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Extras por tipo</H1>
      <Muted>Aquí salen todos los tipos del inventario. A cada tipo le asignas sus extras y su precio. El vendedor solo elige el extra; no puede cambiar el precio.</Muted>
      {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
      {allTypes.length === 0 ? <Muted>Todavía no hay productos con tipo en el inventario.</Muted> : null}
      {allTypes.map((type) => {
        const mine = items.filter((i) => typeKey(i.type) === typeKey(type));
        const d = drafts[type] ?? { name: '', price: '' };
        return (
          <Card key={type}>
            <H2>{type}</H2>
            {mine.length === 0 ? <Muted>Sin extras todavía.</Muted> : null}
            {mine.map((i) => (
              <Card key={i.id} tone="gold">
                <Field label="Nombre" value={i.name} onChangeText={(t) => patch(i.id, { name: t })} maxLength={60} />
                <Field
                  label="Precio ($)"
                  defaultValue={(i.priceCents / 100).toFixed(2)}
                  keyboardType="decimal-pad"
                  onEndEditing={(e) => {
                    const c = parseMoneyInput(e.nativeEvent.text);
                    if (c !== null) patch(i.id, { priceCents: c });
                  }}
                />
                <Row label="Se cobra" value={formatMXN(i.priceCents)} />
                <ChipRow>
                  <Chip label={i.active ? 'Activo' : 'Desactivado'} selected={i.active} onPress={() => patch(i.id, { active: !i.active })} />
                </ChipRow>
                <Button title="Quitar" variant="danger" onPress={() => setItems((cur) => cur.filter((x) => x.id !== i.id))} />
              </Card>
            ))}
            <Field label="Nuevo extra" value={d.name} onChangeText={(t) => setDrafts((cur) => ({ ...cur, [type]: { ...d, name: t } }))} placeholder="Ej. Aceite aromático" maxLength={60} />
            <Field label="Precio ($)" value={d.price} onChangeText={(t) => setDrafts((cur) => ({ ...cur, [type]: { ...d, price: t } }))} keyboardType="decimal-pad" placeholder="0.00" />
            <Button title="Agregar extra" variant="secondary" onPress={() => add(type)} />
          </Card>
        );
      })}
      <Button title="Guardar extras" onPress={() => void save()} loading={busy} disabled={!canSave || !dirty} />
    </Screen>
  );
}
