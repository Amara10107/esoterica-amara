/** Sucursales (administrador, en línea): ver, activar y desactivar. */
import React, { useCallback, useState } from 'react';
import { Banner, Button, Card, H1, Muted, Row, Screen } from '../src/components/ui';
import { OnlineGate, useOnlineLoad } from '../src/components/OnlineGate';
import { asList } from '../src/lib/admin-online';
import { useApp } from '../src/state/AppContext';

interface B { id: string; name: string; address?: string; active?: boolean; locations?: string[] }

export default function AdminBranches() {
  const app = useApp();
  const { api, online } = app;
  const can = app.can('sucursales.gestionar');
  const load = useCallback(() => api.get<unknown>('/admin/branches').then((d) => asList<B>(d)), [api]);
  const { data, error, reload } = useOnlineLoad(load, online && can);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(b: B) {
    setBusyId(b.id);
    setErr(null);
    try {
      await api.patch(`/admin/branches/${b.id}`, { active: b.active === false });
      void reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <OnlineGate permission="sucursales.gestionar" loading={!data && !error}>
      <Screen>
        <H1>Sucursales</H1>
        {err || error ? <Banner kind="error" text={(err || error) as string} /> : null}
        {(data ?? []).map((b) => (
          <Card key={b.id}>
            <Row label={b.name} value={b.active === false ? 'Desactivada' : 'Activa'} strong />
            {b.address ? <Muted>{b.address}</Muted> : null}
            {b.locations && b.locations.length > 0 ? <Muted>Ubicaciones: {b.locations.join(', ')}</Muted> : null}
            <Button title={b.active === false ? 'Activar' : 'Desactivar'} variant={b.active === false ? 'secondary' : 'danger'} onPress={() => void toggle(b)} loading={busyId === b.id} />
          </Card>
        ))}
      </Screen>
    </OnlineGate>
  );
}
