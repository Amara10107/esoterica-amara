import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMxDateTime } from '@amara/shared';
import { filterByBranch, severityOf, LOW_STOCK_REFRESH_MS } from '../lib/notifications.ts';
import { formatMXN, formatQty } from '../lib/format.ts';
import { Alert, Badge, Card, Empty, ErrorBox, KpiCard, PageHeader, Spinner, TableWrap } from '../components/ui.tsx';
import { BranchSelect } from '../components/common.tsx';
import { useBranches } from '../context.tsx';
import { useNotifications } from '../notifications.tsx';

/** Hora local del navegador "14:05:09" de una marca de tiempo en ms. */
function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function NotificationsPage() {
  const { items, counts, openCash, loading, error, updatedAt, refresh } = useNotifications();
  const { branchName } = useBranches();
  const [branchId, setBranchId] = useState('');
  const rows = filterByBranch(items, branchId);
  const out = rows.filter((r) => severityOf(r) === 'agotado').length;
  const openCashRows = branchId ? openCash.filter((c) => c.branchId === branchId) : openCash;

  return (
    <>
      <PageHeader
        title="Notificaciones"
        subtitle={`Existencias bajas y cajas sin cerrar. Se actualiza solo cada ${LOW_STOCK_REFRESH_MS / 1000} segundos y al volver a esta ventana.`}
        actions={
          <button type="button" className="btn" onClick={refresh} disabled={loading}>
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>
        }
      />
      <div className="filters">
        <label className="inline-field">
          <span>Sucursal</span>
          <BranchSelect value={branchId} onChange={setBranchId} allLabel="Todas" />
        </label>
        {updatedAt !== null && <span className="muted small">Última actualización: {clock(updatedAt)}</span>}
      </div>
      {loading && updatedAt === null && !error && <Spinner />}
      {error && <ErrorBox error={error} onRetry={refresh} />}
      {updatedAt !== null && (
        <>
          <div className="kpi-row">
            <KpiCard kind="conteo" title="Productos con aviso" value={formatQty(rows.length)} sub={`${formatQty(counts.total)} en total entre todas las sucursales`} />
            <KpiCard kind="conteo" title="Agotados" value={formatQty(out)} sub="Sin existencia disponible" />
            <KpiCard kind="conteo" title="En o bajo el mínimo" value={formatQty(rows.length - out)} sub="Conviene resurtir pronto" />
            <KpiCard kind="conteo" title="Cajas sin cerrar" value={formatQty(openCashRows.length)} sub="Abiertas desde un día anterior" />
          </div>
          <Card title="Cajas sin cerrar" actions={<Link to="/caja">Ver cortes de caja</Link>}>
            {openCashRows.length === 0 ? (
              <Empty>No hay ninguna caja que haya quedado abierta de un día anterior.</Empty>
            ) : (
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Sucursal</th>
                      <th>Terminal</th>
                      <th>Se abrió</th>
                      <th className="num">Fondo de apertura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openCashRows.map((c) => (
                      <tr key={c.id}>
                        <td>{c.branchName || branchName(c.branchId) || '-'}</td>
                        <td>{c.terminalLabel}</td>
                        <td>{formatMxDateTime(c.openedAt)}</td>
                        <td className="num">{formatMXN(c.openingCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            {openCashRows.length > 0 && (
              <Alert tone="warn" title="Quedó abierta desde un día anterior">
                A alguien se le olvidó hacer el corte. El cierre se hace desde la computadora o teléfono donde se abrió (pestaña Caja); desde aquí solo se puede ver, no cerrar a distancia.
              </Alert>
            )}
          </Card>
          <Card title="Productos que requieren atención" actions={<Link to="/inventario?estado=bajo">Ver en inventario</Link>}>
            {rows.length === 0 ? (
              <Empty>Todo en orden: ningún producto está en o bajo su mínimo.</Empty>
            ) : (
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Variante</th>
                      <th>Categoría</th>
                      <th>Sucursal</th>
                      <th className="num">Existencia</th>
                      <th className="num">Mínimo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={`${r.variantId}-${r.branchId}`}>
                        <td><strong>{r.productName}</strong></td>
                        <td>{r.label || <span className="muted">-</span>}</td>
                        <td>{r.category || <span className="muted">-</span>}</td>
                        <td>{branchName(r.branchId) || '-'}</td>
                        <td className={`num ${r.qty <= 0 ? 'neg' : ''}`}>{r.qty}</td>
                        <td className="num">{r.minStock}</td>
                        <td>{severityOf(r) === 'agotado' ? <Badge tone="danger">Agotado</Badge> : <Badge tone="warn">En o bajo el mínimo</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
            {rows.some((r) => r.qty < 0) && (
              <Alert tone="warn" title="Existencias negativas">
                Hay productos con existencia negativa heredada de una venta sincronizada sin conexión. No se pueden vender hasta regularizar el inventario.
              </Alert>
            )}
          </Card>
        </>
      )}
    </>
  );
}
