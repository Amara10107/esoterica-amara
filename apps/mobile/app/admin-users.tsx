/** Usuarios (administrador, en línea): ver, activar y desactivar. Cambiar el estado pide confirmar la contraseña. */
import React, { useCallback, useState } from 'react';
import { Banner, Button, Card, Field, H1, Muted, Row, Screen } from '../src/components/ui';
import { OnlineGate, useOnlineLoad } from '../src/components/OnlineGate';
import { Sheet } from '../src/components/Sheet';
import { ROLE_NAME, asList } from '../src/lib/admin-online';
import { useApp } from '../src/state/AppContext';

interface U { id: string; username: string; name: string; role: string; branchIds: string[]; active: boolean }

export default function AdminUsers() {
  const app = useApp();
  const { api, online } = app;
  const canManage = app.can('usuarios.gestionar');
  const load = useCallback(() => api.get<unknown>('/admin/users').then((d) => asList<U>(d)), [api]);
  const { data, error, reload } = useOnlineLoad(load, online && canManage);
  const [target, setTarget] = useState<U | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    if (!target) return;
    setBusy(true);
    setErr(null);
    try {
      const re = await api.post<{ token?: string }>('/auth/reauth', { password });
      if (!re.token) throw new Error('El servidor no confirmó la contraseña.');
      await api.patch(`/admin/users/${target.id}`, { active: !target.active }, { headers: { 'x-reauth': re.token } });
      setMsg(`${target.name} quedó ${target.active ? 'desactivado' : 'activo'}.`);
      void reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setTarget(null);
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <OnlineGate permission="usuarios.gestionar" loading={!data && !error}>
      <Screen>
        <H1>Usuarios</H1>
        <Muted>Para crear usuarios o cambiar contraseñas usa la página web de administración.</Muted>
        {msg ? <Banner kind="ok" text={msg} /> : null}
        {err || error ? <Banner kind="error" text={(err || error) as string} /> : null}
        {(data ?? []).map((u) => {
          const branches = u.branchIds.map((id) => app.myBranches.find((b) => b.id === id)?.name ?? '').filter(Boolean).join(' y ');
          return (
            <Card key={u.id}>
              <Row label={u.name} value={u.active ? 'Activo' : 'Desactivado'} strong />
              <Muted>{u.username} · {ROLE_NAME[u.role] ?? u.role}{branches ? ` · ${branches}` : ''}</Muted>
              {u.id !== app.session?.user.id ? <Button title={u.active ? 'Desactivar' : 'Activar'} variant={u.active ? 'danger' : 'secondary'} onPress={() => setTarget(u)} /> : null}
            </Card>
          );
        })}
        <Sheet visible={target !== null} title="Confirma tu contraseña" onClose={() => { setTarget(null); setPassword(''); }}>
          <Muted>{target?.active ? 'Desactivar' : 'Activar'} a {target?.name} es una acción sensible.</Muted>
          <Field label="Tu contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
          <Button title="Confirmar" onPress={() => void toggle()} loading={busy} disabled={password === ''} />
          <Button title="Cancelar" variant="secondary" onPress={() => { setTarget(null); setPassword(''); }} disabled={busy} />
        </Sheet>
      </Screen>
    </OnlineGate>
  );
}
