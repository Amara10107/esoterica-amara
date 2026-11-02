import { useState } from 'react';
import { buildPeriodCutLines, formatMxDateTime } from '@amara/shared';
import type { PeriodCutData, PeriodCutRecord } from '@amara/shared';
import { api, asList } from '../lib/api.ts';
import { useAsync } from '../lib/hooks.ts';
import { formatMXN } from '../lib/format.ts';
import { addDays, mxTodayKey } from '../lib/dates.ts';
import { printHtml, ticketLinesToHtml } from '../lib/ticketPrint.ts';
import { Alert, Card, Empty, ErrorBox, Field, KpiCard, PageHeader, Spinner, TableWrap } from '../components/ui.tsx';
import { BranchSelect, DateRangeBar } from '../components/common.tsx';
import { useToast } from '../context.tsx';

type Preview = PeriodCutData & { branchName: string };

async function printRecord(rec: PeriodCutRecord) {
  const lines = buildPeriodCutLines(rec, { fmtMoney: formatMXN, fmtDateTime: formatMxDateTime });
  printHtml(await ticketLinesToHtml(lines));
}

export function PeriodCuts() {
  const { notify } = useToast();
  const today = mxTodayKey();
  const [range, setRange] = useState({ from: addDays(today, -6), to: today });
  const [branchId, setBranchId] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = range.from !== '' && range.to !== '' && range.from <= range.to;

  const prev = useAsync((s) => api.get<Preview>('/cash/period-cuts/preview', { from: range.from, to: range.to, branchId }, s), [range.from, range.to, branchId], valid);
  const saved = useAsync((s) => api.get<unknown>('/cash/period-cuts', undefined, s).then((d) => asList<PeriodCutRecord>(d)), []);
  const p = prev.data;

  async function save() {
    setSaving(true);
    try {
      const rec = await api.post<PeriodCutRecord>('/cash/period-cuts', { from: range.from, to: range.to, branchId: branchId || undefined, title: title || undefined, note: note || undefined });
      notify('Corte del periodo guardado.');
      setTitle(''); setNote('');
      saved.reload();
      void printRecord(rec).catch(() => undefined);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo guardar el corte', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Corte por periodo" subtitle="Suma los cortes de caja diarios ya cerrados entre dos fechas: cuántos cortes hay, lo vendido y lo ganado. Solo gerente." />
      <Alert tone="info" title="Cómo funciona">
        Solo cuentan las cajas ya <strong>cerradas</strong> dentro del rango. Al guardar queda una foto del corte que no se edita ni se borra. «Lo ganado» es ventas netas menos el costo de lo vendido (estimado).
      </Alert>
      <div className="filters">
        <DateRangeBar from={range.from} to={range.to} onChange={(from, to) => setRange({ from, to })} />
        <label className="inline-field"><span>Sucursal</span><BranchSelect value={branchId} onChange={setBranchId} allLabel="Todas" /></label>
      </div>
      {prev.loading && !p && <Spinner />}
      {prev.error && <ErrorBox error={prev.error} onRetry={prev.reload} />}
      {p && (
        <>
          <div className="kpi-row">
            <KpiCard kind="esperado" title="Cortes cerrados" value={String(p.cutsCount)} sub={p.openSessions > 0 ? `${p.openSessions} caja(s) siguen abiertas` : undefined} />
            <KpiCard kind="contado" title="Vendido (neto)" value={formatMXN(p.sales.netCents)} sub={`${p.sales.ticketCount} tickets`} />
            <KpiCard kind="esperado" title="Lo que ganaste" value={formatMXN(p.sales.grossProfitCents)} sub={`Después de gastos: ${formatMXN(p.profitAfterExpensesCents)}`} />
          </div>
          <Card>
            <div className="totals">
              <div><span>Efectivo esperado (suma de cortes)</span><span>{formatMXN(p.totals.expectedCents)}</span></div>
              <div><span>Efectivo contado (suma de cortes)</span><span>{formatMXN(p.totals.countedCents)}</span></div>
              <div><span>Diferencia</span><span>{formatMXN(p.totals.differenceCents)}</span></div>
              <div><span>Retiros</span><span>{formatMXN(p.totals.withdrawalsCents)}</span></div>
              <div><span>Gastos</span><span>{formatMXN(p.totals.expensesCents)}</span></div>
              <div><span>Anticipos de limpias: abonos / usos</span><span>{formatMXN(p.advances.abonosCents)} / {formatMXN(p.advances.usosCents)}</span></div>
            </div>
            {p.provisionalCount > 0 && <p className="muted small">{p.provisionalCount} corte(s) provisional(es): sus cifras pueden cambiar.</p>}
          </Card>
          <Card>
            <div className="form">
              <Field label="Título (opcional)"><input className="input" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} /></Field>
              <Field label="Nota (opcional)"><input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
              <button type="button" className="btn btn-primary" disabled={saving || p.cutsCount === 0} onClick={save}>
                {saving ? 'Guardando…' : 'Guardar corte del periodo e imprimir'}
              </button>
              {p.cutsCount === 0 && <p className="muted small">No hay cortes cerrados en ese rango.</p>}
            </div>
          </Card>
        </>
      )}
      <h3>Cortes guardados</h3>
      {saved.error && <ErrorBox error={saved.error} onRetry={saved.reload} />}
      <Card>
        {(saved.data ?? []).length === 0 ? <Empty>Aún no hay cortes de periodo guardados.</Empty> : (
          <TableWrap>
            <table className="table">
              <thead><tr><th>Título</th><th>Sucursal</th><th>Guardado</th><th className="num">Cortes</th><th className="num">Vendido</th><th className="num">Ganado</th><th /></tr></thead>
              <tbody>
                {(saved.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{r.title}</td><td>{r.branchName}</td><td>{formatMxDateTime(r.createdAt)} · {r.createdByName}</td>
                    <td className="num">{r.data.cutsCount}</td><td className="num">{formatMXN(r.data.sales.netCents)}</td><td className="num">{formatMXN(r.data.sales.grossProfitCents)}</td>
                    <td className="row-actions"><button type="button" className="btn btn-sm" onClick={() => void printRecord(r)}>Imprimir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
