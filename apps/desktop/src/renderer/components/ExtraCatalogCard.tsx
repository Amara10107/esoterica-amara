/**
 * Extras por tipo de producto (v2.1, solo gerente). Muestra TODOS los tipos que hay en el inventario de esta terminal
 * (vela, pulsera, imagen...) y, dentro de cada uno, los extras con su precio. El vendedor solo elige un extra al vender;
 * no puede cambiar el precio. Se guarda en el servidor (PUT /settings/extras) y deja copia local en esta terminal.
 */
import { useEffect, useMemo, useState } from 'react';
import { newId, typeKey, uniqueTypes } from '@amara/shared';
import type { ExtraOption } from '@amara/shared';
import { call, errorText } from '../lib/api.ts';
import { money, parsePesos } from '../lib/format.ts';
import { useFeedback } from '../state/Feedback.tsx';
import { Banner } from './Field.tsx';

export function ExtraCatalogCard() {
  const { toast } = useFeedback();
  const [saved, setSaved] = useState<ExtraOption[] | null>(null);
  const [items, setItems] = useState<ExtraOption[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { name: string; price: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    call('extrasCatalog:get')
      .then((r) => {
        setSaved(r.items);
        setItems(r.items);
        setTypes(r.types);
      })
      .catch((e) => setError(errorText(e)));
  }, []);

  // Tipos del inventario + tipos que ya tienen extras guardados (aunque hoy no haya productos de ese tipo).
  const allTypes = useMemo(() => uniqueTypes([...types, ...items.map((i) => i.type)]), [types, items]);
  const dirty = saved !== null && JSON.stringify(items) !== JSON.stringify(saved);

  const patch = (id: string, change: Partial<ExtraOption>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...change } : i)));
  const remove = (id: string) => setItems((cur) => cur.filter((i) => i.id !== id));

  const add = (type: string) => {
    const d = drafts[type] ?? { name: '', price: '' };
    const cents = parsePesos(d.price);
    if (d.name.trim().length < 1 || cents === null || Number.isNaN(cents) || cents < 0) return;
    setItems((cur) => [...cur, { id: newId(), type, name: d.name.trim(), priceCents: cents, active: true }]);
    setDrafts((cur) => ({ ...cur, [type]: { name: '', price: '' } }));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await call('extrasCatalog:set', { items });
      setSaved(r.items);
      setItems(r.items);
      if (r.savedOnServer) toast('ok', 'Extras guardados.');
      else setNote('Se guardó SOLO en esta terminal porque no hay conexión con el servidor. Cuando haya internet vuelve a guardar para que lo reciban las demás.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3>Extras por tipo de producto</h3>
      <p className="muted">Aquí salen todos los tipos que tienes en el inventario. A cada tipo le asignas sus extras y su precio. Al vender, el vendedor solo elige el extra; no puede cambiar el precio.</p>
      {error && <Banner kind="error" onClose={() => setError(null)}>{error}</Banner>}
      {note && <Banner kind="warn" onClose={() => setNote(null)}>{note}</Banner>}
      {saved === null && !error && <div className="muted">Cargando...</div>}
      {saved !== null && allTypes.length === 0 && <div className="muted">Todavía no hay productos con tipo en el inventario.</div>}
      {allTypes.map((type) => {
        const mine = items.filter((i) => typeKey(i.type) === typeKey(type));
        const d = drafts[type] ?? { name: '', price: '' };
        return (
          <div key={type} className="hist">
            <h4>{type}</h4>
            {mine.length === 0 && <div className="muted small">Sin extras todavía.</div>}
            {mine.map((i) => (
              <div key={i.id} className="row-gap">
                <input className="inp" value={i.name} maxLength={60} onChange={(e) => patch(i.id, { name: e.target.value })} aria-label="Nombre del extra" />
                <input
                  key={`${i.id}:${i.priceCents}`} className="inp" style={{ maxWidth: 110 }} inputMode="decimal" aria-label="Precio"
                  defaultValue={(i.priceCents / 100).toFixed(2)}
                  onBlur={(e) => {
                    const c = parsePesos(e.target.value);
                    if (c !== null && !Number.isNaN(c) && c >= 0) patch(i.id, { priceCents: c });
                    else e.target.value = (i.priceCents / 100).toFixed(2);
                  }}
                />
                <label className="check"><input type="checkbox" checked={i.active} onChange={(e) => patch(i.id, { active: e.target.checked })} /> Activo</label>
                <button className="btn btn-danger btn-sm" onClick={() => remove(i.id)}>Quitar</button>
              </div>
            ))}
            <div className="row-gap">
              <input className="inp" placeholder="Nuevo extra (ej. Aceite aromático)" value={d.name} maxLength={60} onChange={(e) => setDrafts((cur) => ({ ...cur, [type]: { ...d, name: e.target.value } }))} />
              <input className="inp" style={{ maxWidth: 110 }} placeholder="Precio $" inputMode="decimal" value={d.price} onChange={(e) => setDrafts((cur) => ({ ...cur, [type]: { ...d, price: e.target.value } }))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(type); } }} />
              <button className="btn" onClick={() => add(type)} disabled={!d.name.trim() || parsePesos(d.price) === null}>Agregar</button>
            </div>
            {mine.length > 0 && <div className="muted small">{mine.filter((i) => i.active).map((i) => `${i.name} ${money(i.priceCents)}`).join(' · ')}</div>}
          </div>
        );
      })}
      <div className="row-gap">
        <button className="btn btn-gold" onClick={() => void save()} disabled={!dirty || busy}>{busy ? 'Guardando...' : 'Guardar extras'}</button>
      </div>
    </section>
  );
}
