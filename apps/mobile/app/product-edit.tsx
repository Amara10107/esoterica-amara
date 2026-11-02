/**
 * Editar producto (administrador, en línea): nombre, tipo, categoría, marca; por variante: precio, costo, mínimo y lugar.
 * Archivar / restaurar (no se borra: el historial de ventas se conserva).
 * Cambiar precio o costo pide confirmar la contraseña (el servidor lo exige y lo audita).
 */
import React, { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FIELD_HELP, formatMXN } from '@amara/shared';
import { Banner, Button, Card, Field, H1, H2, Loading, Muted, Screen } from '../src/components/ui';
import { Sheet } from '../src/components/Sheet';
import { VariantFields, draftToApi, emptyVariant } from '../src/components/VariantFields';
import type { VariantDraft } from '../src/components/VariantFields';
import { parseIntInput, parseMoneyInput } from '../src/lib/money-input';
import { useApp } from '../src/state/AppContext';

interface V { id: string; label: string; priceCents: number; costCents?: number; minStock: number; location?: string | null }
interface P { id: string; name: string; type?: string | null; category?: string | null; brand?: string | null; status?: string; archived?: boolean; variants: V[] }
interface VForm { price: string; cost: string; min: string; location: string }

const toInput = (c: number | undefined) => (c === undefined ? '' : (c / 100).toFixed(2));

export default function ProductEdit() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const app = useApp();
  const router = useRouter();
  const { api, online, session } = app;
  const [p, setP] = useState<P | null>(null);
  const [f, setF] = useState({ name: '', type: '', category: '', brand: '' });
  const [vf, setVf] = useState<Record<string, VForm>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [askPw, setAskPw] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newV, setNewV] = useState<VariantDraft>(emptyVariant(''));
  const [newLoc, setNewLoc] = useState('');

  const load = useCallback(async () => {
    if (!productId || !online) return;
    try {
      const d = await api.get<P>(`/catalog/products/${productId}`);
      setP(d);
      setF({ name: d.name, type: d.type ?? '', category: d.category ?? '', brand: d.brand ?? '' });
      const next: Record<string, VForm> = {};
      for (const v of d.variants ?? []) next[v.id] = { price: toInput(v.priceCents), cost: toInput(v.costCents), min: String(v.minStock ?? 0), location: v.location ?? '' };
      setVf(next);
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo cargar el producto.' });
    }
  }, [productId, online, api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!session) return <Loading />;
  if (!app.can('productos.editar')) return <Screen><Banner kind="error" text="Solo el administrador puede editar productos." /></Screen>;
  if (!online) return <Screen><Banner kind="warn" title="Sin conexión" text="Editar un producto necesita conexión con el servidor." /></Screen>;
  if (!p) return <Loading />;
  const product: P = p;
  const archived = product.archived === true || product.status === 'archivado';

  /** Cambios de precio o costo pendientes (piden contraseña). */
  function sensitiveChanged(): boolean {
    return product.variants.some((v) => {
      const x = vf[v.id];
      if (!x) return false;
      const price = parseMoneyInput(x.price);
      const cost = x.cost.trim() === '' ? null : parseMoneyInput(x.cost);
      return (price !== null && price !== v.priceCents) || (cost !== null && v.costCents !== undefined && cost !== v.costCents);
    });
  }

  function start() {
    setMsg(null);
    if (f.name.trim().length < 2 || !f.type.trim() || !f.category.trim()) return setMsg({ kind: 'error', text: 'Nombre, tipo y categoría son obligatorios.' });
    for (const v of product.variants) {
      const x = vf[v.id];
      if (!x) continue;
      if (parseMoneyInput(x.price) === null) return setMsg({ kind: 'error', text: `Precio no válido en "${v.label}".` });
      if (x.cost.trim() !== '' && parseMoneyInput(x.cost) === null) return setMsg({ kind: 'error', text: `Costo no válido en "${v.label}".` });
      if (parseIntInput(x.min, { allowZero: true }) === null) return setMsg({ kind: 'error', text: `Mínimo no válido en "${v.label}".` });
    }
    if (sensitiveChanged()) setAskPw(true);
    else void save(undefined);
  }

  async function save(reauth: string | undefined) {
    setBusy(true);
    setMsg(null);
    try {
      const prodChanged = f.name.trim() !== product.name || f.type.trim() !== (product.type ?? '') || f.category.trim() !== (product.category ?? '') || f.brand.trim() !== (product.brand ?? '');
      if (prodChanged) {
        await api.patch(`/catalog/products/${product.id}`, { name: f.name.trim(), type: f.type.trim(), category: f.category.trim(), brand: f.brand.trim() || undefined });
      }
      for (const v of product.variants) {
        const x = vf[v.id];
        if (!x) continue;
        const body: Record<string, unknown> = {};
        const price = parseMoneyInput(x.price);
        const cost = x.cost.trim() === '' ? null : parseMoneyInput(x.cost);
        const min = parseIntInput(x.min, { allowZero: true });
        if (price !== null && price !== v.priceCents) body.priceCents = price;
        if (cost !== null && v.costCents !== undefined && cost !== v.costCents) body.costCents = cost;
        if (min !== null && min !== v.minStock) body.minStock = min;
        if (x.location.trim() !== (v.location ?? '')) body.location = x.location.trim();
        if (Object.keys(body).length === 0) continue;
        const sens = 'priceCents' in body || 'costCents' in body;
        await api.patch(`/catalog/variants/${v.id}`, body, sens && reauth ? { headers: { 'x-reauth': reauth } } : undefined);
      }
      setMsg({ kind: 'ok', text: 'Cambios guardados. Los demás aparatos los reciben al sincronizar.' });
      void app.syncNow('manual');
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar.' });
    } finally {
      setBusy(false);
    }
  }

  async function addVariant() {
    if (!app.device) return;
    setMsg(null);
    const r = draftToApi(newV, parseMoneyInput, parseIntInput, newLoc, `Variante ${product.variants.length + 1}`);
    if (typeof r === 'string') return setMsg({ kind: 'error', text: r });
    setBusy(true);
    try {
      if (r.variant.barcode) {
        if (await app.store?.codeExists(r.variant.barcode)) throw new Error(`El código ${r.variant.barcode} ya existe en el catálogo.`);
        const chk = await api.get<{ duplicate?: boolean }>(`/catalog/codes/check?code=${encodeURIComponent(r.variant.barcode)}`);
        if (chk.duplicate) throw new Error(`El código ${r.variant.barcode} ya está registrado en otro producto.`);
      }
      await api.post(`/catalog/products/${product.id}/variants`, {
        variants: [r.variant],
        initialStock: [{ variantIndex: 0, branchId: app.device.branchId, qty: r.qty, location: newLoc.trim() || undefined }],
      });
      setMsg({ kind: 'ok', text: `Variante «${r.variant.label}» agregada con ${r.qty} pieza(s).` });
      setNewV(emptyVariant(''));
      setNewLoc('');
      setAdding(false);
      void app.syncNow('manual');
      await load();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo agregar la variante.' });
    } finally {
      setBusy(false);
    }
  }

  async function confirmPassword() {
    setBusy(true);
    try {
      const re = await api.post<{ token?: string }>('/auth/reauth', { password });
      if (!re.token) throw new Error('El servidor no confirmó la contraseña.');
      setAskPw(false);
      setPassword('');
      await save(re.token);
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Contraseña incorrecta.' });
      setBusy(false);
      setAskPw(false);
      setPassword('');
    }
  }

  async function toggleArchive() {
    setBusy(true);
    try {
      await api.post(`/catalog/products/${product.id}/${archived ? 'restore' : 'archive'}`, {});
      setConfirmArchive(false);
      void app.syncNow('manual');
      app.notifyDataChanged();
      if (archived) {
        await load();
        setMsg({ kind: 'ok', text: 'Producto restaurado.' });
      } else {
        router.back();
      }
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo cambiar el estado.' });
      setConfirmArchive(false);
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    try {
      await api.post(`/catalog/products/${product.id}/delete`, {});
      setConfirmDelete(false);
      void app.syncNow('manual');
      app.notifyDataChanged();
      router.back();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo borrar el producto.' });
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Editar producto</H1>
      {archived ? <Banner kind="warn" text="Este producto está archivado: no se ofrece para venta." /> : null}
      {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
      <Card>
        <H2>Producto</H2>
        <Field label="Nombre" value={f.name} onChangeText={(t) => setF({ ...f, name: t })} maxLength={120} hint={FIELD_HELP.name} />
        <Field label="Tipo" value={f.type} onChangeText={(t) => setF({ ...f, type: t })} maxLength={60} hint={FIELD_HELP.type} />
        <Field label="Categoría" value={f.category} onChangeText={(t) => setF({ ...f, category: t })} maxLength={60} hint={FIELD_HELP.category} />
        <Field label="Marca (opcional)" value={f.brand} onChangeText={(t) => setF({ ...f, brand: t })} maxLength={60} />
      </Card>
      {product.variants.map((v) => {
        const x = vf[v.id];
        if (!x) return null;
        return (
          <Card key={v.id} tone="gold">
            <H2>{v.label}</H2>
            <Muted>Precio actual {formatMXN(v.priceCents)}</Muted>
            <Field label="Precio de venta ($)" value={x.price} onChangeText={(t) => setVf({ ...vf, [v.id]: { ...x, price: t } })} keyboardType="decimal-pad" />
            {v.costCents !== undefined ? <Field label="Costo ($)" value={x.cost} onChangeText={(t) => setVf({ ...vf, [v.id]: { ...x, cost: t } })} keyboardType="decimal-pad" /> : null}
            <Field label="Mínimo antes de avisar" hint={FIELD_HELP.minStock} value={x.min} onChangeText={(t) => setVf({ ...vf, [v.id]: { ...x, min: t } })} keyboardType="number-pad" />
            <Field label="Lugar" value={x.location} onChangeText={(t) => setVf({ ...vf, [v.id]: { ...x, location: t } })} maxLength={60} />
          </Card>
        );
      })}
      {adding ? (
        <>
          <VariantFields autoLabel={`Variante ${product.variants.length + 1}`} index={0} total={1} v={newV} onChange={setNewV} showLocation location={newLoc} onLocation={setNewLoc} />
          <Button title="Guardar variante nueva" onPress={() => void addVariant()} loading={busy} />
          <Button title="Cancelar" variant="secondary" onPress={() => setAdding(false)} disabled={busy} />
        </>
      ) : (
        <>
          <Muted>¿Llegó otra presentación (otro tamaño, color o código de barras) de este mismo producto? Agrégala como variante nueva.</Muted>
          <Button title="Agregar otra variante (con su código de barras)" variant="secondary" onPress={() => setAdding(true)} />
        </>
      )}
      <Muted>Cambiar precio o costo pide tu contraseña y queda auditado.</Muted>
      <Button title="Guardar cambios" onPress={start} loading={busy} />
      <Muted>{archived ? 'Restaurar hace que el producto vuelva a aparecer para vender. Su historial y existencias no cambian.' : 'Archivar: no borra nada; solo deja de aparecer para vender. Al tocar el botón te explico y te pido confirmar.'}</Muted>
      <Button title={archived ? 'Restaurar producto' : 'Archivar producto'} variant={archived ? 'secondary' : 'danger'} onPress={() => setConfirmArchive(true)} disabled={busy} />
      <Muted>Borrar: quita el producto de todos lados, pero queda en el Historial de borrados de la web, donde se puede restaurar.</Muted>
      <Button title="Borrar producto" variant="danger" onPress={() => setConfirmDelete(true)} disabled={busy} />

      <Sheet visible={askPw} title="Confirma tu contraseña" onClose={() => { setAskPw(false); setPassword(''); }}>
        <Muted>Cambiar precios o costos es una acción sensible.</Muted>
        <Field label="Tu contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <Button title="Confirmar y guardar" onPress={() => void confirmPassword()} loading={busy} disabled={password === ''} />
        <Button title="Cancelar" variant="secondary" onPress={() => { setAskPw(false); setPassword(''); }} disabled={busy} />
      </Sheet>
      <Sheet visible={confirmArchive} title={archived ? 'Restaurar producto' : 'Archivar producto'} onClose={() => setConfirmArchive(false)}>
        <Muted>{archived ? `${product.name}: Restaurar hace que el producto vuelva a aparecer para vender. Su historial y existencias no cambian.` : `${product.name}: Archivar NO borra nada: el producto y su historial de ventas se conservan y las existencias quedan tal cual. Solo deja de aparecer para vender (caja, escáner y búsquedas). Se restaura desde la web: Inventario → Mostrar archivados → Restaurar.`}</Muted>
        <Button title={archived ? 'Sí, restaurar' : 'Sí, archivar'} variant={archived ? 'primary' : 'danger'} onPress={() => void toggleArchive()} loading={busy} />
        <Button title="No" variant="secondary" onPress={() => setConfirmArchive(false)} disabled={busy} />
      </Sheet>
      <Sheet visible={confirmDelete} title="Borrar producto" onClose={() => setConfirmDelete(false)}>
        <Muted>{`${product.name}: se quita del inventario, del catálogo y de la caja (todas sus variantes y sucursales). No se pierde la información: las ventas y tickets antiguos conservan su nombre y el producto queda en el Historial de borrados de la web (Inventario), donde puedes restaurarlo.`}</Muted>
        <Button title="Sí, borrar" variant="danger" onPress={() => void doDelete()} loading={busy} />
        <Button title="No" variant="secondary" onPress={() => setConfirmDelete(false)} disabled={busy} />
      </Sheet>
    </Screen>
  );
}
