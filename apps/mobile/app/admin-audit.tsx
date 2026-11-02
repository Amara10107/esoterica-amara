/** Auditoría (administrador, en línea): últimos 100 movimientos registrados por el sistema. */
import React, { useCallback } from 'react';
import { formatMxDateTime } from '@amara/shared';
import { Banner, Card, H1, Muted, Screen } from '../src/components/ui';
import { OnlineGate, useOnlineLoad } from '../src/components/OnlineGate';
import { asList, buildQuery } from '../src/lib/admin-online';
import { useApp } from '../src/state/AppContext';

interface A { id: string; entity: string; action: string; userName?: string; userId?: string; detail?: unknown; createdAt: string }

export default function AdminAudit() {
  const app = useApp();
  const { api, online } = app;
  const can = app.can('auditoria.ver');
  const load = useCallback(() => api.get<unknown>(`/admin/audit${buildQuery({ limit: 100 })}`).then((d) => asList<A>(d)), [api]);
  const { data, error } = useOnlineLoad(load, online && can);
  return (
    <OnlineGate permission="auditoria.ver" loading={!data && !error}>
      <Screen>
        <H1>Auditoría</H1>
        {error ? <Banner kind="error" text={error} /> : null}
        {(data ?? []).map((a) => (
          <Card key={a.id}>
            <Muted>{formatMxDateTime(a.createdAt)} · {a.userName ?? a.userId ?? 'sistema'}</Muted>
            <Muted>{a.entity} · {a.action}</Muted>
            {a.detail ? <Muted>{typeof a.detail === 'string' ? a.detail : JSON.stringify(a.detail).slice(0, 160)}</Muted> : null}
          </Card>
        ))}
      </Screen>
    </OnlineGate>
  );
}
