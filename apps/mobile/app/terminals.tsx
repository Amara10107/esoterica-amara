/**
 * Terminales (SOLO gerente, SOLO en línea): ver las terminales y teléfonos vinculados, editar a quién pertenecen y en
 * qué sucursales trabajan (una o las dos) y DESCONECTAR una terminal en cualquier momento (revoca su token: deja de
 * sincronizar al instante). Editar y desconectar usan los mismos endpoints que la web: PATCH /admin/terminals/:id y
 * POST /admin/terminals/:id/revoke y DELETE /admin/terminals/:id (piden confirmar la contraseña, cabecera x-reauth).
 */
import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { formatMxDateTime } from '@amara/shared';
import { Banner, Button, Card, Chip, ChipRow, Field, H2, Loading, Muted, Row, Screen } from '../src/components/ui';
import { Sheet } from '../src/components/Sheet';
import { ApiError } from '../src/services/api';
import { useApp } from '../src/state/AppContext';

interface TerminalRow {
  id: string;
  code: string;
  name: string;
  kind: 'escritorio' | 'movil';
  branchId: string;
  branchIds: string[];
  assignedTo: string | null;
  revoked: boolean;
  lastSyncAt: string | null;
}

function parseTerminals(json: unknown): TerminalRow[] {
  const raw = Array.isArray(json) ? json : json && typeof json === 'object' && Array.isArray((json as { items?: unknown }).items) ? (json as { items: unknown[] }).items : [];
  const out: TerminalRow[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.code !== 'string' || typeof o.branchId !== 'string') continue;
    out.push({
      id: o.id,
      code: o.code,
      name: typeof o.name === 'string' ? o.name : o.code,
      kind: o.kind === 'movil' ? 'movil' : 'escritorio',
      branchId: o.branchId,
      branchIds: Array.isArray(o.branchIds) && o.branchIds.length > 0 ? o.branchIds.filter((b): b is string => typeof b === 'string') : [o.branchId],
      assignedTo: typeof o.assignedTo === 'string' ? o.assignedTo : null,
      revoked: o.revoked === true || (typeof o.revokedAt === 'string' && o.revokedAt !== ''),
      lastSyncAt: typeof o.lastSyncAt === 'string' ? o.lastSyncAt : null,
    });
  }
  return out;
}

export default function Terminals() {
  const app = useApp();
  const { session, online, api } = app;
  const [rows, setRows] = useState<TerminalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<TerminalRow | null>(null);
  const [person, setPerson] = useState('');
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState<TerminalRow | null>(null);
  const [removing, setRemoving] = useState<TerminalRow | null>(null);
  const [password, setPassword] = useState('');

  const canUse = online && !!session?.token;
  const allBranches = app.branches;
  const branchName = (id: string) => allBranches.find((b) => b.id === id)?.name ?? `Sucursal ${id.slice(0, 6)}`;

  const load = useCallback(async () => {
    if (!canUse) return;
    setLoading(true);
    try {
      setRows(parseTerminals(await api.get<unknown>('/admin/terminals')));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? 'Tu rol no puede ver las terminales.' : e instanceof Error ? e.message : 'No se pudo cargar la lista.');
    } finally {
      setLoading(false);
    }
  }, [api, canUse]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!session) return <Loading />;
  if (!app.can('sucursales.gestionar')) return <Screen><Banner kind="error" text="Solo el gerente puede administrar terminales." /></Screen>;

  function startEdit(t: TerminalRow) {
    setEditing(t);
    setPerson(t.assignedTo ?? '');
    setBranchIds(t.branchIds);
    setFormError(null);
  }

  function toggleBranch(id: string) {
    setBranchIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function saveEdit() {
    if (!editing) return;
    const p = person.replace(/\s+/g, ' ').trim();
    if (p.length < 2) return setFormError('Escribe el nombre de la persona (mínimo 2 letras).');
    if (branchIds.length === 0) return setFormError('Elige al menos una sucursal.');
    setBusy(true);
    setFormError(null);
    try {
      const base = editing.kind === 'movil' ? 'Móvil' : 'PC';
      await api.patch(`/admin/terminals/${editing.id}`, { name: `${base} de ${p}`.slice(0, 60), assignedTo: p, branchIds });
      setEditing(null);
      setNotice('Terminal actualizada. Aplica la próxima vez que sincronice.');
      void load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!disconnecting) return;
    setBusy(true);
    setError(null);
    try {
      const re = await api.post<{ token?: string }>('/auth/reauth', { password });
      if (!re.token) throw new Error('El servidor no confirmó la contraseña.');
      await api.post(`/admin/terminals/${disconnecting.id}/revoke`, {}, { headers: { 'x-reauth': re.token } });
      setNotice(`Terminal ${disconnecting.code} desconectada: ya no puede sincronizar.`);
      setDisconnecting(null);
      setPassword('');
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo desconectar.');
      setDisconnecting(null);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  async function removeTerminal() {
    if (!removing) return;
    setBusy(true);
    setError(null);
    try {
      const re = await api.post<{ token?: string }>('/auth/reauth', { password });
      if (!re.token) throw new Error('El servidor no confirmó la contraseña.');
      const r = await api.delete<{ archived?: boolean }>(`/admin/terminals/${removing.id}`, { headers: { 'x-reauth': re.token } });
      setNotice(r?.archived ? `Terminal ${removing.code} eliminada (tenía historial, quedó archivada y desconectada).` : `Terminal ${removing.code} eliminada.`);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally {
      setRemoving(null);
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <Screen>
      {!canUse ? <Banner kind="warn" text="Para ver y cambiar terminales necesitas internet y haber iniciado sesión en línea." /> : null}
      {notice ? <Banner kind="ok" text={notice} /> : null}
      {error ? <Banner kind="error" text={error} /> : null}
      <Button title={loading ? 'Actualizando...' : 'Actualizar'} variant="secondary" onPress={() => void load()} disabled={!canUse || loading} />

      {rows.map((t) => (
        <Card key={t.id}>
          <H2>{`${t.code} · ${t.name}`}</H2>
          <Row label="Tipo" value={t.kind === 'movil' ? 'Móvil' : 'PC (escritorio)'} />
          <Row label="Para" value={t.assignedTo ?? '-'} />
          <Row label="Sucursales" value={t.branchIds.map(branchName).join(' y ')} />
          <Row label="Última sincronización" value={t.lastSyncAt ? formatMxDateTime(t.lastSyncAt) : 'Nunca'} />
          <Row label="Estado" value={t.revoked ? 'Desconectada' : 'Activa'} valueColor={t.revoked ? '#9B1C1C' : '#2F6B3A'} />
          <Button title="Editar" variant="secondary" onPress={() => startEdit(t)} disabled={!canUse} />
          <Button
            title="Desconectar"
            variant="danger"
            disabled={!canUse || t.revoked}
            onPress={() =>
              Alert.alert('Desconectar terminal', `La terminal ${t.code} dejará de sincronizar de inmediato. Podrás reconectarla emitiendo un token nuevo desde la web. ¿Continuar?`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Desconectar', style: 'destructive', onPress: () => { setPassword(''); setDisconnecting(t); } },
              ])
            }
          />
          <Button
            title="Eliminar"
            variant="danger"
            disabled={!canUse}
            onPress={() =>
              Alert.alert('Eliminar terminal', `¿Eliminar la terminal ${t.code}? Quedará desconectada. Si nunca se usó se borra; si ya tiene ventas o cortes se archiva para conservar el historial.`, [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Eliminar', style: 'destructive', onPress: () => { setPassword(''); setRemoving(t); } },
              ])
            }
          />
        </Card>
      ))}
      {canUse && !loading && rows.length === 0 && !error ? <Muted>No hay terminales registradas.</Muted> : null}

      <Sheet visible={editing !== null} title={editing ? `Editar ${editing.code}` : 'Editar'} onClose={() => setEditing(null)}>
        <Field label="Nombre de la persona" value={person} onChangeText={setPerson} maxLength={40} />
        <Muted>Sucursales donde trabajará (una o las dos):</Muted>
        <ChipRow>
          {allBranches.map((b) => (
            <Chip key={b.id} label={b.name} selected={branchIds.includes(b.id)} onPress={() => toggleBranch(b.id)} />
          ))}
        </ChipRow>
        {formError ? <Banner kind="error" text={formError} /> : null}
        <Button title="Guardar cambios" onPress={() => void saveEdit()} loading={busy} />
        <Button title="Cancelar" variant="secondary" onPress={() => setEditing(null)} disabled={busy} />
      </Sheet>

      <Sheet visible={removing !== null} title="Confirma tu contraseña" onClose={() => { setRemoving(null); setPassword(''); }}>
        <Muted>Eliminar una terminal es una acción sensible: el servidor pide confirmar tu contraseña.</Muted>
        <Field label="Tu contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <Button title="Eliminar" variant="danger" onPress={() => void removeTerminal()} loading={busy} disabled={password === ''} />
        <Button title="Cancelar" variant="secondary" onPress={() => { setRemoving(null); setPassword(''); }} disabled={busy} />
      </Sheet>

      <Sheet visible={disconnecting !== null} title="Confirma tu contraseña" onClose={() => { setDisconnecting(null); setPassword(''); }}>
        <Muted>Desconectar una terminal es una acción sensible: el servidor pide confirmar tu contraseña.</Muted>
        <Field label="Tu contraseña" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <Button title="Desconectar" variant="danger" onPress={() => void disconnect()} loading={busy} disabled={password === ''} />
        <Button title="Cancelar" variant="secondary" onPress={() => { setDisconnecting(null); setPassword(''); }} disabled={busy} />
      </Sheet>
    </Screen>
  );
}
