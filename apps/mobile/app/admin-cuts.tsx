/** Cortes de caja (administrador, en línea): últimas 30 días de la sucursal activa. */
import React, { useCallback } from 'react';
import { formatMXN, formatMxDateTime, mxDayKey, mxTodayKey } from '@amara/shared';
import { Banner, Card, H1, Muted, Row, Screen } from '../src/components/ui';
import { OnlineGate, useOnlineLoad } from '../src/components/OnlineGate';
import { asList, buildQuery, daysAgoIso } from '../src/lib/admin-online';
import { useApp } from '../src/state/AppContext';
import { colors } from '../src/theme';

interface S {
  id: string; terminalName?: string; openedByName?: string; openedAt: string; closedAt?: string | null; openingCents: number;
  status: 'abierta' | 'cerrada'; expectedCents?: number | null; countedCents?: number | null; differenceCents?: number | null; provisional?: boolean;
}

export default function AdminCuts() {
  const app = useApp();
  const { api, online, device } = app;
  const can = app.can('caja.corte');
  const branchId = device?.branchId;
  const load = useCallback(
    () => api.get<unknown>(`/cash/sessions${buildQuery({ branchId, from: mxDayKey(daysAgoIso(30)), to: mxTodayKey() })}`).then((d) => asList<S>(d)),
    [api, branchId],
  );
  const { data, error } = useOnlineLoad(load, online && can);
  return (
    <OnlineGate permission="caja.corte" loading={!data && !error}>
      <Screen>
        <H1>Cortes de caja</H1>
        <Muted>Últimos 30 días de la sucursal en uso.</Muted>
        {error ? <Banner kind="error" text={error} /> : null}
        {data && data.length === 0 ? <Muted>No hay sesiones de caja en este periodo.</Muted> : null}
        {(data ?? []).map((s) => (
          <Card key={s.id}>
            <Row label={s.terminalName ?? 'Caja'} value={s.status === 'abierta' ? 'Abierta' : 'Cerrada'} strong />
            <Muted>Abrió {s.openedByName ?? ''} · {formatMxDateTime(s.openedAt)}{s.closedAt ? ` · cerró ${formatMxDateTime(s.closedAt)}` : ''}</Muted>
            <Row label="Fondo inicial" value={formatMXN(s.openingCents)} />
            {s.expectedCents != null ? <Row label="Esperado" value={formatMXN(s.expectedCents)} /> : null}
            {s.countedCents != null ? <Row label="Contado" value={formatMXN(s.countedCents)} /> : null}
            {s.differenceCents != null ? <Row label="Diferencia" value={formatMXN(s.differenceCents)} valueColor={s.differenceCents === 0 ? undefined : colors.danger} strong /> : null}
            {s.provisional ? <Banner kind="warn" text="Corte provisional: hay operaciones por conciliar; las cifras pueden cambiar." /> : null}
          </Card>
        ))}
      </Screen>
    </OnlineGate>
  );
}
