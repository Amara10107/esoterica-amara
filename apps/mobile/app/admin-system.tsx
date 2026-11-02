/** Sistema (administrador, en línea): estado de sincronización, diagnóstico y respaldos. */
import React, { useCallback } from 'react';
import { formatMxDateTime } from '@amara/shared';
import { Banner, Card, H1, H2, Muted, Row, Screen } from '../src/components/ui';
import { OnlineGate, useOnlineLoad } from '../src/components/OnlineGate';
import { asList } from '../src/lib/admin-online';
import { useApp } from '../src/state/AppContext';

type Dict = Record<string, unknown>;
const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v));

export default function AdminSystem() {
  const app = useApp();
  const { api, online } = app;
  const can = app.can('sync.estado');
  const load = useCallback(async () => {
    const [sync, diag, backups] = await Promise.all([
      api.get<Dict>('/admin/sync/status').catch(() => null),
      api.get<Dict>('/admin/diagnostics').catch(() => null),
      api.get<unknown>('/admin/backups').then((d) => asList<Dict>(d)).catch(() => [] as Dict[]),
    ]);
    return { sync, diag, backups };
  }, [api]);
  const { data, error } = useOnlineLoad(load, online && can);
  return (
    <OnlineGate permission="sync.estado" loading={!data && !error}>
      <Screen>
        <H1>Sistema</H1>
        {error ? <Banner kind="error" text={error} /> : null}
        <Card>
          <H2>Sincronización</H2>
          {data?.sync ? Object.entries(data.sync).slice(0, 14).map(([k, v]) => <Row key={k} label={k} value={show(v)} />) : <Muted>Sin datos.</Muted>}
        </Card>
        <Card>
          <H2>Diagnóstico</H2>
          {data?.diag ? Object.entries(data.diag).slice(0, 14).map(([k, v]) => <Row key={k} label={k} value={show(v)} />) : <Muted>Sin datos.</Muted>}
        </Card>
        <Card>
          <H2>Respaldos</H2>
          {data && data.backups.length === 0 ? <Muted>No hay respaldos registrados.</Muted> : null}
          {(data?.backups ?? []).slice(0, 10).map((b, i) => (
            <Row key={String(b.id ?? i)} label={typeof b.createdAt === 'string' ? formatMxDateTime(b.createdAt) : `Respaldo ${i + 1}`} value={show(b.kind ?? b.status ?? 'ok')} />
          ))}
        </Card>
      </Screen>
    </OnlineGate>
  );
}
