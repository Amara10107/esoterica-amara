/**
 * Anticipos de limpias (SOLO gerente). Busca por nombre, teléfono, día (2026-10-22), código o escaneando el QR del ticket.
 * Al abrir uno ve todo el historial y puede: agregar más abonos, anotar en qué se utilizó el dinero (ej. "5 velas"),
 * cerrarlo o abrirlo de nuevo, y reimprimir el ticket (completo o de un abono). Todo funciona sin internet y se envía al reconectar.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ADVANCE_KIND_LABEL, ADVANCE_METHOD_LABEL, formatMXN, formatMxDateTime, summarizeAdvance } from '@amara/shared';
import type { AdvanceFull, AdvanceMethod } from '@amara/shared';
import { Banner, Button, Card, Chip, ChipRow, Divider, Field, H1, H2, Loading, Muted, Row, Screen } from '../src/components/ui';
import { CameraScanner } from '../src/components/CameraScanner';
import { DocPreview } from '../src/components/DocPreview';
import { Sheet } from '../src/components/Sheet';
import { advanceHtml } from '../src/lib/documents';
import { qrSvg } from '../src/lib/labels';
import { parseMoneyInput } from '../src/lib/money-input';
import { qrMatrix } from '../src/services/qr';
import { useApp } from '../src/state/AppContext';
import { colors } from '../src/theme';

export default function Advances() {
  const app = useApp();
  const { store, device, actor } = app;
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'todos' | 'abierto' | 'cerrado'>('todos');
  const [items, setItems] = useState<AdvanceFull[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState<AdvanceFull | null>(null);
  const [doc, setDoc] = useState<{ html: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!store || !device) return;
    try {
      setItems(await store.searchAdvances({ branchId: device.branchId, text, status, limit: 100 }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer los anticipos.');
    }
  }, [store, device, text, status]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, app.dataVersion]),
  );
  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  if (!store || !device || !actor) return <Loading />;
  if (!app.can('caja.corte')) return <Screen><Banner kind="error" text="Solo el administrador puede consultar los anticipos." /></Screen>;

  const branch = app.myBranches.find((b) => b.id === device.branchId);
  const printable = (a: AdvanceFull, entryId?: string) => setDoc({ html: advanceHtml(a, { branchName: branch?.name, uptoEntryId: entryId ?? null, qr: (t) => qrSvg(qrMatrix(t)) }) });

  return (
    <Screen>
      <H1>Anticipos de limpias</H1>
      <Muted>Busca por nombre, teléfono, día (2026-10-22), código o escanea el QR del ticket. Los de otros equipos aparecen después de sincronizar.</Muted>
      <Field label="Buscar" value={text} onChangeText={setText} autoCapitalize="none" autoCorrect={false} placeholder="María, ANT-M1-0007, 2026-10-22..." />
      <ChipRow>
        {(['todos', 'abierto', 'cerrado'] as const).map((s) => <Chip key={s} label={s === 'todos' ? 'Todos' : s === 'abierto' ? 'Abiertos' : 'Cerrados'} selected={status === s} onPress={() => setStatus(s)} />)}
      </ChipRow>
      <Button title={scanning ? 'Cerrar cámara' : 'Escanear QR del ticket'} variant="secondary" onPress={() => setScanning((v) => !v)} />
      {scanning ? (
        <CameraScanner
          height={260}
          onScan={(data) => {
            setText(data);
            setScanning(false);
            void store.searchAdvances({ branchId: device.branchId, text: data, status: 'todos', limit: 5 }).then((r) => {
              if (r.length === 1) setOpen(r[0]!);
              else if (r.length === 0) setError('No se encontró un anticipo con ese QR en este teléfono. Sincroniza e inténtalo de nuevo.');
            });
          }}
        />
      ) : null}
      {error ? <Banner kind="error" text={error} /> : null}
      {items === null ? <Loading /> : null}
      {items && items.length === 0 ? <Muted>No hay anticipos con ese criterio.</Muted> : null}
      {(items ?? []).map((a) => {
        const s = summarizeAdvance(a);
        return (
          <Card key={a.id}>
            <Row label={a.clientName} value={formatMXN(s.balanceCents)} strong />
            <Muted>{a.code} · {a.concept} · {formatMxDateTime(a.createdAt)} · {s.status === 'abierto' ? 'Abierto' : 'Cerrado'}</Muted>
            <Button title="Abrir" variant="secondary" onPress={() => setOpen(a)} />
          </Card>
        );
      })}

      <AdvanceDetail
        advance={open}
        onClose={() => setOpen(null)}
        onChanged={(a) => { setOpen(a); app.notifyDataChanged(); void app.syncNow('auto'); void load(); }}
        onPrint={printable}
      />
      <DocPreview visible={doc !== null} title="Ticket de anticipo" html={doc?.html ?? ''} onClose={() => setDoc(null)} />
    </Screen>
  );
}

function AdvanceDetail({ advance, onClose, onChanged, onPrint }: {
  advance: AdvanceFull | null; onClose: () => void; onChanged: (a: AdvanceFull) => void; onPrint: (a: AdvanceFull, entryId?: string) => void;
}) {
  const app = useApp();
  const { store, device, actor } = app;
  const [mode, setMode] = useState<'abono' | 'uso' | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<AdvanceMethod>('efectivo');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setMode(null); setAmount(''); setNote(''); setError(null); setMsg(null);
  }, [advance?.id]);

  if (!advance) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;
  const sum = summarizeAdvance(advance);

  async function send(kind: 'abono' | 'uso' | 'cierre' | 'reapertura') {
    if (!store || !device || !actor || !advance) return;
    setError(null);
    setMsg(null);
    const cents = parseMoneyInput(amount);
    if ((kind === 'abono' || kind === 'uso') && (cents === null || cents <= 0)) return setError('Escribe un importe mayor a $0.');
    setBusy(true);
    try {
      const r = await store.addAdvanceEntry({
        actor, terminalId: device.terminalId, advanceId: advance.id, kind,
        amountCents: kind === 'abono' || kind === 'uso' ? (cents as number) : undefined, method: kind === 'abono' ? method : undefined, note: note || undefined,
      });
      setMode(null); setAmount(''); setNote('');
      setMsg(kind === 'abono' ? (r.cashRegistered ? 'Abono registrado y sumado al cajón.' : 'Abono registrado (no entró al cajón: no hay caja abierta o no fue en efectivo).') : kind === 'uso' ? 'Quedó anotado en qué se utilizó.' : kind === 'cierre' ? 'Anticipo cerrado.' : 'Anticipo abierto de nuevo.');
      onChanged(r.advance);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible title={`Anticipo ${advance.code}`} onClose={onClose} full>
      <H2>{advance.clientName}</H2>
      <Muted>{advance.clientPhone ? `Tel. ${advance.clientPhone} · ` : ''}{advance.concept} · recibió {advance.createdByName} el {formatMxDateTime(advance.createdAt)}</Muted>
      <Row label="Saldo a favor" value={formatMXN(sum.balanceCents)} strong valueColor={colors.gold} />
      <Muted>Dejó {formatMXN(sum.totalAbonosCents)} · se ha utilizado {formatMXN(sum.totalUsoCents)} · {sum.status === 'abierto' ? 'Abierto' : 'Cerrado'}</Muted>
      <Divider />
      {advance.entries.map((e) => (
        <Card key={e.id}>
          <Row label={`${ADVANCE_KIND_LABEL[e.kind]}${e.method ? ` (${ADVANCE_METHOD_LABEL[e.method]})` : ''}`} value={e.kind === 'abono' ? formatMXN(e.amountCents) : e.kind === 'uso' ? `-${formatMXN(e.amountCents)}` : ''} />
          <Muted>{formatMxDateTime(e.createdAt)} · {e.userName}{e.note ? ` · ${e.note}` : ''}</Muted>
          <Button title="Ticket de este movimiento" variant="secondary" onPress={() => onPrint(advance, e.id)} />
        </Card>
      ))}
      {msg ? <Banner kind="ok" text={msg} /> : null}
      {error ? <Banner kind="error" text={error} /> : null}
      {mode === null ? (
        <>
          {sum.status === 'abierto' ? (
            <>
              <Button title="Agregar abono" onPress={() => setMode('abono')} />
              <Button title="Anotar en qué se utilizó" variant="secondary" onPress={() => setMode('uso')} disabled={sum.balanceCents <= 0} />
              <Button title="Cerrar anticipo" variant="secondary" onPress={() => void send('cierre')} loading={busy} />
            </>
          ) : (
            <Button title="Abrir de nuevo" onPress={() => void send('reapertura')} loading={busy} />
          )}
          <Button title="Imprimir ticket completo (con QR)" variant="dark" onPress={() => onPrint(advance)} />
        </>
      ) : (
        <>
          <H2>{mode === 'abono' ? 'Nuevo abono' : 'En qué se utilizó el dinero'}</H2>
          <Field label={mode === 'abono' ? 'Cuánto deja ($)' : 'Cuánto se utilizó ($)'} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" hint={mode === 'uso' ? `Saldo disponible: ${formatMXN(sum.balanceCents)}` : undefined} />
          {mode === 'abono' ? (
            <ChipRow>{(['efectivo', 'tarjeta', 'transferencia'] as const).map((m) => <Chip key={m} label={ADVANCE_METHOD_LABEL[m]} selected={method === m} onPress={() => setMethod(m)} />)}</ChipRow>
          ) : null}
          <Field label={mode === 'abono' ? 'Nota (opcional)' : 'En qué se utilizó (obligatorio)'} value={note} onChangeText={setNote} autoCapitalize="sentences" hint={mode === 'uso' ? 'Ejemplo: 5 velas, aceite y hierbas' : undefined} />
          <Button title="Guardar" onPress={() => void send(mode)} loading={busy} disabled={amount.trim() === '' || (mode === 'uso' && note.trim().length < 3)} />
          <Button title="Cancelar" variant="secondary" onPress={() => { setMode(null); setError(null); }} disabled={busy} />
        </>
      )}
      <Button title="Cerrar ventana" variant="dark" onPress={onClose} disabled={busy} />
    </Sheet>
  );
}
