import { useState } from 'react';
import { ADVANCE_KIND_LABEL, ADVANCE_METHOD_LABEL, buildAdvanceTicketLines, formatMxDateTime } from '@amara/shared';
import type { AdvanceFull, AdvanceEntry } from '@amara/shared';
import { api, asList } from '../lib/api.ts';
import { useAsync } from '../lib/hooks.ts';
import { formatMXN } from '../lib/format.ts';
import { printHtml, ticketLinesToHtml } from '../lib/ticketPrint.ts';
import { Alert, Badge, Card, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, TableWrap } from '../components/ui.tsx';
import { useBranches, useToast } from '../context.tsx';

interface Summary { balanceCents: number; abonosCents: number; usosCents: number; status: 'abierto' | 'cerrado' }
type AdvanceRow = AdvanceFull & { summary: Summary };

async function printAdvance(a: AdvanceFull, branchName: string, uptoEntryId?: string) {
  const lines = buildAdvanceTicketLines(a, { branchName, uptoEntryId, fmtMoney: formatMXN, fmtDateTime: formatMxDateTime });
  printHtml(await ticketLinesToHtml(lines));
}

export function Advances() {
  const { branchName } = useBranches();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'abierto' | 'cerrado' | 'todos'>('abierto');
  const [openId, setOpenId] = useState<string | null>(null);
  const res = useAsync((s) => api.get<unknown>('/advances', { text: query, status }, s).then((d) => asList<AdvanceRow>(d)), [query, status]);
  const rows = res.data ?? [];

  return (
    <>
      <PageHeader title="Anticipos de limpias" subtitle="Dinero que las personas dejan por adelantado. Solo gerente: busca por nombre, día (AAAA-MM-DD) o código, agrega abonos y registra en qué se usó." />
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setQuery(text.trim()); }}>
        <label className="inline-field"><span>Buscar</span>
          <input className="input" value={text} placeholder="Nombre, día o código ANT-…" onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="inline-field"><span>Estado</span>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="abierto">Abiertos</option><option value="cerrado">Cerrados</option><option value="todos">Todos</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary">Buscar</button>
      </form>
      {res.loading && !res.data && <Spinner />}
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {res.data && (
        <Card>
          {rows.length === 0 ? <Empty>No hay anticipos con ese filtro.</Empty> : (
            <TableWrap>
              <table className="table">
                <thead><tr><th>Código</th><th>Dejó</th><th>Día</th><th>Sucursal</th><th className="num">Abonos</th><th className="num">Usado</th><th className="num">Saldo</th><th>Estado</th><th /></tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td>{a.code}</td><td>{a.clientName}</td><td>{formatMxDateTime(a.createdAt)}</td><td>{branchName(a.branchId)}</td>
                      <td className="num">{formatMXN(a.summary.abonosCents)}</td><td className="num">{formatMXN(a.summary.usosCents)}</td>
                      <td className="num strong">{formatMXN(a.summary.balanceCents)}</td>
                      <td><Badge tone={a.summary.status === 'abierto' ? 'ok' : 'muted'}>{a.summary.status === 'abierto' ? 'Abierto' : 'Cerrado'}</Badge></td>
                      <td className="row-actions"><button type="button" className="btn btn-sm" onClick={() => setOpenId(a.id)}>Abrir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      )}
      {openId && <AdvanceDetail id={openId} onClose={() => setOpenId(null)} onChanged={res.reload} />}
    </>
  );
}

function AdvanceDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { branchName } = useBranches();
  const { notify } = useToast();
  const det = useAsync((s) => api.get<AdvanceRow>(`/advances/${id}`, undefined, s), [id]);
  const a = det.data;
  const [mode, setMode] = useState<'abono' | 'uso' | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(kind: AdvanceEntry['kind']) {
    const cents = Math.round(Number(amount.replace(',', '.')) * 100);
    if ((kind === 'abono' || kind === 'uso') && !(cents > 0)) { notify('Escribe un importe mayor a $0', 'error'); return; }
    if (kind === 'uso' && note.trim().length < 3) { notify('Escribe en qué se utilizó (por ejemplo: 5 velas)', 'error'); return; }
    setBusy(true);
    try {
      await api.post(`/advances/${id}/entries`, { kind, amountCents: kind === 'abono' || kind === 'uso' ? cents : undefined, method: kind === 'abono' ? method : undefined, note: note.trim() || undefined });
      notify('Movimiento registrado.');
      setMode(null); setAmount(''); setNote('');
      det.reload(); onChanged();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo registrar', 'error');
    } finally { setBusy(false); }
  }

  return (
    <Modal title={a ? `Anticipo ${a.code}` : 'Anticipo'} size="lg" onClose={onClose}>
      {det.loading && !a && <Spinner />}
      {det.error && <ErrorBox error={det.error} onRetry={det.reload} />}
      {a && (
        <div className="form">
          <div className="detail-grid">
            <div><span className="muted small">Dejó el dinero</span><div>{a.clientName}{a.clientPhone ? ` · ${a.clientPhone}` : ''}</div></div>
            <div><span className="muted small">Día</span><div>{formatMxDateTime(a.createdAt)}</div></div>
            <div><span className="muted small">Para</span><div>{a.concept || '-'}</div></div>
            <div><span className="muted small">Saldo</span><div className="strong">{formatMXN(a.summary.balanceCents)} ({a.summary.status})</div></div>
          </div>
          <Alert tone="info">Un abono agregado desde la web queda registrado, pero no entra al cajón de ninguna caja. Si el dinero se recibió en caja, regístralo en el punto de venta.</Alert>
          <TableWrap>
            <table className="table">
              <thead><tr><th>Cuándo</th><th>Movimiento</th><th>Quién</th><th>Nota</th><th className="num">Importe</th><th /></tr></thead>
              <tbody>
                {a.entries.map((e) => (
                  <tr key={e.id}>
                    <td>{formatMxDateTime(e.createdAt)}</td>
                    <td>{ADVANCE_KIND_LABEL[e.kind]}{e.method ? ` (${ADVANCE_METHOD_LABEL[e.method]})` : ''}</td>
                    <td>{e.userName}</td><td>{e.note}</td>
                    <td className="num">{e.kind === 'abono' || e.kind === 'uso' ? formatMXN(e.amountCents) : '-'}</td>
                    <td className="row-actions"><button type="button" className="btn btn-sm" onClick={() => void printAdvance(a, branchName(a.branchId), e.id)}>Ticket</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          {mode && (
            <div className="form">
              <Field label={mode === 'abono' ? 'Importe del abono ($)' : 'Importe usado ($)'} required>
                <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              {mode === 'abono' && (
                <Field label="Método">
                  <select className="input" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                    <option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option>
                  </select>
                </Field>
              )}
              <Field label={mode === 'uso' ? 'En qué se utilizó (ej. 5 velas)' : 'Nota (opcional)'} required={mode === 'uso'}>
                <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="row">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send(mode)}>{busy ? 'Guardando…' : 'Registrar'}</button>
                <button type="button" className="btn" onClick={() => setMode(null)}>Cancelar</button>
              </div>
            </div>
          )}
          {!mode && (
            <div className="row">
              {a.summary.status === 'abierto' ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => setMode('abono')}>Agregar abono</button>
                  <button type="button" className="btn" onClick={() => setMode('uso')}>Registrar uso</button>
                  <button type="button" className="btn" disabled={busy} onClick={() => void send('cierre')}>Cerrar anticipo</button>
                </>
              ) : (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send('reapertura')}>Abrir de nuevo</button>
              )}
              <button type="button" className="btn" onClick={() => void printAdvance(a, branchName(a.branchId))}>Imprimir ticket con QR</button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
