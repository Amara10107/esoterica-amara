/**
 * Modales de catálogo: alta de producto (con variantes y existencia inicial), edición de datos
 * del producto y edición de variantes. Validan con los esquemas Zod de @amara/shared antes de
 * enviar (el servidor vuelve a validar) y piden confirmación al cerrar con cambios sin guardar.
 */
import { useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { FIELD_HELP, autoVariantLabel, buildInternalCode, randomSkuTail, skuPrefix } from '@amara/shared';
import { api, ApiError } from '../lib/api.ts';
import { errorMessage, useDirty } from '../lib/hooks.ts';
import {
  buildProductEditPayload, buildProductPayload, buildVariantAddPayload, buildVariantEditPayload, emptyProductForm, emptyVariantForm,
  firstError, type FieldErrors, type ProductForm, type VariantEditForm,
} from '../lib/forms.ts';
import { centsToInput } from '../lib/format.ts';
import type { CatalogProduct, CatalogVariant } from '../lib/types.ts';
import { useBranches, useToast } from '../context.tsx';
import { Alert, Badge, Field, Modal, CloseButton } from './ui.tsx';
import { PhotoInput } from './common.tsx';

const SPEC_SUGGESTIONS = ['Material', 'Color', 'Peso', 'Dimensiones', 'Aroma', 'Origen', 'Duración', 'Uso recomendado'];

/* ------------------------------------------------- Campos generales del producto */

function ProductFields(props: {
  form: ProductForm;
  setForm: Dispatch<SetStateAction<ProductForm>>;
  errors: FieldErrors;
  categories: string[];
}) {
  const { form, setForm, errors } = props;
  // v2.4: el SKU se llena solo con el tipo y el nombre (sigue siendo editable); la parte al azar se genera una sola vez.
  const tail = useRef(randomSkuTail());
  const auto = (type: string, name: string) => `${skuPrefix(type, name)}-${tail.current}`;
  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if ((k === 'type' || k === 'name') && (f.sku === '' || f.sku === auto(f.type, f.name))) next.sku = auto(next.type, next.name);
      return next;
    });
  return (
    <>
      <div className="grid-2">
        <Field label="Nombre del producto" required hint={FIELD_HELP.name} error={errors['product.name'] ?? errors.name}>
          <input value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Tipo" required hint={FIELD_HELP.type} error={errors['product.type'] ?? errors.type}>
          <input value={form.type} maxLength={60} onChange={(e) => set('type', e.target.value)} />
        </Field>
        <Field label="Categoría" required hint={FIELD_HELP.category} error={errors['product.category'] ?? errors.category}>
          <input value={form.category} maxLength={60} list="dl-categories" onChange={(e) => set('category', e.target.value)} />
          <datalist id="dl-categories">
            {props.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="SKU (automático)" required hint={FIELD_HELP.sku + ' Se llena solo con el tipo; puedes cambiarlo.'} error={errors['product.sku'] ?? errors.sku}>
          <div className="input-action">
            <input value={form.sku} maxLength={40} onChange={(e) => set('sku', e.target.value)} />
            <button type="button" className="btn btn-sm" onClick={() => { tail.current = randomSkuTail(); set('sku', auto(form.type, form.name)); }}>
              Generar otro
            </button>
          </div>
        </Field>
        <Field label="Marca" error={errors['product.brand'] ?? errors.brand}>
          <input value={form.brand} maxLength={80} onChange={(e) => set('brand', e.target.value)} />
        </Field>
        <Field label="Descripción" error={errors['product.description'] ?? errors.description}>
          <input value={form.description} maxLength={1000} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </div>

      <fieldset className="fieldset">
        <legend>Foto (opcional)</legend>
        <PhotoInput value={form.photo} onChange={(v) => set('photo', v)} />
        {(errors['product.photo'] ?? errors.photo) && <span className="field-error">{errors['product.photo'] ?? errors.photo}</span>}
      </fieldset>

      <fieldset className="fieldset">
        <legend>Especificaciones</legend>
        <p className="muted small">Datos configurables en pares nombre-valor (por ejemplo, Material: cera de soya).</p>
        <datalist id="dl-specs">
          {SPEC_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {form.specs.map((s, i) => (
          <div className="spec-row" key={i}>
            <input
              aria-label="Nombre de la especificación"
              placeholder="Nombre"
              list="dl-specs"
              maxLength={60}
              value={s.key}
              onChange={(e) => set('specs', form.specs.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
            />
            <input
              aria-label="Valor de la especificación"
              placeholder="Valor"
              maxLength={300}
              value={s.value}
              onChange={(e) => set('specs', form.specs.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
            />
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('specs', form.specs.filter((_, j) => j !== i))}>
              Quitar
            </button>
          </div>
        ))}
        {(errors['product.specs'] ?? errors.specs) && <span className="field-error">{errors['product.specs'] ?? errors.specs}</span>}
        <button type="button" className="btn btn-sm" onClick={() => set('specs', [...form.specs, { key: '', value: '' }])}>
          Agregar especificación
        </button>
      </fieldset>

      <Field label="Observaciones" error={errors['product.notes'] ?? errors.notes}>
        <textarea rows={2} value={form.notes} maxLength={500} onChange={(e) => set('notes', e.target.value)} />
      </Field>
    </>
  );
}

/* --------------------------------------------------------------- Alta de producto */

export function ProductCreateModal(props: { categories: string[]; onClose: () => void; onSaved: () => void; onAsVariant?: (barcode: string) => void }) {
  const { branches } = useBranches();
  const { notify } = useToast();
  const [form, setForm] = useState<ProductForm>(() => emptyProductForm(branches.length === 1 ? branches[0]!.id : ''));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dupCodes, setDupCodes] = useState<Record<number, boolean>>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = useDirty(form);

  const setVariant = (i: number, patch: Partial<ProductForm['variants'][number]>) =>
    setForm((f) => ({ ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

  // Selector "cuántas variantes": agrega cajas vacías o quita las últimas.
  const setVariantCount = (n: number) =>
    setForm((f) => {
      if (n === f.variants.length) return f;
      if (n < f.variants.length) return { ...f, variants: f.variants.slice(0, n) };
      const extra = Array.from({ length: n - f.variants.length }, () => emptyVariantForm(branches.length === 1 ? branches[0]!.id : ''));
      return { ...f, variants: [...f.variants, ...extra] };
    });

  // Pregunta al servidor si el código ya existe (el servidor sigue siendo quien decide al guardar).
  const checkCode = async (i: number, code: string) => {
    const c = code.trim();
    if (!c) {
      setDupCodes((d) => ({ ...d, [i]: false }));
      return;
    }
    try {
      const r = await api.get<{ duplicate: boolean }>('/catalog/codes/check', { code: c });
      setDupCodes((d) => ({ ...d, [i]: !!r.duplicate }));
    } catch {
      /* si falla la verificación, el servidor lo validará al guardar */
    }
  };

  const generateCode = async (i: number) => {
    try {
      const r = await api.post<{ code?: string; seq?: number }>('/catalog/codes/next', {});
      const code = r.code ?? (typeof r.seq === 'number' ? buildInternalCode(r.seq) : '');
      if (!code) throw new Error('El servidor no devolvió un código.');
      setVariant(i, { barcode: code });
      setDupCodes((d) => ({ ...d, [i]: false }));
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError('');
    const r = buildProductPayload(form);
    const errs = { ...r.errors };
    Object.entries(dupCodes).forEach(([i, dup]) => {
      if (dup) errs[`variants.${i}.barcode`] = 'Este código ya está registrado en otro producto';
    });
    // La existencia inicial es obligatoria: cada variante necesita al menos 1 pieza en alguna sucursal.
    form.variants.forEach((v, i) => {
      const total = v.stock.reduce((a, st) => a + (st.branchId && /^\d+$/.test(st.qty.trim()) ? Number(st.qty.trim()) : 0), 0);
      if (total < 1) errs[`variants.${i}.stock.0.qty`] = 'Obligatorio: escribe una existencia inicial de 1 o más (y elige la sucursal)';
    });
    setErrors(errs);
    if (!r.payload || Object.keys(errs).length > 0) {
      setServerError(`Revisa el formulario: ${firstError(errs) ?? 'hay datos por corregir'}`);
      return;
    }
    setBusy(true);
    try {
      await api.post('/catalog/products', r.payload);
      notify('Producto creado.');
      props.onSaved();
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Nuevo producto"
      size="xl"
      dirty={dirty}
      onClose={props.onClose}
      footer={
        <>
          <CloseButton label="Cancelar" disabled={busy} />
          <button type="submit" form="product-create" className="btn btn-primary" disabled={busy}>
            {busy ? 'Guardando...' : 'Guardar producto'}
          </button>
        </>
      }
    >
      <form id="product-create" className="form" onSubmit={submit} noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <ProductFields form={form} setForm={setForm} errors={errors} categories={props.categories} />

        <h3 className="section-title">Variantes (tamaño o presentación)</h3>
        <Field label="¿Cuántas variantes tiene este producto?" hint="Si es una sola presentación deja 1: el sistema la llama «Única» (no tienes que escribirlo). Cada variante lleva su propio código de barras, costo, precio y existencia.">
          <select
            aria-label="Número de variantes"
            value={form.variants.length}
            onChange={(e) => setVariantCount(Number(e.target.value))}
            style={{ maxWidth: 140 }}
          >
            {Array.from({ length: 12 }, (_, k) => k + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Alert tone="info">
          El código QR de cada variante se genera automáticamente al guardar (contiene solo su identificador). El código de barras puede ser
          el del fabricante o uno interno; luego podrás imprimir ambas etiquetas en la sección Etiquetas.
        </Alert>
        {form.variants.map((v, i) => (
          <fieldset className="fieldset variant-box" key={i}>
            <legend>
              Variante {i + 1}
              {form.variants.length > 1 && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setForm((f) => ({ ...f, variants: f.variants.filter((_, j) => j !== i) }))}
                >
                  Quitar variante
                </button>
              )}
            </legend>
            <div className="grid-3">
              <Field label="Nombre de la variante (opcional)" hint={FIELD_HELP.variant + ` Si lo dejas vacío, el sistema la llama «${autoVariantLabel(i, form.variants.length)}».`} error={errors[`variants.${i}.label`]}>
                <input value={v.label} maxLength={60} placeholder={autoVariantLabel(i, form.variants.length)} onChange={(e) => setVariant(i, { label: e.target.value })} />
              </Field>
              <Field label="Unidad" error={errors[`variants.${i}.unit`]}>
                <input value={v.unit} maxLength={20} onChange={(e) => setVariant(i, { unit: e.target.value })} />
              </Field>
              <Field label="Código de barras" hint={FIELD_HELP.barcode + ' Haz clic en el cuadro y escanea con la pistola.'} error={errors[`variants.${i}.barcode`]}>
                <div className="input-action">
                  <input
                    value={v.barcode}
                    maxLength={40}
                    onChange={(e) => {
                      setVariant(i, { barcode: e.target.value });
                      setDupCodes((d) => ({ ...d, [i]: false }));
                    }}
                    onBlur={(e) => checkCode(i, e.target.value)}
                  />
                  <button type="button" className="btn btn-sm" title="Sin código del fabricante: se usa el código interno para la etiqueta" onClick={() => { setVariant(i, { barcode: '' }); setDupCodes((d) => ({ ...d, [i]: false })); }}>
                    Sin código propio
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => generateCode(i)}>
                    Generar interno
                  </button>
                  {props.onAsVariant && v.barcode.trim() !== '' && (
                    <button type="button" className="btn btn-sm btn-ghost" title="Este código es de otra presentación de un producto que ya existe" onClick={() => props.onAsVariant?.(v.barcode.trim())}>
                      Agregar como variante
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Costo (MXN)" required hint="Costo = lo que te costó a ti, como gerente (no es el precio al público)" error={errors[`variants.${i}.costCents`]}>
                <input inputMode="decimal" placeholder="0.00" value={v.cost} onChange={(e) => setVariant(i, { cost: e.target.value })} />
              </Field>
              <Field label="Precio de venta (MXN)" required error={errors[`variants.${i}.priceCents`]}>
                <input inputMode="decimal" placeholder="0.00" value={v.price} onChange={(e) => setVariant(i, { price: e.target.value })} />
              </Field>
              <Field label="Existencia mínima" hint={FIELD_HELP.minStock} error={errors[`variants.${i}.minStock`]}>
                <input inputMode="numeric" value={v.minStock} onChange={(e) => setVariant(i, { minStock: e.target.value })} />
              </Field>
            </div>
            <Field label="Lugar habitual" hint="Vitrina, estante, bodega..." error={errors[`variants.${i}.location`]}>
              <input value={v.location} maxLength={60} onChange={(e) => setVariant(i, { location: e.target.value })} />
            </Field>

            <div className="sub-title">Existencia inicial por sucursal (obligatoria: debe haber al menos 1, no puede quedar en 0)</div>
            {v.stock.map((s, j) => {
              const locs = branches.find((b) => b.id === s.branchId)?.locations ?? [];
              const upd = (patch: Partial<typeof s>) =>
                setVariant(i, { stock: v.stock.map((x, k) => (k === j ? { ...x, ...patch } : x)) });
              return (
                <div className="stock-row" key={j}>
                  <Field label="Sucursal" error={errors[`variants.${i}.stock.${j}.branchId`]}>
                    <select value={s.branchId} onChange={(e) => upd({ branchId: e.target.value })}>
                      <option value="">Elige una sucursal</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cantidad" error={errors[`variants.${i}.stock.${j}.qty`]}>
                    <input inputMode="numeric" value={s.qty} onChange={(e) => upd({ qty: e.target.value })} />
                  </Field>
                  <Field label="Lugar" error={errors[`variants.${i}.stock.${j}.location`]}>
                    <input value={s.location} list={`dl-loc-${i}-${j}`} maxLength={60} onChange={(e) => upd({ location: e.target.value })} />
                    <datalist id={`dl-loc-${i}-${j}`}>
                      {locs.map((l) => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                  </Field>
                  {v.stock.length > 1 && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setVariant(i, { stock: v.stock.filter((_, k) => k !== j) })}>
                      Quitar
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setVariant(i, { stock: [...v.stock, { branchId: '', qty: '0', location: '' }] })}
            >
              Agregar otra sucursal
            </button>
          </fieldset>
        ))}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------- Edición de producto */

export function productToForm(p: CatalogProduct): ProductForm {
  return {
    name: p.name,
    type: p.type,
    category: p.category,
    sku: p.sku,
    brand: p.brand ?? '',
    description: p.description ?? '',
    notes: p.notes ?? '',
    photo: p.photo ?? '',
    specs: Object.entries(p.specs ?? {}).map(([key, value]) => ({ key, value })),
    variants: [],
  };
}

export function ProductEditModal(props: { product: CatalogProduct; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const [form, setForm] = useState<ProductForm>(() => productToForm(props.product));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = useDirty(form);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError('');
    const r = buildProductEditPayload(form);
    setErrors(r.errors);
    if (!r.payload) {
      setServerError(`Revisa el formulario: ${firstError(r.errors) ?? 'hay datos por corregir'}`);
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/catalog/products/${props.product.id}`, r.payload);
      notify('Producto actualizado.');
      props.onSaved();
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Editar producto: ${props.product.name}`}
      size="lg"
      dirty={dirty}
      onClose={props.onClose}
      footer={
        <>
          <CloseButton label="Cancelar" disabled={busy} />
          <button type="submit" form="product-edit" className="btn btn-primary" disabled={busy || !dirty}>
            {busy ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <form id="product-edit" className="form" onSubmit={submit} noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <ProductFields form={form} setForm={setForm} errors={errors} categories={props.categories} />
        <p className="muted small">Los cambios quedan en la auditoría. Para modificar precios, costos o mínimos edita la variante.</p>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------- Edición de variante */

export function VariantEditModal(props: { product: CatalogProduct; variant: CatalogVariant; onClose: () => void; onSaved: () => void }) {
  const { notify } = useToast();
  const v = props.variant;
  const [form, setForm] = useState<VariantEditForm>({
    label: v.label,
    unit: v.unit,
    barcode: v.barcode ?? '',
    cost: centsToInput(v.costCents),
    price: centsToInput(v.priceCents),
    minStock: String(v.minStock),
    location: v.location ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = useDirty(form);
  const set = (patch: Partial<VariantEditForm>) => setForm((f) => ({ ...f, ...patch }));
  const preview = buildVariantEditPayload(form, v);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError('');
    const r = buildVariantEditPayload(form, v);
    setErrors(r.errors);
    if (!r.payload) {
      setServerError(`Revisa el formulario: ${firstError(r.errors) ?? 'hay datos por corregir'}`);
      return;
    }
    if (!r.changed) {
      props.onClose();
      return;
    }
    setBusy(true);
    try {
      // Los cambios de precio o costo exigen confirmar la contraseña (x-reauth).
      await api.patch(`/catalog/variants/${v.id}`, r.payload, { reauth: r.sensitive });
      notify('Variante actualizada.');
      props.onSaved();
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Variante: ${props.product.name} / ${v.label}`}
      dirty={dirty}
      onClose={props.onClose}
      footer={
        <>
          <CloseButton label="Cancelar" disabled={busy} />
          <button type="submit" form="variant-edit" className="btn btn-primary" disabled={busy || !dirty}>
            {busy ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <form id="variant-edit" className="form" onSubmit={submit} noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <div className="grid-2">
          <Field label="Tamaño / presentación" required error={errors.label}>
            <input value={form.label} maxLength={60} onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Field label="Unidad" error={errors.unit}>
            <input value={form.unit} maxLength={20} onChange={(e) => set({ unit: e.target.value })} />
          </Field>
          <Field label="Código de barras" hint={FIELD_HELP.barcode} error={errors.barcode}>
            <input value={form.barcode} maxLength={40} onChange={(e) => set({ barcode: e.target.value })} />
          </Field>
          <Field label="Lugar habitual" error={errors.location}>
            <input value={form.location} maxLength={60} onChange={(e) => set({ location: e.target.value })} />
          </Field>
          <Field label="Costo (MXN)" error={errors.costCents}>
            <input inputMode="decimal" value={form.cost} onChange={(e) => set({ cost: e.target.value })} />
          </Field>
          <Field label="Precio de venta (MXN)" error={errors.priceCents}>
            <input inputMode="decimal" value={form.price} onChange={(e) => set({ price: e.target.value })} />
          </Field>
          <Field label="Existencia mínima" error={errors.minStock}>
            <input inputMode="numeric" value={form.minStock} onChange={(e) => set({ minStock: e.target.value })} />
          </Field>
        </div>
        {preview.sensitive && (
          <Alert tone="warn">
            Cambiar precio o costo se audita (valor anterior y nuevo) y pedirá tu contraseña al guardar.
          </Alert>
        )}
        <p className="muted small">
          La existencia no se edita aquí: usa entradas, salidas, ajustes o conteos. {v.archived && <Badge tone="muted">Variante archivada</Badge>}
        </p>
      </form>
    </Modal>
  );
}


/* ------------------------------------------- Agregar variante a un producto existente */

/**
 * Agrega una presentación nueva (con SU código de barras, costo, precio y existencia inicial) a un producto que ya existe.
 * Si `product` no viene, primero se busca el producto ("Agregar como variante" tras escanear un código).
 */
export function VariantAddModal(props: { product?: CatalogProduct | null; barcode?: string; onClose: () => void; onSaved: () => void }) {
  const { branches } = useBranches();
  const { notify } = useToast();
  const [target, setTarget] = useState<CatalogProduct | null>(props.product ?? null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<CatalogProduct[]>([]);
  const [form, setForm] = useState(() => ({ ...emptyVariantForm(), barcode: props.barcode ?? '' }));
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0]!.id : '');
  const [qty, setQty] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const doSearch = async (text: string) => {
    setSearch(text);
    if (text.trim().length < 2) return setFound([]);
    try {
      const d = await api.get<{ items?: CatalogProduct[] }>('/catalog/products', { q: text.trim(), limit: 8 });
      setFound(d.items ?? []);
    } catch {
      setFound([]);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError('');
    if (!target) return setServerError('Elige el producto del que será variante.');
    const r = buildVariantAddPayload(form, branchId, qty, `Variante ${(target?.variants.length ?? 0) + 1}`);
    setErrors(r.errors);
    if (!r.payload) return setServerError(`Revisa el formulario: ${firstError(r.errors) ?? 'hay datos por corregir'}`);
    setBusy(true);
    try {
      const code = form.barcode.trim();
      if (code) {
        const chk = await api.get<{ duplicate: boolean }>('/catalog/codes/check', { code });
        if (chk.duplicate) throw new Error(`El código ${code} ya está registrado en otro producto.`);
      }
      await api.post(`/catalog/products/${target.id}/variants`, r.payload);
      notify(`Variante «${form.label.trim()}» agregada a ${target.name}.`);
      props.onSaved();
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={target ? `Agregar variante a ${target.name}` : 'Agregar como variante de otro producto'}
      size="lg"
      onClose={props.onClose}
      footer={
        <>
          <CloseButton label="Cancelar" disabled={busy} />
          <button type="submit" form="variant-add" className="btn btn-primary" disabled={busy || !target}>{busy ? 'Guardando...' : 'Guardar variante'}</button>
        </>
      }
    >
      <form id="variant-add" className="form" onSubmit={submit} noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}
        {target ? (
          <div className="selected-box">
            <div>
              <strong>{target.name}</strong> <span className="muted">Variantes: {target.variants.map((v) => v.label).join(', ')}</span>
            </div>
            {!props.product && <button type="button" className="btn btn-sm" onClick={() => setTarget(null)}>Cambiar</button>}
          </div>
        ) : (
          <Field label="¿De qué producto es variante?" required hint="Busca por nombre, SKU o código.">
            <input value={search} placeholder="Escribe al menos 2 letras" onChange={(e) => void doSearch(e.target.value)} />
            <div className="stack">
              {found.map((p) => (
                <button type="button" key={p.id} className="btn btn-sm" onClick={() => setTarget(p)}>{p.name} ({p.variants.length} var.)</button>
              ))}
            </div>
          </Field>
        )}
        <div className="grid-3">
          <Field label="Nombre de la variante (opcional)" hint={FIELD_HELP.variant + ' Si lo dejas vacío será «Variante N».'} error={errors.label}>
            <input value={form.label} maxLength={60} placeholder={`Variante ${(target?.variants.length ?? 0) + 1}`} onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Field label="Unidad">
            <input value={form.unit} maxLength={20} onChange={(e) => set({ unit: e.target.value })} />
          </Field>
          <Field label="Código de barras de esta variante" hint={FIELD_HELP.barcode + ' Haz clic y escanea con la pistola.'}>
            <input value={form.barcode} maxLength={40} onChange={(e) => set({ barcode: e.target.value })} />
          </Field>
          <Field label="Costo (MXN)" required hint={FIELD_HELP.cost} error={errors.costCents}>
            <input inputMode="decimal" value={form.cost} onChange={(e) => set({ cost: e.target.value })} />
          </Field>
          <Field label="Precio de venta (MXN)" required error={errors.priceCents}>
            <input inputMode="decimal" value={form.price} onChange={(e) => set({ price: e.target.value })} />
          </Field>
          <Field label="Existencia mínima" hint={FIELD_HELP.minStock} error={errors.minStock}>
            <input inputMode="numeric" value={form.minStock} onChange={(e) => set({ minStock: e.target.value })} />
          </Field>
          <Field label="Sucursal" required error={errors.branchId}>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Elige…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Existencia inicial (1 o más)" required hint={FIELD_HELP.qty} error={errors.qty}>
            <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Lugar" hint={FIELD_HELP.location}>
            <input value={form.location} maxLength={60} onChange={(e) => set({ location: e.target.value })} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
