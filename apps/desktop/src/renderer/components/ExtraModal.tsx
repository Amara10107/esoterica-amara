/**
 * Botón "Extra" (v2.1): el vendedor ELIGE uno de los extras que el administrador configuró para el TIPO de este producto.
 * No se escribe monto ni nota: el precio es fijo y solo lo cambia el administrador (Ajustes / web / móvil de administrador).
 */
import { useState } from 'react';
import type { ExtraOption } from '@amara/shared';
import { money } from '../lib/format.ts';
import { Modal } from './Modal.tsx';

export function ExtraModal({
  productName, options, onClose, onPick,
}: {
  productName: string;
  options: ExtraOption[];
  onClose: () => void;
  /** Devuelve un mensaje de error (para mostrarlo) o null si se agregó. */
  onPick: (option: ExtraOption) => string | null;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title="Agregar Extra" size="sm" onClose={onClose} footer={<button className="btn" onClick={onClose}>Cerrar</button>}>
      <div className="stack">
        <div className="preview">Extra para <strong>{productName}</strong>. Elige uno; el precio lo fija el administrador. Se suma al total y no descuenta existencias.</div>
        {options.length === 0 && <div className="muted">Este tipo de producto no tiene extras configurados.</div>}
        {options.map((o) => (
          <button
            key={o.id}
            className="btn btn-lg row-between"
            onClick={() => {
              const err = onPick(o);
              if (err) setError(err);
            }}
          >
            <span>{o.name}</span>
            <strong>{money(o.priceCents)}</strong>
          </button>
        ))}
        {error && <div className="field-error">{error}</div>}
      </div>
    </Modal>
  );
}
