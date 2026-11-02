/**
 * Teléfono como escáner (v2.1). Lo ve el gerente y el vendedor:
 *  - GERENTE: vincula sin más.
 *  - VENDEDOR: para mostrar el código QR necesita un token de seguridad (propósito "escáner") o la contraseña de un administrador.
 * Revocar teléfonos y activar/desactivar el servidor del teléfono se hace en Ajustes (solo gerente).
 */
import { useEffect, useState } from 'react';
import type { LanState } from '../../shared/ipc.ts';
import { Banner } from '../components/Field.tsx';
import { call, errorText, onEvent } from '../lib/api.ts';
import { dateTime } from '../lib/format.ts';
import { PairModal } from './Settings.tsx';

export function PhoneScreen() {
  const [lan, setLan] = useState<LanState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);

  useEffect(() => {
    call('lan:state').then(setLan).catch((e) => setError(errorText(e)));
    return onEvent('evt:lan', setLan);
  }, []);

  return (
    <div className="page">
      <h1>Teléfono como escáner</h1>
      <p className="muted">Conecta un teléfono a la misma red Wi-Fi que esta PC y úsalo para escanear códigos. Si eres vendedor, necesitas un token de seguridad del administrador.</p>
      {error && <Banner kind="error">{error}</Banner>}
      {lan && !lan.listening && <Banner kind="warn">{lan.error ?? 'El servidor del teléfono no está activo. Pide al gerente que lo active en Ajustes → Escáner.'}</Banner>}
      <div className="card">
        <h3>Teléfonos vinculados</h3>
        {lan?.devices.map((d) => (
          <div key={d.id} className="hist">
            <strong>{d.name}</strong>
            <div className="muted small">Vinculado {dateTime(d.pairedAt)} - Última lectura {d.lastSeenAt ? dateTime(d.lastSeenAt) : 'nunca'}</div>
          </div>
        ))}
        {lan && lan.devices.length === 0 && <div className="muted">Ningún teléfono vinculado.</div>}
        <button className="btn btn-gold" onClick={() => setPairOpen(true)} disabled={!lan?.listening}>Vincular un teléfono</button>
      </div>
      {pairOpen && lan && <PairModal lan={lan} onClose={() => { void call('lan:cancelPairing').then(setLan).catch(() => undefined); setPairOpen(false); }} />}
    </div>
  );
}
