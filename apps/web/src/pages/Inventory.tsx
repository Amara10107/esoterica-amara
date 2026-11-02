import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, asList } from '../lib/api.ts';
import { useAsync, useDebounced } from '../lib/hooks.ts';
import { formatMXN, formatQty } from '../lib/format.ts';
import {
  DEFAULT_INVENTORY_FILTERS, countByStatus, filterInventory, uniqueCategories, type InventoryFilters, type StockStatus,
} from '../lib/inventory.ts';
import type { CatalogProduct, InventoryRow, StockMovementRow } from '../lib/types.ts';
import { Card, ConfirmDialog, ErrorBox, Empty, Modal, PageHeader, Spinner, TableWrap } from '../components/ui.tsx';
import { ProductEditModal } from '../components/ProductForms.tsx';
import { BranchSelect, StockBadge, Thumb } from '../components/common.tsx';
import { MovementsTable } from '../components/MovementsTable.tsx';
import { useAuth, useToast } from '../context.tsx';
import { errorMessage } from '../lib/hooks.ts';

const PAGE = 200;

export function Inventory() {
  const { can } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialStatus = params.get('estado');
  const [f, setF] = useState<InventoryFilters>({
    ...DEFAULT_INVENTORY_FILTERS,
    status: initialStatus === 'agotado' || initialStatus === 'bajo' ? (initialStatus as StockStatus) : 'todos',
  });
  const [limit, setLimit] = useState(PAGE);
  const [history, setHistory] = useState<InventoryRow | null>(null);
  // v2.2: editar y archivar el producto desde esta pantalla (mismo formulario que Catálogo).
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [toggling, setToggling] = useState<InventoryRow | null>(null);
  const [deleting, setDeleting] = useState<InventoryRow | null>(null);
  // v2.4.4: en «Todas las sucursales» se ocultan los renglones en 0 de una sucursal si ese producto sí tiene existencia en otra.
  const [showEmptyBranches, setShowEmptyBranches] = useState(false);
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(f.q, 200);

  // Se pide por sucursal y se busca/filtra en el navegador con la misma lógica probada.
  const res = useAsync(
    (signal) => api.get<unknown>('/inventory', { branchId: f.branchId }, signal).then((d) => asList<InventoryRow>(d)),
    [f.branchId],
  );
  const rows = res.data ?? [];
  // Renglones visibles: sin los «vacíos» de otra sucursal (salvo que se pida verlos, se filtre una sucursal o se busquen agotados).
  const source = useMemo(() => {
    if (showEmptyBranches || f.branchId || f.status === 'agotado') return rows;
    const withStock = new Set(rows.filter((r) => r.qty > 0).map((r) => r.variantId));
    return rows.filter((r) => r.qty > 0 || !withStock.has(r.variantId));
  }, [rows, showEmptyBranches, f.branchId, f.status]);
  const hiddenEmpty = rows.length - source.length;
  const filtered = useMemo(() => filterInventory(source, { ...f, q: dq }), [source, f, dq]);
  const counts = useMemo(() => countByStatus(rows.filter((r) => !r.archived)), [rows]);
  const categories = useMemo(() => uniqueCategories(rows), [rows]);
  const totalUnits = filtered.reduce((a, r) => a + Math.max(0, r.qty), 0);
  const shown = filtered.slice(0, limit);

  const openEdit = async (r: InventoryRow) => {
    try {
      const p = await api.get<CatalogProduct>(`/catalog/products/${r.productId}`);
      setEditing({ ...p, specs: p.specs ?? {}, variants: p.variants ?? [] });
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  const toggleArchive = async () => {
    if (!toggling) return;
    setBusy(true);
    try {
      await api.post(`/catalog/products/${toggling.productId}/${toggling.archived ? 'restore' : 'archive'}`, {});
      notify(toggling.archived ? 'Producto restaurado.' : 'Producto archivado (no se borra).');
      setToggling(null);
      res.reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.post(`/catalog/products/${deleting.productId}/delete`, {});
      notify('Producto borrado. Quedó en el historial de borrados (Catálogo → Estado → Historial de borrados).');
      setDeleting(null);
      res.reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };
  const set = <K extends keyof InventoryFilters>(k: K, v: InventoryFilters[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setLimit(PAGE);
  };

  return (
    <>
      <PageHeader
        title="Inventario"
        subtitle="Existencias por producto, variante y sucursal. Los cambios de existencia solo se hacen con movimientos registrados."
        actions={<button type="button" className="btn" onClick={() => navigate('/catalogo?estado=borrado')}>Historial de borrados</button>}
      />
      <div className="chips status-chips">
        {(
          [
            ['todos', `Todos (${rows.filter((r) => !r.archived).length})`],
            ['agotado', `Agotados (${counts.agotado})`],
            ['bajo', `Bajo mínimo (${counts.bajo})`],
            ['ok', `Disponibles (${counts.ok})`],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`chip ${f.status === id ? 'chip-active' : ''}`} onClick={() => set('status', id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="filters">
        <label className="inline-field grow">
          <span>Buscar</span>
          <input
            type="search"
            value={f.q}
            placeholder="Nombre, categoría, variante, SKU o código"
            onChange={(e) => set('q', e.target.value)}
          />
        </label>
        <label className="inline-field">
          <span>Sucursal</span>
          <BranchSelect value={f.branchId} onChange={(v) => set('branchId', v)} allLabel="Todas" />
        </label>
        <label className="inline-field">
          <span>Categoría</span>
          <select value={f.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={f.showArchived} onChange={(e) => set('showArchived', e.target.checked)} />
          <span>Mostrar archivados</span>
        </label>
        <label className="check" title="En Todas las sucursales, muestra también los renglones en 0 de una sucursal aunque el producto sí tenga existencia en otra.">
          <input type="checkbox" checked={showEmptyBranches} onChange={(e) => setShowEmptyBranches(e.target.checked)} />
          <span>Mostrar sucursales sin existencia{hiddenEmpty > 0 && !showEmptyBranches ? ` (${hiddenEmpty} ocultos)` : ''}</span>
        </label>
      </div>

      {res.loading && !res.data && <Spinner />}
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {res.data && (
        <Card>
          <p className="muted small">
            {formatQty(filtered.length)} renglón(es) &middot; {formatQty(totalUnits)} pieza(s) en existencia
          </p>
          {filtered.length === 0 ? (
            <Empty>No hay productos con esos filtros.</Empty>
          ) : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Foto</th>
                    <th>Producto</th>
                    <th>Variante</th>
                    <th>Categoría</th>
                    <th>Sucursal / lugar</th>
                    <th className="num">Existencia</th>
                    <th className="num">Mínimo</th>
                    <th className="num">Costo</th>
                    <th className="num">Precio</th>
                    <th>Códigos</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={`${r.variantId}-${r.branchId}`} className={r.archived ? 'row-archived' : ''}>
                      <td>
                        <Thumb src={r.photo} alt={r.productName} />
                      </td>
                      <td>
                        <strong>{r.productName}</strong>
                        {r.archived && <span className="muted"> (archivado)</span>}
                      </td>
                      <td>{r.variantLabel}</td>
                      <td>{r.category}</td>
                      <td>
                        {r.branchName ?? ''}
                        {r.location ? <div className="muted small">{r.location}</div> : null}
                      </td>
                      <td className="num strong">{formatQty(r.qty)}</td>
                      <td className="num">{formatQty(r.minStock)}</td>
                      <td className="num">{formatMXN(r.costCents)}</td>
                      <td className="num">{formatMXN(r.priceCents)}</td>
                      <td className="small">
                        {r.sku && <div>SKU {r.sku}</div>}
                        {r.barcode && <div>CB {r.barcode}</div>}
                        {r.code && <div className="muted">{r.code}</div>}
                      </td>
                      <td>
                        <StockBadge qty={r.qty} minStock={r.minStock} />
                      </td>
                      <td className="row-actions">
                        <button type="button" className="btn btn-sm" onClick={() => setHistory(r)}>
                          Historial
                        </button>
                        {can('productos.ver') && (
                          <button type="button" className="btn btn-sm" onClick={() => navigate('/etiquetas', { state: { rows: [r] } })}>
                            Etiqueta
                          </button>
                        )}
                        {can('productos.editar') && (
                          <>
                            <button type="button" className="btn btn-sm" onClick={() => void openEdit(r)}>
                              Editar
                            </button>
                            <button type="button" className="btn btn-sm" onClick={() => setToggling(r)}>
                              {r.archived ? 'Restaurar' : 'Archivar'}
                            </button>
                            <button type="button" className="btn btn-sm btn-danger" onClick={() => setDeleting(r)}>
                              Borrar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
          {filtered.length > shown.length && (
            <div className="center">
              <button type="button" className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                Mostrar más ({filtered.length - shown.length} restantes)
              </button>
            </div>
          )}
        </Card>
      )}
      {history && <HistoryModal row={history} onClose={() => setHistory(null)} />}
      {editing && (
        <ProductEditModal
          product={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            res.reload();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Borrar producto"
          message={`${deleting.productName}: se quita del Inventario, del Catálogo y de la caja (todas sus variantes y sucursales). NO se pierde la información: las ventas, tickets y movimientos antiguos conservan su nombre y el producto queda en el Historial de borrados, donde puedes restaurarlo cuando quieras.`}
          confirmLabel="Borrar"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={() => void doDelete()}
        />
      )}
      {toggling && (
        <ConfirmDialog
          title={toggling.archived ? 'Restaurar producto' : 'Archivar producto'}
          message={
            toggling.archived
              ? `${toggling.productName}: Restaurar hace que el producto vuelva a aparecer para vender (caja, escáner y búsquedas). Su historial y existencias no cambian.`
              : `${toggling.productName}: Archivar NO borra nada: el producto y todo su historial de ventas se conservan y las existencias quedan tal cual. Lo que cambia es que deja de aparecer para vender (caja, escáner y búsquedas). Puedes restaurarlo cuando quieras desde la web: Inventario → Mostrar archivados → Restaurar.`
          }
          confirmLabel={toggling.archived ? 'Restaurar' : 'Archivar'}
          busy={busy}
          onCancel={() => setToggling(null)}
          onConfirm={() => void toggleArchive()}
        />
      )}
    </>
  );
}

function HistoryModal({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const res = useAsync(
    (signal) =>
      api
        .get<unknown>('/inventory/movements', { variantId: row.variantId, branchId: row.branchId }, signal)
        .then((d) => asList<StockMovementRow>(d)),
    [row.variantId, row.branchId],
  );
  return (
    <Modal title={`Historial: ${row.productName} ${row.variantLabel}`} size="xl" onClose={onClose}>
      {res.loading && <Spinner />}
      {res.error && <ErrorBox error={res.error} onRetry={res.reload} />}
      {res.data && <MovementsTable rows={res.data} showProduct={false} />}
    </Modal>
  );
}
