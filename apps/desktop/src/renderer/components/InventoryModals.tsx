/**
 * Ventanas de inventario: entrada/salida/ajuste/conteo de una variante y alta de producto nuevo.
 * Se usan desde la pantalla de Inventario y desde el modo INVENTARIO del punto de venta
 * (al escanear: pregunta cantidad, sucursal, lugar, variante y motivo).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CatalogHit } from '@amara/database';
import { FIELD_HELP, autoVariantLabel, newId, randomSkuTail, skuPrefix } from '@amara/shared';
import type { BranchRow, VariantRow } from '../../shared/ipc.ts';
import { call, errorText } from '../lib/api.ts';
import { MOVEMENT_LABEL, money, parsePesos } from '../lib/format.ts';
import { stockView } from '../lib/cart.ts';
import { useFeedback } from '../state/Feedback.tsx';
import { Banner, Field } from './Field.tsx';
import { Modal } from './Modal.tsx';

export interface InvPerms {
  canEnter: boolean;
  canMove: boolean;
  canCreateProduct: boolean;
  grantExpiresAt: string | null;
}

type MoveType = 'entrada' | 'salida' | 'ajuste' | 'conteo';

const REASONS: Record<MoveType, string[]> = {
  entrada: ['Compra a proveedor', 'Devolución de cliente', 'Traspaso recibido', 'Producto encontrado', 'Otro'],
  salida: ['Merma o daño', 'Consumo interno', 'Regalo o muestra', 'Traspaso enviado', 'Otro'],
  ajuste: ['Corrección de captura', 'Otro'],
  conteo: ['Conteo físico'],
};

export function MovementModal({
  initial, perms, branches, defaultBranchId, onClose, onDone,
}: {
  initial: CatalogHit; perms: InvPerms; branches: BranchRow[]; defaultBranchId: string; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useFeedback();
  const movementId = useRef(newId()); // mismo id al reintentar: nunca se duplica el movimiento
  const allowed: MoveType[] = perms.canMove ? ['entrada', 'salida', 'ajuste', 'conteo'] : perms.canEnter ? ['entrada'] : [];
  const readOnly = allowed.length === 0;

  const [branchId, setBranchId] = useState(defaultBranchId);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [variantId, setVariantId] = useState(initial.variantId);
  const [type, setType] = useState<MoveType>(allowed[0] ?? 'entrada');
  const [qtyText, setQtyText] = useState('1');
  const [preset, setPreset] = useState(REASONS[allowed[0] ?? 'entrada'][0]!);
  const [reasonText, setReasonText] = useState('');
  const [location, setLocation] = useState(initial.location ?? '');
  const [locationTouched, setLocationTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    call('catalog:variants', { productId: initial.productId, branchId })
      .then((v) => alive && setVariants(v))
      .catch((e) => alive && setError(errorText(e)));
    return () => {
      alive = false;
    };
  }, [initial.productId, branchId]);

  const current = variants.find((v) => v.variantId === variantId);
  const branch = branches.find((b) => b.id === branchId);
  const locations = useMemo(() => Array.from(new Set([...(branch?.locations ?? []), ...(current?.location ? [current.location] : [])])), [branch, current]);

  // Al cambiar de variante se sugiere su lugar (si la persona no escribió uno distinto).
  useEffect(() => {
    if (!locationTouched && current) setLocation(current.location ?? '');
  }, [current, locationTouched]);

  const q = Number(qtyText);
  const qtyOk = Number.isInteger(q) && (type === 'ajuste' ? q !== 0 : type === 'conteo' ? q >= 0 : q > 0);
  const currentQty = current?.qty ?? 0;
  const resulting = type === 'entrada' ? currentQty + q : type === 'salida' ? currentQty - q : type === 'ajuste' ? currentQty + q : q;
  const reason = preset === 'Otro' ? reasonText.trim() : preset;
  const dirty = !readOnly && (qtyText !== '1' || reasonText !== '' || variantId !== initial.variantId || branchId !== defaultBranchId || type !== allowed[0] || locationTouched);

  const changeType = (t: MoveType) => {
    setType(t);
    setPreset(REASONS[t][0]!);
    setReasonText('');
    setQtyText(t === 'conteo' ? String(currentQty) : '1');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!qtyOk) return setError('Escribe una cantidad válida.');
    if (reason.length < 3) return setError('Escribe el motivo del movimiento.');
    setBusy(true);
    setError(null);
    try {
      const r = await call('inventory:move', { id: movementId.current, branchId, variantId, type, qty: q, reason, location: location.trim() || undefined });
      toast('ok', `${MOVEMENT_LABEL[type]} registrada. Existencia ahora: ${r.newQty}.`);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={readOnly ? 'Consulta de producto' : 'Movimiento de inventario'}
      onClose={onClose}
      dirty={dirty}
      busy={busy}
      footer={
        readOnly ? (
          <button className="btn btn-gold" onClick={onClose}>Cerrar</button>
        ) : (
          <>
            <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="btn btn-gold" form="mov-form" type="submit" disabled={busy || !qtyOk || reason.length < 3}>
              {busy ? 'Guardando...' : 'Registrar'}
            </button>
          </>
        )
      }
    >
      <div className="prodhead">
        <div className="prodhead-name">{initial.productName}</div>
        <div className="muted">{initial.category} - {initial.type}</div>
      </div>
      {readOnly && !perms.canEnter && (
        <Banner kind="info">Tu usuario solo puede consultar. Para dar entrada de mercancía el gerente debe darte un permiso temporal.</Banner>
      )}
      {!perms.canMove && perms.canEnter && perms.grantExpiresAt && (
        <Banner kind="info">Permiso temporal de entradas vigente hasta las {new Date(perms.grantExpiresAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}.</Banner>
      )}
      <form id="mov-form" onSubmit={submit} className="stack">
        <div className="grid2">
          <Field label="Sucursal">
            <select className="inp" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={readOnly || branches.length < 2}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Variante">
            <select className="inp" value={variantId} onChange={(e) => { setVariantId(e.target.value); setLocationTouched(false); }} disabled={readOnly && variants.length < 2}>
              {variants.length === 0 && <option value={initial.variantId}>{initial.label}</option>}
              {variants.map((v) => <option key={v.variantId} value={v.variantId}>{v.label} ({stockView(v.qty).soldOut ? 'sin existencia' : `${stockView(v.qty).shown} en existencia`})</option>)}
            </select>
          </Field>
        </div>
        <div className="stat-row">
          <div>
            <span className="muted">Existencia actual</span>
            <div className="stat-big">{stockView(currentQty).shown}</div>
            {stockView(currentQty).inherited && <div className="warn-text small">Existencia por corregir (el sistema tenía un saldo negativo). Haz un conteo físico.</div>}
          </div>
          <div><span className="muted">Precio</span><div className="stat-big">{money(current?.priceCents ?? initial.priceCents)}</div></div>
          <div><span className="muted">Código</span><div className="mono">{current?.internalCode ?? initial.internalCode}</div></div>
        </div>
        {!readOnly && (
          <>
            <div className="grid2">
              <Field label="Tipo de movimiento">
                <select className="inp" value={type} onChange={(e) => changeType(e.target.value as MoveType)} disabled={allowed.length === 1}>
                  {allowed.map((t) => <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>)}
                </select>
              </Field>
              <Field
                label={type === 'conteo' ? 'Cantidad contada' : type === 'ajuste' ? 'Cantidad (con signo, ej. -2)' : 'Cantidad'}
                error={qtyText !== '' && !qtyOk ? 'Cantidad no válida' : null}
              >
                <input className="inp inp-lg" inputMode="numeric" value={qtyText} onChange={(e) => setQtyText(e.target.value)} autoFocus onFocus={(e) => e.target.select()} />
              </Field>
            </div>
            {qtyOk && (
              <div className="preview">
                {type === 'conteo' ? `Diferencia contra el sistema: ${q - currentQty >= 0 ? '+' : ''}${q - currentQty}. ` : ''}
                Existencia resultante: <strong>{Math.max(0, resulting)}</strong>
                {resulting < 0 && <span className="neg"> (no puede quedar por debajo de cero: revisa la cantidad)</span>}
              </div>
            )}
            <div className="grid2">
              <Field label="Lugar (ubicación)">
                <input className="inp" list="mov-locations" value={location} onChange={(e) => { setLocation(e.target.value); setLocationTouched(true); }} />
                <datalist id="mov-locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
              </Field>
              <Field label="Motivo">
                <select className="inp" value={preset} onChange={(e) => setPreset(e.target.value)}>
                  {REASONS[type].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
            </div>
            {preset === 'Otro' && (
              <Field label="Escribe el motivo" hint="Mínimo 3 letras">
                <input className="inp" value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
              </Field>
            )}
          </>
        )}
        {error && <Banner kind="error">{error}</Banner>}
      </form>
    </Modal>
  );
}

interface VariantDraft { label: string; barcode: string; cost: string; price: string; minStock: string; qty: string }
const emptyVariant = (label = ''): VariantDraft => ({ label, barcode: '', cost: '', price: '', minStock: '0', qty: '' });

export function NewProductModal({
  initialCode, branches, defaultBranchId, onClose, onCreated, onAsVariant,
}: {
  initialCode: string; branches: BranchRow[]; defaultBranchId: string; onClose: () => void; onCreated: () => void;
  /** v2.3.4: el código leído es de otra presentación de un producto que ya existe. */
  onAsVariant?: (barcode: string) => void;
}) {
  const { toast } = useFeedback();
  const [f, setF] = useState({ name: '', type: '', category: '', sku: '', brand: '', description: '', branchId: defaultBranchId, location: '' });
  const [variants, setVariants] = useState<VariantDraft[]>(() => [{ ...emptyVariant(''), barcode: initialCode }]);
  const [focusIdx, setFocusIdx] = useState(0); // a esta variante se asigna el código que lea el escáner
  const baseline = useRef(JSON.stringify({ f, variants }));
  const [codeWarn, setCodeWarn] = useState<Record<number, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // v2.4: el SKU se llena solo con el tipo y el nombre (editable); la parte al azar se genera una vez.
  const skuTail = useRef(randomSkuTail());
  const autoSku = (type: string, name: string) => `${skuPrefix(type, name)}-${skuTail.current}`;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((p) => {
      const next = { ...p, [k]: e.target.value };
      if ((k === 'type' || k === 'name') && (p.sku === '' || p.sku === autoSku(p.type, p.name))) next.sku = autoSku(next.type, next.name);
      return next;
    });
  const setV = (i: number, patch: Partial<VariantDraft>) => setVariants((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const setCount = (n: number) =>
    setVariants((vs) => (n <= vs.length ? vs.slice(0, n) : [...vs, ...Array.from({ length: n - vs.length }, () => emptyVariant())]));

  const parsed = variants.map((v) => ({
    cost: parsePesos(v.cost), price: parsePesos(v.price), min: Number(v.minStock), qty: Number(v.qty),
  }));
  const problems = [
    f.name.trim().length < 2 && 'el nombre',
    !f.type.trim() && 'el tipo',
    !f.category.trim() && 'la categoría',
    !f.sku.trim() && 'el SKU',
    ...variants.flatMap((v, i) => {
      const p = parsed[i]!;
      const tag = variants.length > 1 ? ` (variante ${i + 1})` : '';
      return [
        (p.cost === null || Number.isNaN(p.cost)) && `el costo${tag}`,
        (p.price === null || Number.isNaN(p.price)) && `el precio${tag}`,
        (!Number.isInteger(p.min) || p.min < 0) && `el mínimo${tag}`,
        (v.qty.trim() === '' || !Number.isInteger(p.qty) || p.qty < 1) && `la existencia inicial, obligatoria y mayor a 0${tag}`,
      ];
    }),
  ].filter(Boolean) as string[];
  const anyWarn = Object.values(codeWarn).some(Boolean);

  const checkCode = async (i: number, code: string) => {
    const c = code.trim();
    if (!c) return setCodeWarn((w) => ({ ...w, [i]: null }));
    const dupInForm = variants.some((v, j) => j !== i && v.barcode.trim() === c);
    if (dupInForm) return setCodeWarn((w) => ({ ...w, [i]: 'Este código ya está en otra variante de este producto.' }));
    try {
      const r = await call('catalog:checkCode', { code: c });
      setCodeWarn((w) => ({ ...w, [i]: r.existsLocal || r.existsRemote ? 'Ese código ya existe en el catálogo.' : null }));
    } catch {
      setCodeWarn((w) => ({ ...w, [i]: null }));
    }
  };
  useEffect(() => {
    if (initialCode) void checkCode(0, initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || problems.length > 0 || anyWarn) return;
    setBusy(true);
    setError(null);
    try {
      await call('catalog:createProduct', {
        name: f.name.trim(), type: f.type.trim(), category: f.category.trim(), sku: f.sku.trim(), brand: f.brand.trim() || undefined,
        description: f.description.trim() || undefined, branchId: f.branchId, location: f.location.trim() || undefined,
        variants: variants.map((v, i) => ({
          label: v.label.trim() || autoVariantLabel(i, variants.length), barcode: v.barcode.trim() || undefined,
          costCents: parsed[i]!.cost as number, priceCents: parsed[i]!.price as number, minStock: parsed[i]!.min, initialQty: parsed[i]!.qty,
        })),
      });
      toast('ok', 'Producto creado. Se está actualizando el catálogo.');
      onCreated();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const dirty = JSON.stringify({ f, variants }) !== baseline.current;

  return (
    <Modal
      title="Nuevo producto"
      size="lg"
      onClose={onClose}
      dirty={dirty}
      busy={busy}
      onScan={(code) => { setV(focusIdx, { barcode: code }); void checkCode(focusIdx, code); }}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-gold" type="submit" form="new-product-form" disabled={busy || problems.length > 0 || anyWarn}>
            {busy ? 'Guardando...' : 'Crear producto'}
          </button>
        </>
      }
    >
      <form id="new-product-form" onSubmit={submit} className="stack">
        {initialCode && <Banner kind="info">El código <strong className="mono">{initialCode}</strong> no existía. Completa los datos para darlo de alta.</Banner>}
        <div className="grid2">
          <Field label="Nombre del producto" hint={FIELD_HELP.name}><input className="inp" value={f.name} onChange={set('name')} autoFocus /></Field>
          <Field label="SKU automático (clave interna)" hint={FIELD_HELP.sku + ' Se llena solo con el tipo; puedes cambiarlo.'}>
            <div className="row" style={{ gap: 6 }}>
              <input className="inp" value={f.sku} onChange={set('sku')} />
              <button type="button" className="btn btn-sm" onClick={() => { skuTail.current = randomSkuTail(); setF((p) => ({ ...p, sku: autoSku(p.type, p.name) })); }}>Generar otro</button>
            </div>
          </Field>
          <Field label="Tipo" hint={FIELD_HELP.type}><input className="inp" value={f.type} onChange={set('type')} /></Field>
          <Field label="Categoría" hint={FIELD_HELP.category}><input className="inp" value={f.category} onChange={set('category')} /></Field>
          <Field label="Marca (opcional)"><input className="inp" value={f.brand} onChange={set('brand')} /></Field>
          <Field label="Descripción (opcional)"><input className="inp" value={f.description} onChange={set('description')} /></Field>
        </div>

        <Field label="¿Cuántas variantes tiene?" hint="Si es una sola presentación deja 1: el sistema la llama «Única». Cada variante lleva su propio código de barras, costo, precio y existencia.">
          <select className="inp" style={{ maxWidth: 120 }} value={variants.length} onChange={(e) => setCount(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>

        {variants.map((v, i) => (
          <fieldset key={i} className="card" style={{ padding: 12 }} onFocusCapture={() => setFocusIdx(i)}>
            <legend><strong>{variants.length > 1 ? `Variante ${i + 1}` : 'Variante'}</strong>{focusIdx === i && variants.length > 1 ? ' · el escáner llena esta' : ''}</legend>
            <div className="grid3">
              <Field label="Nombre de la variante (opcional)" hint={FIELD_HELP.variant + ` Si lo dejas vacío será «${autoVariantLabel(i, variants.length)}».`}><input className="inp" value={v.label} placeholder={autoVariantLabel(i, variants.length)} onChange={(e) => setV(i, { label: e.target.value })} /></Field>
              <Field label="Código de barras" error={codeWarn[i]} hint={FIELD_HELP.barcode + ' Escanéalo con la pistola.'}>
                <div className="row" style={{ gap: 6 }}>
                  <input className="inp mono" value={v.barcode} onChange={(e) => { setV(i, { barcode: e.target.value }); setCodeWarn((w) => ({ ...w, [i]: null })); }} onBlur={(e) => void checkCode(i, e.target.value)} />
                  <button type="button" className="btn btn-sm" title="Sin código del fabricante: se usa el código interno para la etiqueta" onClick={() => { setV(i, { barcode: '' }); setCodeWarn((w) => ({ ...w, [i]: null })); }}>Sin código propio</button>
                  {onAsVariant && v.barcode.trim() !== '' && (
                    <button type="button" className="btn btn-sm" title="Este código es de otra presentación de un producto que ya existe" onClick={() => onAsVariant(v.barcode.trim())}>Agregar como variante</button>
                  )}
                </div>
              </Field>
              <Field label="Mínimo antes de avisar" hint={FIELD_HELP.minStock}><input className="inp" inputMode="numeric" value={v.minStock} onChange={(e) => setV(i, { minStock: e.target.value })} onFocus={(e) => e.target.select()} /></Field>
              <Field label="Costo ($) (lo que te costó a ti, como gerente)" hint={FIELD_HELP.cost} error={v.cost !== '' && Number.isNaN(parsed[i]!.cost) ? 'Importe no válido' : null}>
                <input className="inp" inputMode="decimal" value={v.cost} onChange={(e) => setV(i, { cost: e.target.value })} />
              </Field>
              <Field label="Precio de venta ($)" error={v.price !== '' && Number.isNaN(parsed[i]!.price) ? 'Importe no válido' : null}>
                <input className="inp" inputMode="decimal" value={v.price} onChange={(e) => setV(i, { price: e.target.value })} />
              </Field>
              <Field label="Existencia inicial (obligatoria, 1 o más)" error={v.qty !== '' && (!Number.isInteger(parsed[i]!.qty) || parsed[i]!.qty < 1) ? 'No puede quedar en 0' : null}>
                <input className="inp" inputMode="numeric" value={v.qty} onChange={(e) => setV(i, { qty: e.target.value })} onFocus={(e) => e.target.select()} />
              </Field>
            </div>
          </fieldset>
        ))}

        <div className="grid2">
          <Field label="Sucursal de la existencia inicial">
            <select className="inp" value={f.branchId} onChange={set('branchId')}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          </Field>
          <Field label="Lugar (ubicación)"><input className="inp" value={f.location} onChange={set('location')} /></Field>
        </div>
        {problems.length > 0 && f.name !== '' && <div className="muted small">Falta revisar: {problems.join(', ')}.</div>}
        {error && <Banner kind="error">{error}</Banner>}
      </form>
    </Modal>
  );
}

/** v2.2. Editar nombre, tipo, categoría y marca de un producto, o archivarlo/restaurarlo. Precios y costos se cambian en la web. */
export function EditProductModal({ hit, onClose, onDone }: { hit: CatalogHit; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback();
  const [f, setF] = useState({ name: hit.productName, type: hit.type ?? '', category: hit.category ?? '', brand: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const archived = hit.status === 'archivado';
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const valid = f.name.trim().length >= 2 && f.type.trim() !== '' && f.category.trim() !== '';

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await call('catalog:updateProduct', { productId: hit.productId, name: f.name, type: f.type, category: f.category, brand: f.brand || undefined });
      toast('ok', 'Producto actualizado.');
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    setBusy(true);
    setError(null);
    try {
      await call('catalog:archiveProduct', { productId: hit.productId, archive: !archived });
      toast('ok', archived ? 'Producto restaurado.' : 'Producto archivado (no se borra).');
      onDone();
    } catch (err) {
      setError(errorText(err));
      setConfirmArchive(false);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await call('catalog:archiveProduct', { productId: hit.productId, archive: true, remove: true });
      toast('ok', 'Producto borrado. Queda en el Historial de borrados de la web (Inventario) por si lo necesitas restaurar.');
      onDone();
    } catch (err) {
      setError(errorText(err));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Editar: ${hit.productName}`}
      size="md"
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-gold" type="submit" form="edit-product-form" disabled={busy || !valid}>{busy ? 'Guardando...' : 'Guardar cambios'}</button>
        </>
      }
    >
      <form id="edit-product-form" onSubmit={save} className="stack">
        <div className="grid2">
          <Field label="Nombre del producto"><input className="inp" value={f.name} onChange={set('name')} autoFocus /></Field>
          <Field label="Marca (opcional)"><input className="inp" value={f.brand} onChange={set('brand')} /></Field>
          <Field label="Tipo" hint="De aquí salen los Extras por tipo"><input className="inp" value={f.type} onChange={set('type')} /></Field>
          <Field label="Categoría"><input className="inp" value={f.category} onChange={set('category')} /></Field>
        </div>
        <div className="muted small">Precios y costos se cambian en la página web (piden contraseña y quedan auditados).</div>
        {error && <Banner kind="error">{error}</Banner>}
        <hr />
        {!confirmArchive ? (
          <button type="button" className="btn" onClick={() => setConfirmArchive(true)} disabled={busy}>{archived ? 'Restaurar producto' : 'Archivar producto'}</button>
        ) : (
          <Banner kind="warn">
            {archived ? 'Restaurar hace que el producto vuelva a aparecer para vender (caja, escáner y búsquedas). Su historial y existencias no cambian.' : 'Archivar NO borra nada: el producto y todo su historial de ventas se conservan y las existencias quedan tal cual. Lo que cambia es que deja de aparecer para vender (caja, escáner y búsquedas). Puedes restaurarlo cuando quieras desde la página web: Inventario → Mostrar archivados → Restaurar.'}
            <div className="row-gap">
              <button type="button" className="btn btn-gold btn-sm" onClick={() => void toggleArchive()} disabled={busy}>Sí, {archived ? 'restaurar' : 'archivar'}</button>
              <button type="button" className="btn btn-sm" onClick={() => setConfirmArchive(false)} disabled={busy}>No</button>
            </div>
          </Banner>
        )}
        {!confirmDelete ? (
          <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>Borrar producto</button>
        ) : (
          <Banner kind="warn">
            Borrar quita el producto del inventario, del catálogo y de la caja (todas sus variantes y sucursales). No se pierde la información: las ventas y tickets antiguos conservan su nombre y el producto queda en el Historial de borrados de la página web (Inventario), donde se puede restaurar.
            <div className="row-gap">
              <button type="button" className="btn btn-danger btn-sm" onClick={() => void doDelete()} disabled={busy}>Sí, borrar</button>
              <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(false)} disabled={busy}>No</button>
            </div>
          </Banner>
        )}
      </form>
    </Modal>
  );
}


/**
 * v2.3.4. Agrega una variante nueva (con SU código de barras, costo, precio y existencia inicial) a un producto que ya existe.
 * Si `product` no viene, primero se busca el producto ("Agregar como variante" tras escanear un código).
 */
export function AddVariantModal({
  product, initialCode, branches, defaultBranchId, onClose, onDone,
}: {
  product?: { productId: string; productName: string } | null; initialCode?: string; branches: BranchRow[]; defaultBranchId: string; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useFeedback();
  const [target, setTarget] = useState<{ productId: string; productName: string } | null>(product ?? null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<{ productId: string; productName: string }[]>([]);
  const [v, setV] = useState<VariantDraft>({ ...emptyVariant(), barcode: initialCode ?? '' });
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [location, setLocation] = useState('');
  const [codeWarn, setCodeWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseline = useRef(JSON.stringify(v));
  const [existing, setExisting] = useState(0); // cuántas variantes ya tiene el producto (para el nombre automático)
  useEffect(() => {
    if (!target) return;
    call('catalog:variants', { productId: target.productId, branchId }).then((r) => setExisting(r.length)).catch(() => undefined);
  }, [target, branchId]);

  useEffect(() => {
    if (target || search.trim().length < 2) { setFound([]); return; }
    const t = window.setTimeout(() => {
      call('catalog:search', { text: search.trim() }).then((hits) => {
        const seen = new Map<string, { productId: string; productName: string }>();
        for (const h of hits) if (!seen.has(h.productId)) seen.set(h.productId, { productId: h.productId, productName: h.productName });
        setFound([...seen.values()].slice(0, 8));
      }).catch(() => setFound([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [search, target]);

  const checkCode = async (code: string) => {
    const c = code.trim();
    if (!c) return setCodeWarn(null);
    try {
      const r = await call('catalog:checkCode', { code: c });
      setCodeWarn(r.existsLocal || r.existsRemote ? 'Ese código ya existe en el catálogo.' : null);
    } catch { setCodeWarn(null); }
  };
  useEffect(() => { if (initialCode) void checkCode(initialCode); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const cost = parsePesos(v.cost);
  const price = parsePesos(v.price);
  const min = Number(v.minStock);
  const qty = Number(v.qty);
  const problems = [
    !target && 'el producto',
    (cost === null || Number.isNaN(cost)) && 'el costo',
    (price === null || Number.isNaN(price)) && 'el precio',
    (!Number.isInteger(min) || min < 0) && 'el mínimo',
    (v.qty.trim() === '' || !Number.isInteger(qty) || qty < 1) && 'la existencia inicial (1 o más)',
  ].filter(Boolean) as string[];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || problems.length > 0 || codeWarn || !target) return;
    setBusy(true);
    setError(null);
    try {
      await call('catalog:addVariant', {
        productId: target.productId, branchId, location: location.trim() || undefined,
        variants: [{ label: v.label.trim() || `Variante ${existing + 1}`, barcode: v.barcode.trim() || undefined, costCents: cost as number, priceCents: price as number, minStock: min, initialQty: qty }],
      });
      toast('ok', `Variante «${v.label.trim()}» agregada a ${target.productName}.`);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={target ? `Agregar variante a ${target.productName}` : 'Agregar como variante de otro producto'}
      size="lg"
      onClose={onClose}
      dirty={JSON.stringify(v) !== baseline.current}
      busy={busy}
      onScan={(code) => { setV((x) => ({ ...x, barcode: code })); void checkCode(code); }}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-gold" type="submit" form="add-variant-form" disabled={busy || problems.length > 0 || !!codeWarn}>{busy ? 'Guardando...' : 'Guardar variante'}</button>
        </>
      }
    >
      <form id="add-variant-form" onSubmit={submit} className="stack">
        {initialCode && <Banner kind="info">El código <strong className="mono">{initialCode}</strong> será de la variante nueva. Elige de qué producto es y llena lo demás.</Banner>}
        {target ? (
          <div className="row-between">
            <div><strong>{target.productName}</strong></div>
            {!product && <button type="button" className="btn btn-sm" onClick={() => setTarget(null)}>Cambiar</button>}
          </div>
        ) : (
          <Field label="¿De qué producto es variante?" hint="Busca por nombre, variante o código.">
            <input className="inp" value={search} placeholder="Escribe al menos 2 letras" onChange={(e) => setSearch(e.target.value)} autoFocus />
            <div className="stack">
              {found.map((p) => <button type="button" key={p.productId} className="btn btn-sm" onClick={() => setTarget(p)}>{p.productName}</button>)}
            </div>
          </Field>
        )}
        <div className="grid3">
          <Field label="Nombre de la variante (opcional)" hint={FIELD_HELP.variant + ` Si lo dejas vacío será «Variante ${existing + 1}».`}><input className="inp" value={v.label} placeholder={`Variante ${existing + 1}`} onChange={(e) => setV({ ...v, label: e.target.value })} /></Field>
          <Field label="Código de barras de esta variante" error={codeWarn} hint={FIELD_HELP.barcode + ' Escanéalo con la pistola.'}>
            <input className="inp mono" value={v.barcode} onChange={(e) => { setV({ ...v, barcode: e.target.value }); setCodeWarn(null); }} onBlur={(e) => void checkCode(e.target.value)} />
          </Field>
          <Field label="Mínimo antes de avisar" hint={FIELD_HELP.minStock}><input className="inp" inputMode="numeric" value={v.minStock} onChange={(e) => setV({ ...v, minStock: e.target.value })} onFocus={(e) => e.target.select()} /></Field>
          <Field label="Costo ($) (lo que te costó a ti, como gerente)" hint={FIELD_HELP.cost}><input className="inp" inputMode="decimal" value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value })} /></Field>
          <Field label="Precio de venta ($)"><input className="inp" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} /></Field>
          <Field label="Existencia inicial (obligatoria, 1 o más)" hint={FIELD_HELP.qty}><input className="inp" inputMode="numeric" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} onFocus={(e) => e.target.select()} /></Field>
        </div>
        <div className="grid2">
          <Field label="Sucursal de la existencia inicial"><select className="inp" value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Lugar (ubicación)" hint={FIELD_HELP.location}><input className="inp" value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
        </div>
        {problems.length > 0 && <div className="muted small">Falta revisar: {problems.join(', ')}.</div>}
        {error && <Banner kind="error">{error}</Banner>}
      </form>
    </Modal>
  );
}
