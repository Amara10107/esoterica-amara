/**
 * Venta de emergencia (funciona sin conexión).
 *  - El saleId se genera ANTES de cobrar (CartContext): reintentar nunca duplica la venta.
 *  - LocalStore.registerSale guarda en UNA transacción venta, partidas, pagos, ticket, movimientos de
 *    inventario, operación de sincronización y auditoría. Solo DESPUÉS del guardado se muestra el folio.
 *  - Descuenta las existencias LOCALES y sobrevive reinicios (SQLite en disco, WAL + synchronous FULL).
 *  - Se sincroniza sola al haber conexión.
 *  - Descuento: el administrador lo da libremente; el vendedor solo con contraseña de admin o token 'descuento' (AuthModal).
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { extrasForType, formatMXN } from '@amara/shared';
import type { ExtraOption } from '@amara/shared';
import type { PaymentMethod, Sale } from '@amara/shared';
import { StoreError } from '@amara/database';
import type { CatalogHit } from '@amara/database';
import { Banner, Button, Card, Chip, ChipRow, Divider, Field, H1, H2, Loading, Muted, Row, Screen } from '../src/components/ui';
import { AuthModal } from '../src/components/AuthModal';
import type { AuthSuccess } from '../src/components/AuthModal';
import { StatusBanner } from '../src/components/StatusBanner';
import { Sheet } from '../src/components/Sheet';
import { SaleTicketView } from '../src/components/SaleTicketView';
import { useApp } from '../src/state/AppContext';
import { useCart } from '../src/state/CartContext';
import { parseMoneyInput } from '../src/lib/money-input';
import { summarizePayments, toPaymentInputs, validateNewPayment } from '../src/lib/payments';
import type { PaymentDraft } from '../src/lib/payments';
import { methodName } from '../src/lib/ticket-render';
import { toSaleItems } from '../src/lib/cart';
import { isLegacyNegative, shownQty } from '../src/lib/low-stock';
import type { Employee } from '../src/lib/misc-v2';
import { loadEmployees } from '../src/services/employees';
import { replicateSaleToPc } from '../src/services/lan';
import { colors, radius, space } from '../src/theme';

const METHODS: PaymentMethod[] = ['efectivo', 'tarjeta', 'transferencia', 'otro'];
const toInput = (cents: number) => (cents / 100).toFixed(2);

interface Done {
  sale: Sale;
  duplicate: boolean;
  warnings: string[];
}

export default function CartScreen() {
  const app = useApp();
  const cart = useCart();
  const router = useRouter();
  const { store, device, actor, terminal } = app;

  const [payments, setPayments] = useState<PaymentDraft[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('efectivo');
  const [amountText, setAmountText] = useState('');
  const [tenderedText, setTenderedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<CatalogHit[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // v2: empleado que vende (ventana antes de cobrar) y botón "Extra".
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [sellerOpen, setSellerOpen] = useState(false);
  const [extraCatalog, setExtraCatalog] = useState<ExtraOption[]>([]);
  const [extraFor, setExtraFor] = useState<string | null>(null);
  const [extraError, setExtraError] = useState<string | null>(null);

  // Descuento a toda la venta. `gross` es el subtotal del carrito; `total` ya lleva el descuento.
  const gross = cart.totalCents;
  const [discountText, setDiscountText] = useState('');
  const [discountCents, setDiscountCents] = useState(0);
  const [discountAuth, setDiscountAuth] = useState<AuthSuccess | null>(null);
  const [askDiscountAuth, setAskDiscountAuth] = useState<number | null>(null);
  const isManager = app.can('ventas.descuento');
  const canDiscount = isManager || app.session?.user.role === 'vendedor';
  const total = Math.max(0, gross - discountCents);
  const cartEmpty = cart.cart.lines.length === 0 && (cart.cart.extras ?? []).length === 0;
  const sum = summarizePayments(total, payments);

  // Al cambiar el carrito se descartan pagos ya capturados (el total puede ser otro).
  useEffect(() => {
    setPayments([]);
  }, [total]);

  // Si cambia el carrito, el descuento (y su autorización) se descartan: había sido para otro importe.
  useEffect(() => {
    setDiscountCents(0);
    setDiscountText('');
    setDiscountAuth(null);
  }, [gross]);

  // Empleados de la sucursal y categorías que admiten "Extra" (datos locales: funciona sin conexión).
  useEffect(() => {
    if (!store || !device || !app.session) return;
    let off = false;
    const u = app.session.user;
    loadEmployees(store, device.branchId, { id: u.id, name: u.name, role: u.role })
      .then((e) => !off && setEmployees(e))
      .catch(() => undefined);
    store
      .getExtraCatalog()
      .then((c) => !off && setExtraCatalog(c))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [store, device, app.session, app.dataVersion]);

  // Importe sugerido = lo que falta por cobrar.
  useEffect(() => {
    setAmountText(sum.remainingCents > 0 ? toInput(sum.remainingCents) : '');
    setTenderedText('');
  }, [sum.remainingCents, method]);

  // Búsqueda para agregar productos sin escáner.
  useEffect(() => {
    if (!store || !device || query.trim().length < 2) {
      setFound([]);
      return;
    }
    let off = false;
    const t = setTimeout(() => {
      store.search(query, device.branchId, 15).then((r) => !off && setFound(r)).catch(() => undefined);
    }, 250);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [query, store, device]);

  if (!store || !device || !actor || !terminal) return <Loading />;

  function addPayment() {
    setError(null);
    const amount = parseMoneyInput(amountText);
    if (amount === null) return setError('Escribe un importe válido.');
    let tendered: number | undefined;
    if (method === 'efectivo') {
      const t = tenderedText.trim() ? parseMoneyInput(tenderedText) : amount;
      if (t === null) return setError('Escribe el efectivo recibido correctamente.');
      tendered = t;
    }
    const draft: PaymentDraft = { method, amountCents: amount, tenderedCents: tendered };
    const problem = validateNewPayment(total, payments, draft);
    if (problem) return setError(problem);
    setPayments([...payments, draft]);
  }

  async function charge() {
    if (!store || !device || !actor || !terminal) return;
    setError(null);
    setBusy(true);
    try {
      const seller = employees.find((e) => e.id === (sellerId ?? app.session?.user.id));
      const r = await store.registerSale({
        saleId: cart.cart.saleId,
        actor,
        branchId: device.branchId,
        terminalId: terminal.terminalId,
        items: toSaleItems(cart.cart),
        payments: toPaymentInputs(payments),
        ...(discountCents > 0 ? { discountCents } : {}),
        ...(discountCents > 0 && discountAuth ? { authorization: discountAuth.authorization, authorizationTrusted: discountAuth.trusted } : {}),
        // v2: quien vendió. Queda en el sistema; NO se imprime en el ticket.
        sellerId: seller?.id ?? app.session?.user.id ?? null,
        sellerName: seller?.name ?? app.session?.user.name ?? null,
      });
      // A partir de aquí la venta ya está en disco.
      setDone({ sale: r.sale, duplicate: r.duplicate, warnings: r.warnings });
      cart.reset();
      setPayments([]);
      setDiscountCents(0);
      setDiscountText('');
      setDiscountAuth(null);
      app.notifyDataChanged();
      void replicateSaleToPc(store, r.sale.id); // réplica opcional a la PC vinculada
      void app.syncNow('auto'); // envío al servidor si hay conexión
    } catch (e) {
      if (e instanceof StoreError && e.code === 'sin_existencia') {
        const avail = typeof e.data?.available === 'number' ? Math.max(0, e.data.available) : null;
        setError(`${e.message}${avail !== null ? ` Disponible: ${avail}.` : ''} Ajusta el carrito y vuelve a intentar.`);
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo registrar la venta.');
      }
    } finally {
      setBusy(false);
    }
  }

  function applyDiscount(cents: number) {
    if (cents <= 0 || cents >= gross) return setError(cents >= gross ? 'El descuento no puede ser igual o mayor al total.' : 'Escribe un descuento válido.');
    setError(null);
    if (isManager) return setDiscountCents(cents);
    setAskDiscountAuth(cents); // vendedor: primero la autorización
  }

  function pickExtra(option: ExtraOption) {
    const line = cart.cart.lines.find((l) => l.variantId === extraFor);
    if (!line) return;
    if ((cart.cart.extras ?? []).some((e) => e.variantId === line.variantId && e.extraId === option.id)) {
      return setExtraError(`"${option.name}" ya está agregado a este producto.`);
    }
    // El precio y el nombre son los que fijó el administrador: aquí no se escriben ni se cambian.
    cart.addExtraLine({ variantId: line.variantId, productName: line.productName, label: line.label, amountCents: option.priceCents, note: option.name, extraId: option.id });
    setExtraFor(null);
    setExtraError(null);
  }


  function tryAdd(h: CatalogHit) {
    const reason = cart.add(h, 1);
    setNotice(reason);
    if (!reason) setQuery('');
  }

  // ───────────── Venta registrada ─────────────
  if (done) {
    const cash = done.sale.payments.find((p) => p.method === 'efectivo');
    return (
      <Screen>
        <Banner kind="ok" title={done.duplicate ? 'Esta venta ya estaba registrada' : 'Venta registrada'} text="Quedó guardada en el teléfono y se enviará al servidor en cuanto haya conexión." />
        <Card tone="gold">
          <Muted>Folio</Muted>
          <H1>{done.sale.folio}</H1>
          <Row label="Total" value={formatMXN(done.sale.totalCents)} strong />
          {cash ? <Row label="Cambio" value={formatMXN(cash.changeCents ?? 0)} strong /> : null}
          <Row label="Productos" value={String(done.sale.items.filter((i) => i.kind !== 'extra').reduce((a, i) => a + i.qty, 0))} />
        </Card>
        {done.warnings.map((w) => (
          <Banner key={w} kind="warn" text={w} />
        ))}
        <SaleTicketView saleId={done.sale.id} />
        <Button title="Nueva venta" variant="dark" onPress={() => setDone(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Banner kind="warn" title="Venta de emergencia" text="Se guarda en este teléfono con folio único y descuenta las existencias locales, aunque no haya internet." />
      <StatusBanner compact />

      <Card>
        <H2>Productos ({cart.units})</H2>
        {cart.cart.lines.length === 0 && (cart.cart.extras ?? []).length === 0 ? <Muted>El carrito está vacío. Escanea un producto o búscalo abajo.</Muted> : null}
        {cart.cart.lines.map((l) => (
          <View key={l.variantId} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName}>{l.productName}</Text>
              <Text style={styles.lineSub}>
                {l.label} · {formatMXN(l.unitPriceCents)} c/u{l.available !== undefined ? ` · existencia ${l.available}` : ''}
              </Text>
              <Text style={styles.lineTotal}>{formatMXN(l.qty * l.unitPriceCents)}</Text>
              {extrasForType(extraCatalog, l.ptype).length > 0 ? (
                <Pressable accessibilityRole="button" onPress={() => { setExtraFor(l.variantId); setExtraError(null); }} style={styles.extraBtn}>
                  <Text style={styles.extraBtnText}>+ Extra</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.stepper}>
              <Step label="-" onPress={() => { setNotice(null); cart.changeQty(l.variantId, l.qty - 1); }} />
              <Text style={styles.qty}>{l.qty}</Text>
              <Step label="+" onPress={() => setNotice(cart.changeQty(l.variantId, l.qty + 1))} />
            </View>
          </View>
        ))}
        {(cart.cart.extras ?? []).map((e) => (
          <View key={e.id} style={styles.line}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName}>Extra: {e.productName}</Text>
              <Text style={styles.lineSub}>{e.note}</Text>
              <Text style={styles.lineTotal}>{formatMXN(e.amountCents)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Quitar extra" onPress={() => cart.removeExtraLine(e.id)}>
              <Text style={styles.remove}>Quitar</Text>
            </Pressable>
          </View>
        ))}
        <Divider />
        {discountCents > 0 ? <Row label="Subtotal" value={formatMXN(gross)} /> : null}
        {discountCents > 0 ? <Row label="Descuento" value={`-${formatMXN(discountCents)}`} /> : null}
        <Row label="TOTAL" value={formatMXN(total)} strong />
      </Card>

      {canDiscount && gross > 0 ? (
        <Card>
          <H2>Descuento</H2>
          {discountCents > 0 ? (
            <>
              <Muted>{isManager ? 'Descuento aplicado.' : 'Descuento autorizado.'}</Muted>
              <Button title="Quitar descuento" variant="secondary" onPress={() => { setDiscountCents(0); setDiscountText(''); setDiscountAuth(null); }} />
            </>
          ) : (
            <>
              {!isManager ? <Muted>Necesita la contraseña de un administrador o un token de descuento.</Muted> : null}
              <ChipRow>
                {[5, 10, 15, 20].map((p) => (
                  <Chip key={p} label={`${p}%`} selected={false} onPress={() => applyDiscount(Math.round((gross * p) / 100))} />
                ))}
              </ChipRow>
              <Field label="Descuento en pesos ($)" value={discountText} onChangeText={setDiscountText} keyboardType="decimal-pad" placeholder="0.00" />
              <Button title="Aplicar descuento" variant="secondary" onPress={() => applyDiscount(parseMoneyInput(discountText) ?? 0)} />
            </>
          )}
        </Card>
      ) : null}
      <AuthModal
        visible={askDiscountAuth !== null}
        purpose="descuento"
        onCancel={() => setAskDiscountAuth(null)}
        onAuthorized={(a) => { setDiscountAuth(a); setDiscountCents(askDiscountAuth ?? 0); setAskDiscountAuth(null); }}
      />

      <Field label="Agregar sin escáner (buscar)" value={query} onChangeText={setQuery} placeholder="Nombre o código" autoCorrect={false} />
      {notice ? <Banner kind="warn" text={notice} /> : null}
      {found.map((h) => {
        const none = shownQty(h.qty) <= 0;
        return (
          <Pressable
            key={h.variantId}
            accessibilityRole="button"
            accessibilityState={{ disabled: none }}
            onPress={() => tryAdd(h)}
            style={({ pressed }) => [styles.result, none && { opacity: 0.55 }, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName}>{h.productName}</Text>
              <Text style={styles.lineSub}>
                {h.label} · {formatMXN(h.priceCents)} · {none ? 'Sin existencia' : `existencia ${h.qty}`}
              </Text>
              {isLegacyNegative(h.qty) ? <Text style={styles.fix}>Existencia por corregir: el inventario tiene un descuadre heredado.</Text> : null}
            </View>
            <Text style={styles.plus}>{none ? '' : '+'}</Text>
          </Pressable>
        );
      })}
      <Button title="Escanear más productos" variant="secondary" onPress={() => { app.setMode('venta'); router.push('/scan'); }} />

      {!cartEmpty ? (
        <>
          <Card>
            <H2>Cobro</H2>
            {payments.map((p, i) => (
              <View key={i} style={styles.payRow}>
                <Text style={styles.lineName}>
                  {methodName(p.method)} {formatMXN(p.amountCents)}
                  {p.method === 'efectivo' && p.tenderedCents !== undefined && p.tenderedCents > p.amountCents ? ` (recibido ${formatMXN(p.tenderedCents)})` : ''}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Quitar pago" onPress={() => setPayments(payments.filter((_, j) => j !== i))}>
                  <Text style={styles.remove}>Quitar</Text>
                </Pressable>
              </View>
            ))}
            {sum.remainingCents > 0 ? (
              <>
                <Muted>Falta por cobrar: {formatMXN(sum.remainingCents)}</Muted>
                <ChipRow>
                  {METHODS.map((m) => (
                    <Chip key={m} label={methodName(m)} selected={method === m} onPress={() => setMethod(m)} />
                  ))}
                </ChipRow>
                <Field label="Importe a cobrar con este método" value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" />
                {method === 'efectivo' ? <Field label="Efectivo recibido (si es más, se calcula el cambio)" value={tenderedText} onChangeText={setTenderedText} keyboardType="decimal-pad" placeholder={amountText} /> : null}
                <Button title="Agregar pago" variant="secondary" onPress={addPayment} />
              </>
            ) : null}
            {sum.changeCents > 0 ? <Row label="Cambio a entregar" value={formatMXN(sum.changeCents)} strong /> : null}
          </Card>

          {error ? <Banner kind="error" text={error} /> : null}
          {employees.length > 0 ? (
            <Card>
              <Row label="Vende" value={employees.find((e) => e.id === (sellerId ?? app.session?.user.id))?.name ?? app.session?.user.name ?? '-'} />
              <Button title="Cambiar quien vende" variant="secondary" onPress={() => setSellerOpen(true)} />
              <Muted>Se guarda en el sistema; no se imprime en el ticket.</Muted>
            </Card>
          ) : null}
          <Button title={`Registrar venta ${formatMXN(total)}`} onPress={() => void charge()} loading={busy} disabled={!sum.complete} />
          <Button title="Vaciar carrito" variant="danger" disabled={busy} onPress={() => { cart.reset(); setPayments([]); }} />
        </>
      ) : null}
      <Sheet visible={sellerOpen} title="¿Quién vende?" onClose={() => setSellerOpen(false)}>
        <Muted>Elige al empleado que atendió esta venta.</Muted>
        {employees.map((e) => {
          const on = e.id === (sellerId ?? app.session?.user.id);
          return <Button key={e.id} title={`${on ? '✓ ' : ''}${e.name}`} variant={on ? 'primary' : 'secondary'} onPress={() => { setSellerId(e.id); setSellerOpen(false); }} />;
        })}
      </Sheet>

      <Sheet visible={extraFor !== null} title="Agregar extra" onClose={() => setExtraFor(null)}>
        <Muted>Elige un extra para este producto. El precio lo fija el administrador. No descuenta inventario.</Muted>
        {extrasForType(extraCatalog, cart.cart.lines.find((l) => l.variantId === extraFor)?.ptype).map((o) => (
          <Button key={o.id} title={`${o.name} · ${formatMXN(o.priceCents)}`} variant="secondary" onPress={() => pickExtra(o)} />
        ))}
        {extraError ? <Banner kind="error" text={extraError} /> : null}
        <Button title="Cerrar" variant="secondary" onPress={() => setExtraFor(null)} />
      </Sheet>
    </Screen>
  );
}

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label === '+' ? 'Sumar una unidad' : 'Restar una unidad'} onPress={onPress} style={({ pressed }) => [styles.step, pressed && { opacity: 0.6 }]}>
      <Text style={styles.stepText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  lineName: { fontSize: 16, fontWeight: '800', color: colors.text },
  lineSub: { fontSize: 14, color: colors.muted },
  lineTotal: { fontSize: 15, fontWeight: '700', color: colors.text },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  step: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 24, fontWeight: '800', color: colors.text },
  qty: { minWidth: 28, textAlign: 'center', fontSize: 18, fontWeight: '900', color: colors.text },
  result: { flexDirection: 'row', alignItems: 'center', padding: space.md, minHeight: 60, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card },
  plus: { fontSize: 28, fontWeight: '800', color: colors.gold, paddingHorizontal: space.sm },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  extraBtn: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: space.md, marginTop: space.xs, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.gold },
  extraBtnText: { color: colors.gold, fontWeight: '800', fontSize: 14 },
  fix: { fontSize: 13, color: colors.danger, fontWeight: '700' },
  remove: { color: colors.danger, fontWeight: '800', fontSize: 15, padding: space.sm },
});
