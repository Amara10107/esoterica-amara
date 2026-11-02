/**
 * Alta de producto iniciada desde un código no registrado. SOLO en línea (el catálogo vive en el servidor;
 * las altas no son operaciones de la cola de sincronización) y solo con permiso productos.editar.
 * v2.3.4: hasta 5 variantes de un jalón (cada una con su código de barras), ayudas por campo, SKU automático y
 * "Agregar como variante de otro producto" (el código leído pasa a ser una variante nueva de un producto que ya existe).
 */
import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { productCreateSchema } from '@amara/shared/schemas';
import { FIELD_HELP, autoVariantLabel, randomSkuTail, skuPrefix } from '@amara/shared';
import { Banner, Button, Card, Chip, ChipRow, Field, H2, Loading, Muted, Screen } from '../src/components/ui';
import { VariantFields, draftToApi, emptyVariant } from '../src/components/VariantFields';
import type { VariantDraft } from '../src/components/VariantFields';
import { useApp } from '../src/state/AppContext';
import { ApiError } from '../src/services/api';
import { parseIntInput, parseMoneyInput } from '../src/lib/money-input';

const MAX_VARIANTS = 5;
interface Found { id: string; name: string; sku?: string; variants: { id: string; label: string }[] }

export default function ProductNew() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const app = useApp();
  const router = useRouter();
  const { store, device } = app;

  const isQr = (code ?? '').startsWith('amara:');
  const [mode, setMode] = useState<'nuevo' | 'variante'>('nuevo');
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [skuTail, setSkuTail] = useState(() => randomSkuTail());
  const [skuTyped, setSkuTyped] = useState<string | null>(null); // null = automático
  const sku = skuTyped ?? `${skuPrefix(type, name)}-${skuTail}`;
  const [location, setLocation] = useState('');
  const [count, setCount] = useState(1);
  const [vars, setVars] = useState<VariantDraft[]>([{ ...emptyVariant(''), barcode: isQr ? '' : (code ?? '') }]);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<Found[]>([]);
  const [target, setTarget] = useState<Found | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setCountTo(n: number) {
    setCount(n);
    setVars((cur) => (n <= cur.length ? cur.slice(0, n) : [...cur, ...Array.from({ length: n - cur.length }, () => emptyVariant(''))]));
  }

  // Búsqueda del producto al que se agregará como variante.
  useEffect(() => {
    if (mode !== 'variante' || search.trim().length < 2 || !app.online) { setFound([]); return; }
    let off = false;
    const t = setTimeout(() => {
      app.api.get<{ items?: Found[] }>(`/catalog/products?q=${encodeURIComponent(search.trim())}&limit=8`).then((d) => !off && setFound(d.items ?? [])).catch(() => undefined);
    }, 300);
    return () => { off = true; clearTimeout(t); };
  }, [mode, search, app]);

  if (!store || !device) return <Loading />;
  if (!app.can('productos.editar')) {
    return (
      <Screen>
        <Banner kind="error" text="Tu rol no puede dar de alta productos." />
      </Screen>
    );
  }

  /** Nombre automático de la variante i: «Única» / «Variante N»; si es variante de un producto existente, sigue la cuenta de las que ya tiene. */
  const labelFor = (i: number) => (mode === 'variante' ? `Variante ${(target?.variants.length ?? 0) + i + 1}` : autoVariantLabel(i, vars.length));

  async function checkCodes(codes: string[]) {
    const seen = new Set<string>();
    for (const c of codes) {
      if (seen.has(c)) throw new Error(`El código ${c} está repetido en dos variantes.`);
      seen.add(c);
      if (await store!.codeExists(c)) throw new Error(`El código de barras ${c} ya existe en el catálogo de este teléfono.`);
      const chk = await app.api.get<{ duplicate?: boolean }>(`/catalog/codes/check?code=${encodeURIComponent(c)}`);
      if (chk.duplicate) throw new Error(`El servidor indica que el código ${c} ya está registrado en otro producto.`);
    }
  }

  async function submit() {
    if (!store || !device) return;
    setError(null);
    setOkMsg(null);
    if (!app.online) return setError('El alta de productos requiere conexión con el servidor.');
    const items = [];
    for (const v of vars) {
      const r = draftToApi(v, parseMoneyInput, parseIntInput, location, labelFor(items.length));
      if (typeof r === 'string') return setError(r);
      items.push(r);
    }
    setBusy(true);
    try {
      await checkCodes(items.map((i) => i.variant.barcode ?? '').filter(Boolean));
      if (mode === 'variante') {
        if (!target) throw new Error('Elige el producto del que será variante.');
        await app.api.post<unknown>(`/catalog/products/${target.id}/variants`, {
          variants: items.map((i) => i.variant),
          initialStock: items.map((i, idx) => ({ variantIndex: idx, branchId: device.branchId, qty: i.qty, location: location.trim() || undefined })),
        });
        setOkMsg(`Variante agregada a «${target.name}». Sincronizando...`);
      } else {
        const parsed = productCreateSchema.safeParse({
          product: { name, type, category, sku, specs: {} },
          variants: items.map((i) => i.variant),
          initialStock: items.map((i, idx) => ({ variantIndex: idx, branchId: device.branchId, qty: i.qty, location: location.trim() || undefined })),
        });
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          throw new Error(`Revisa los datos: ${first ? `${first.path.join('.')} - ${first.message}` : 'formato inválido'}`);
        }
        await app.api.post<unknown>('/catalog/products', parsed.data);
        setOkMsg('Producto dado de alta. Sincronizando para descargarlo...');
      }
      void app.syncNow('manual');
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setError('El servidor no te autorizó a dar de alta productos.');
      else if (e instanceof ApiError && e.status === 401) setError('Tu sesión en línea venció. Inicia sesión con internet (Más - Sincronización).');
      else setError(e instanceof Error ? e.message : 'No se pudo dar de alta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Muted>Código leído: {code ?? '(ninguno)'}. Requiere conexión.</Muted>
      <ChipRow>
        <Chip label="Producto nuevo" selected={mode === 'nuevo'} onPress={() => setMode('nuevo')} />
        <Chip label="Agregar como variante de otro producto" selected={mode === 'variante'} onPress={() => setMode('variante')} />
      </ChipRow>

      {mode === 'nuevo' ? (
        <>
          <H2>Producto</H2>
          <Field label="Nombre" value={name} onChangeText={setName} autoCapitalize="sentences" hint={FIELD_HELP.name} />
          <Field label="Tipo" value={type} onChangeText={setType} autoCapitalize="sentences" placeholder="Velas, inciensos, imágenes..." hint={FIELD_HELP.type} />
          <Field label="Categoría" value={category} onChangeText={setCategory} autoCapitalize="sentences" hint={FIELD_HELP.category} />
          <Field label="SKU automático (clave interna del producto)" value={sku} onChangeText={(t) => setSkuTyped(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} hint={FIELD_HELP.sku + ' Se llena solo con el tipo que escribas; puedes cambiarlo si quieres.'} />
          <Button title="Generar otro SKU" variant="secondary" onPress={() => { setSkuTyped(null); setSkuTail(randomSkuTail()); }} />
        </>
      ) : (
        <Card>
          <H2>¿De qué producto es variante?</H2>
          <Muted>Busca el producto que ya existe; esta será una variante nueva con su propio código de barras, precio y existencia.</Muted>
          {target ? (
            <>
              <Banner kind="ok" text={`Producto: ${target.name} (${target.variants.map((v) => v.label).join(', ')})`} />
              <Button title="Cambiar producto" variant="secondary" onPress={() => setTarget(null)} />
            </>
          ) : (
            <>
              <Field label="Buscar producto" value={search} onChangeText={setSearch} placeholder="Nombre, SKU o código" autoCorrect={false} />
              {found.map((f) => (
                <Button key={f.id} title={`${f.name} (${f.variants.length} var.)`} variant="secondary" onPress={() => { setTarget(f); setSearch(''); }} />
              ))}
            </>
          )}
        </Card>
      )}

      <H2>{mode === 'nuevo' ? 'Variantes' : 'Variantes nuevas'}</H2>
      <Muted>¿Cuántas variantes vas a dar de alta ahora? (hasta {MAX_VARIANTS}; después puedes agregar más con «Editar producto»).</Muted>
      <ChipRow>
        {Array.from({ length: MAX_VARIANTS }, (_, i) => i + 1).map((n) => (
          <Chip key={n} label={String(n)} selected={count === n} onPress={() => setCountTo(n)} />
        ))}
      </ChipRow>
      {vars.map((v, i) => (
        <VariantFields
          key={i}
          autoLabel={labelFor(i)}
          index={i}
          total={vars.length}
          v={v}
          onChange={(next) => setVars((cur) => cur.map((x, j) => (j === i ? next : x)))}
          showLocation={i === 0}
          location={location}
          onLocation={setLocation}
        />
      ))}
      {error ? <Banner kind="error" text={error} /> : null}
      {okMsg ? <Banner kind="ok" text={okMsg} /> : null}
      <Button title={mode === 'nuevo' ? 'Dar de alta' : 'Agregar como variante'} onPress={() => void submit()} loading={busy} disabled={okMsg !== null} />
    </Screen>
  );
}
