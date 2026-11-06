/**
 * Configuración (gerente): EXTRAS POR TIPO de producto. Muestra todos los tipos que existen en el inventario
 * (GET /settings/product-types) y, dentro de cada uno, los extras con su precio (GET/PUT /settings/extras).
 * El vendedor solo elige el extra al vender: no puede cambiar el precio. Escritorio y móvil lo reciben al sincronizar.
 */
import { useEffect, useMemo, useState } from 'react';
import { formatMXN, newId, typeKey, uniqueTypes } from '@amara/shared';
import type { ExtraOption } from '@amara/shared';
import { api } from '../lib/api.ts';
import { parseMoneyInput } from '../lib/format.ts';
import { errorMessage, useAsync } from '../lib/hooks.ts';
import { Card, Empty, ErrorBox, Spinner } from './ui.tsx';
import { useToast } from '../context.tsx';

interface Loaded {
  items: ExtraOption[];
  types: string[];
}

export function ExtraCatalogCard() {
  const { notify } = useToast();
  const res = useAsync(
    async (s) => {
      const [extras, types] = await Promise.all([
        api.get<{ items?: ExtraOption[] }>('/settings/extras', undefined, s),
        api.get<{ types?: string[] }>('/settings/product-types', undefined, s),
      ]);
      return { items: extras.items ?? [], types: types.types ?? [] } as Loaded;
    },
    [],
  );
  const [saved, setSaved] = useState<ExtraOption[]>([]);
  const [items, setItems] = useState<ExtraOption[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { name: string; price: string }>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (res.data) {
      setSaved(res.data.items);
      setItems(res.data.items);
    }
  }, [res.data]);

  const allTypes = useMemo(() => uniqueTypes([...(res.data?.types ?? []), ...items.map((i) => i.type)]), [res.data, items]);
  const dirty = JSON.stringify(items) !== JSON.stringify(saved);

  const patch = (id: string, change: Partial<ExtraOption>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...change } : i)));

  const add = (type: string) => {
    const d = drafts[type] ?? { name: '', price: '' };
    const cents = parseMoneyInput(d.price);
    if (!d.name.trim() || cents === null) return;
    setItems((cur) => [...cur, { id: newId(), type, name: d.name.trim(), priceCents: cents, active: true }]);
    setDrafts((cur) => ({ ...cur, [type]: { name: '', price: '' } }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put<{ items?: ExtraOption[] }>('/settings/extras', { items });
      const confirmed = r.items ?? items;
      setSaved(confirmed);
      setItems(confirmed);
      notify('Extras guardados. Escritorio y móvil los reciben al sincronizar.');
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Extras por tipo de producto"
      actions={<button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={!dirty || busy}>{busy ? 'Guardando...' : 'Guardar extras'}</button>}
    >
      <p className="muted">
        Aquí salen todos los tipos que tienes en el inventario (vela, pulsera, imagen...). A cada tipo le asignas sus extras y su precio.
        Al vender, el vendedor solo elige el extra; no puede cambiar el precio.
      </p>
      {res.loading && !res.data && <Spinner />}
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {res.data && allTypes.length === 0 && <Empty>Todavía no hay productos con tipo en el inventario.</Empty>}
      {allTypes.map((type) => {
        const mine = items.filter((i) => typeKey(i.type) === typeKey(type));
        const d = drafts[type] ?? { name: '', price: '' };
        return (
          <div key={type} className="extra-type">
            <h4>{type}</h4>
            {mine.length === 0 && <p className="muted small">Sin extras todavía.</p>}
            {mine.map((i) => (
              <div key={i.id} className="extra-row">
                <input value={i.name} maxLength={60} aria-label="Nombre del extra" onChange={(e) => patch(i.id, { name: e.target.value })} />
                <input
                  key={`${i.id}:${i.priceCents}`}
                  defaultValue={(i.priceCents / 100).toFixed(2)}
                  inputMode="decimal"
                  aria-label="Precio"
                  onBlur={(e) => {
                    const c = parseMoneyInput(e.target.value);
                    if (c !== null) patch(i.id, { priceCents: c });
                    else e.target.value = (i.priceCents / 100).toFixed(2);
                  }}
                />
                <label className="check"><input type="checkbox" checked={i.active} onChange={(e) => patch(i.id, { active: e.target.checked })} /> Activo</label>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setItems((cur) => cur.filter((x) => x.id !== i.id))}>Quitar</button>
                {/* v2.4.18: junto a cada extra, para no tener que buscar el botón de guardar hasta arriba (ni se esconde). Guarda TODO (todos los tipos), igual que el de arriba. */}
                <button type="button" className="btn btn-sm btn-primary" onClick={save} disabled={!dirty || busy}>{busy ? 'Guardando...' : 'Guardar'}</button>
              </div>
            ))}
            <div className="extra-row">
              <input placeholder="Nuevo extra (ej. Aceite aromático)" value={d.name} maxLength={60} onChange={(e) => setDrafts((cur) => ({ ...cur, [type]: { ...d, name: e.target.value } }))} />
              <input
                placeholder="Precio $"
                inputMode="decimal"
                value={d.price}
                onChange={(e) => setDrafts((cur) => ({ ...cur, [type]: { ...d, price: e.target.value } }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(type); } }}
              />
              <button type="button" className="btn btn-sm" onClick={() => add(type)} disabled={!d.name.trim() || parseMoneyInput(d.price) === null}>Agregar</button>
            </div>
            {mine.some((i) => i.active) && <p className="muted small">{mine.filter((i) => i.active).map((i) => `${i.name} ${formatMXN(i.priceCents)}`).join(' · ')}</p>}
          </div>
        );
      })}
    </Card>
  );
}
