/** Permisos temporales (administrador, en línea): ver los vigentes y revocarlos. Para crear uno nuevo usa la web o la PC. */
import React, { useCallback, useState } from 'react';
import { formatMxDateTime } from '@amara/shared';
import { Banner, Button, Card, H1, Muted, Row, Screen } from '../src/components/ui';
import { OnlineGate, useOnlineLoad } from '../src/components/OnlineGate';
import { asList } from '../src/lib/admin-online';
import { useApp } from '../src/state/AppContext';

interface G { id: string; sellerName?: string; sellerId: string; functions: string[]; startsAt: string; expiresAt: string; revokedAt: string | null; grantedByName?: string }

export default function AdminGrants() {
  const app = useApp();
  const { api, online } = app;
  const can = app.can('permisos_temporales.gestionar');
  const load = useCallback(() => api.get<unknown>('/admin/grants').then((d) => asList<G>(d)), [api]);
  const { data, error, reload } = useOnlineLoad(load, online && can);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function revoke(g: G) {
    setBusyId(g.id);
    setErr(null);
    try {
      await api.post(`/admin/grants/${g.id}/revoke`, {});
      void reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo revocar.');
    } finally {
      setBusyId(null);
    }
  }

  const now = Date.now();
  return (
    <OnlineGate permission="permisos_temporales.gestionar" loading={!data && !error}>
      <Screen>
        <H1>Permisos temporales</H1>
        {err || error ? <Banner kind="error" text={(err || error) as string} /> : null}
        {data && data.length === 0 ? <Muted>No hay permisos temporales.</Muted> : null}
        {(data ?? []).map((g) => {
          const active = !g.revokedAt && Date.parse(g.expiresAt) > now;
          return (
            <Card key={g.id} tone={active ? 'gold' : 'plain'}>
              <Row label={g.sellerName ?? g.sellerId} value={g.revokedAt ? 'Revocado' : active ? 'Vigente' : 'Vencido'} strong />
              <Muted>{g.functions.join(', ')}</Muted>
              <Muted>Del {formatMxDateTime(g.startsAt)} al {formatMxDateTime(g.expiresAt)}{g.grantedByName ? ` · lo dio ${g.grantedByName}` : ''}</Muted>
              {active ? <Button title="Revocar" variant="danger" onPress={() => void revoke(g)} loading={busyId === g.id} /> : null}
            </Card>
          );
        })}
      </Screen>
    </OnlineGate>
  );
}
