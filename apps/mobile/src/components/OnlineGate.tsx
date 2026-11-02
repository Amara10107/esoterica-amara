/** Envoltura de las pantallas de administración en línea: pide ser administrador y tener conexión; carga y recarga la lista. */
import React, { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Banner, Button, Loading, Muted, Screen } from './ui';
import { useApp } from '../state/AppContext';
import type { Permission } from '@amara/shared';

export function useOnlineLoad<T>(load: () => Promise<T>, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setData(await load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, load]);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  return { data, error, loading, reload, setError };
}

export function OnlineGate({ permission, children, loading }: { permission: Permission; children: React.ReactNode; loading?: boolean }) {
  const app = useApp();
  if (!app.session) return <Loading />;
  if (!app.can(permission)) return <Screen><Banner kind="error" text="Solo el administrador puede ver esta pantalla." /></Screen>;
  if (!app.online) {
    return (
      <Screen>
        <Banner kind="warn" title="Sin conexión" text="Esta pantalla consulta el servidor. Conéctate a internet o a la red de la PC y vuelve a entrar." />
        <Muted>Las ventas y el inventario siguen funcionando sin conexión.</Muted>
        <Button title="Reintentar" variant="secondary" onPress={() => void app.syncNow('manual')} />
      </Screen>
    );
  }
  if (loading) return <Loading />;
  return <>{children}</>;
}
