/**
 * Corte por periodo (SOLO gerente, en línea): de tal fecha a tal fecha. Junta los cortes de caja cerrados, lo vendido, lo que ganaste
 * y el dinero que salió de la caja (con motivo). Se puede GUARDAR (queda como foto) e imprimir. Ejemplo: el corte de la semana.
 */
import React, { useCallback, useState } from 'react';
import { formatMXN, formatMxDateTime, mxDayKey } from '@amara/shared';
import type { PeriodCutData, PeriodCutRecord } from '@amara/shared';
import { Banner, Button, Card, Chip, ChipRow, Divider, Field, H1, H2, Muted, Row, Screen } from '../src/components/ui';
import { OnlineGate, useOnlineLoad } from '../src/components/OnlineGate';
import { DocPreview } from '../src/components/DocPreview';
import { asList, buildQuery } from '../src/lib/admin-online';
import { periodCutHtml } from '../src/lib/documents';
import { presetRange, validateRange } from '../src/lib/period';
import type { PeriodPreset } from '../src/lib/period';
import { useApp } from '../src/state/AppContext';
import { colors } from '../src/theme';

export default function AdminPeriod() {
  const app = useApp();
  const { api, online, device } = app;
  const can = app.can('caja.corte');
  const branchId = device?.branchId;
  const today = mxDayKey(new Date());
  const init = presetRange('semana', today);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [preview, setPreview] = useState<(PeriodCutData & { branchName?: string }) | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);

  const loadSaved = useCallback(() => api.get<unknown>('/cash/period-cuts').then((d) => asList<PeriodCutRecord>(d)), [api]);
  const saved = useOnlineLoad(loadSaved, online && can);

  function pick(p: PeriodPreset) {
    const r = presetRange(p, today);
    setFrom(r.from);
    setTo(r.to);
    setPreview(null);
  }

  async function calculate() {
    setError(null);
    setNotice(null);
    const bad = validateRange(from, to);
    if (bad) return setError(bad);
    setBusy(true);
    try {
      setPreview(await api.get<PeriodCutData & { branchName?: string }>(`/cash/period-cuts/preview${buildQuery({ from, to, branchId })}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo calcular el corte.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const rec = await api.post<PeriodCutRecord>('/cash/period-cuts', { from, to, branchId, title: title.trim() || undefined, note: note.trim() || undefined });
      setNotice('Corte guardado. Queda en la lista de abajo y no se puede modificar.');
      setTitle('');
      setNote('');
      void saved.reload();
      setHtml(periodCutHtml(rec));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el corte.');
    } finally {
      setBusy(false);
    }
  }

  const p = preview;
  return (
    <OnlineGate permission="caja.corte" loading={false}>
      <Screen>
        <H1>Corte por periodo</H1>
        <Muted>Elige de qué fecha a qué fecha. Solo cuentan los cortes de caja ya cerrados en esos días.</Muted>
        <ChipRow>
          <Chip label="Esta semana" onPress={() => pick('semana')} />
          <Chip label="Semana pasada" onPress={() => pick('semana_pasada')} />
          <Chip label="Este mes" onPress={() => pick('mes')} />
        </ChipRow>
        <Field label="Desde (AAAA-MM-DD)" value={from} onChangeText={(t) => { setFrom(t); setPreview(null); }} autoCapitalize="none" autoCorrect={false} />
        <Field label="Hasta (AAAA-MM-DD)" value={to} onChangeText={(t) => { setTo(t); setPreview(null); }} autoCapitalize="none" autoCorrect={false} />
        <Button title="Calcular corte" onPress={() => void calculate()} loading={busy} />
        {error ? <Banner kind="error" text={error} /> : null}
        {notice ? <Banner kind="ok" text={notice} /> : null}

        {p ? (
          <Card tone="gold">
            <H2>Del {p.range.fromDay} al {p.range.toDay}</H2>
            <Row label="Cortes de caja realizados" value={String(p.cutsCount)} strong />
            {p.provisionalCount > 0 ? <Banner kind="warn" text={`${p.provisionalCount} corte(s) provisional(es): se concilian al sincronizar.`} /> : null}
            {p.openSessions > 0 ? <Banner kind="warn" text={`${p.openSessions} caja(s) de estos días siguen abiertas y no están incluidas.`} /> : null}
            <Divider />
            <Row label="Ventas netas" value={formatMXN(p.sales.netCents)} strong />
            <Row label="Tickets" value={String(p.sales.ticketCount)} />
            <Row label="Costo de lo vendido" value={formatMXN(p.sales.cogsCents)} />
            <Row label="Lo que ganaste" value={formatMXN(p.sales.grossProfitCents)} strong valueColor={colors.ok} />
            <Divider />
            <Row label="Efectivo esperado" value={formatMXN(p.totals.expectedCents)} />
            <Row label="Efectivo contado" value={formatMXN(p.totals.countedCents)} />
            <Row label="Diferencia" value={formatMXN(p.totals.differenceCents)} valueColor={p.totals.differenceCents === 0 ? undefined : colors.danger} strong />
            <Divider />
            <Row label="Retiros" value={formatMXN(p.totals.withdrawalsCents)} />
            <Row label="Gastos" value={formatMXN(p.totals.expensesCents)} />
            {p.outflows.map((o, i) => <Muted key={i}>{formatMxDateTime(o.at)} · {o.type === 'retiro' ? 'Retiro' : 'Gasto'} {formatMXN(o.amountCents)} · {o.concept} ({o.userName})</Muted>)}
            <Row label="Ganancia menos salidas" value={formatMXN(p.profitAfterExpensesCents)} strong />
            {p.advances.count > 0 ? <Muted>Anticipos de limpias: {formatMXN(p.advances.abonosCents)} recibidos en {p.advances.count} abono(s); usado {formatMXN(p.advances.usosCents)}.</Muted> : null}
            <Muted>{p.disclaimer}</Muted>
            <Field label="Nombre del corte (opcional)" value={title} onChangeText={setTitle} placeholder={`Corte del ${from} al ${to}`} />
            <Field label="Nota (opcional)" value={note} onChangeText={setNote} />
            <Button title="Guardar este corte" onPress={() => void save()} loading={busy} />
          </Card>
        ) : null}

        <H2>Cortes guardados</H2>
        {saved.error ? <Banner kind="error" text={saved.error} /> : null}
        {saved.data && saved.data.length === 0 ? <Muted>Aún no has guardado ningún corte por periodo.</Muted> : null}
        {(saved.data ?? []).map((r) => (
          <Card key={r.id}>
            <Row label={r.title} value={formatMXN(r.data.sales.netCents)} strong />
            <Muted>{r.data.cutsCount} corte(s) · ganaste {formatMXN(r.data.sales.grossProfitCents)} · guardado {formatMxDateTime(r.createdAt)} por {r.createdByName}</Muted>
            <Button title="Ver e imprimir" variant="secondary" onPress={() => setHtml(periodCutHtml(r))} />
          </Card>
        ))}
        <DocPreview visible={html !== null} title="Corte por periodo" html={html ?? ''} onClose={() => setHtml(null)} />
      </Screen>
    </OnlineGate>
  );
}
