/**
 * Anticipo de limpia (v2.3): un cliente deja dinero para una limpia. Cualquier vendedor o gerente lo recibe.
 * Se guarda quién lo deja, cuánto, para qué y el día; se genera un código y un ticket con QR. Si es en efectivo y hay caja abierta,
 * el dinero entra al cajón (y al corte). Funciona sin internet y se envía al reconectar.
 * Solo el administrador puede abrirlo después para agregar abonos o anotar en qué se utilizó (Panel → Anticipos de limpias).
 */
import React, { useState } from 'react';
import { ADVANCE_METHOD_LABEL } from '@amara/shared';
import type { AdvanceFull, AdvanceMethod } from '@amara/shared';
import { Banner, Button, Chip, ChipRow, Field, H2, Loading, Muted, Screen } from '../src/components/ui';
import { DocPreview } from '../src/components/DocPreview';
import { advanceHtml } from '../src/lib/documents';
import { qrSvg } from '../src/lib/labels';
import { parseMoneyInput } from '../src/lib/money-input';
import { qrMatrix } from '../src/services/qr';
import { useApp } from '../src/state/AppContext';

export default function AdvanceNew() {
  const app = useApp();
  const { store, device, actor } = app;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [concept, setConcept] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<AdvanceMethod>('efectivo');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ advance: AdvanceFull; cashRegistered: boolean } | null>(null);
  const [showDoc, setShowDoc] = useState(false);

  if (!store || !device || !actor) return <Loading />;

  async function submit() {
    if (!store || !device || !actor) return;
    setError(null);
    const cents = parseMoneyInput(amount);
    if (name.trim().length < 2) return setError('Escribe el nombre de quien deja el dinero.');
    if (cents === null || cents <= 0) return setError('Escribe cuánto deja (más de $0).');
    setBusy(true);
    try {
      const r = await store.createAdvance({
        actor, branchId: device.branchId, terminalId: device.terminalId, terminalCode: device.terminalCode,
        clientName: name, clientPhone: phone || undefined, concept: concept || undefined, amountCents: cents, method,
      });
      setDone(r);
      setShowDoc(true);
      app.notifyDataChanged();
      void app.syncNow('auto');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el anticipo.');
    } finally {
      setBusy(false);
    }
  }

  const branch = app.myBranches.find((b) => b.id === device.branchId);
  const html = done ? advanceHtml(done.advance, { branchName: branch?.name, uptoEntryId: done.advance.entries[0]?.id, qr: (t) => qrSvg(qrMatrix(t)) }) : '';

  if (done) {
    return (
      <Screen>
        <H2>Anticipo {done.advance.code}</H2>
        <Banner kind="ok" text={done.cashRegistered ? 'Anticipo recibido. El efectivo quedó sumado al cajón y al corte.' : 'Anticipo registrado.'} />
        {!done.cashRegistered && method === 'efectivo' ? <Banner kind="warn" text="No hay caja abierta en este teléfono: entrega el efectivo al gerente. El anticipo quedó registrado de todos modos." /> : null}
        <Muted>Entrega el ticket al cliente: lleva el código y el QR para encontrar el anticipo después.</Muted>
        <Button title="Ver o imprimir ticket" onPress={() => setShowDoc(true)} />
        <Button title="Recibir otro anticipo" variant="secondary" onPress={() => { setDone(null); setName(''); setPhone(''); setConcept(''); setAmount(''); }} />
        <DocPreview visible={showDoc} title="Ticket de anticipo" html={html} onClose={() => setShowDoc(false)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <H2>Anticipo de limpia</H2>
      <Muted>Se registra quién deja el dinero, cuánto y el día. Se genera un ticket con código y QR.</Muted>
      <Field label="Nombre de quien deja el dinero" value={name} onChangeText={setName} autoCapitalize="words" />
      <Field label="Teléfono (opcional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Cuánto deja ($)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
      <Field label="¿Para qué es? (opcional)" value={concept} onChangeText={setConcept} autoCapitalize="sentences" hint="Ejemplo: limpia de abundancia, 5 velas" />
      <Muted>Forma de pago (solo el efectivo entra al cajón)</Muted>
      <ChipRow>
        {(['efectivo', 'tarjeta', 'transferencia'] as const).map((m) => <Chip key={m} label={ADVANCE_METHOD_LABEL[m]} selected={method === m} onPress={() => setMethod(m)} />)}
      </ChipRow>
      {error ? <Banner kind="error" text={error} /> : null}
      <Button title="Recibir y generar ticket" onPress={() => void submit()} loading={busy} disabled={name.trim() === '' || amount.trim() === ''} />
    </Screen>
  );
}
