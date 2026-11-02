/**
 * Panel administrativo (SOLO gerente): entrada del administrador. "Mis ventas" de hoy, notificaciones de existencias y
 * gráficas de ventas generales con selector de tipo (pastel, líneas, barras). El vendedor no ve nada de esto: la pantalla
 * lo rechaza, no se le ofrece el acceso y el servidor igualmente da 403 a sus consultas.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { foldText, formatMXN, formatMxDateTime } from '@amara/shared';
import { Banner, Button, Card, Field, H1, H2, Loading, MenuItem, Muted, Row, Screen } from '../src/components/ui';
import { StatusBanner } from '../src/components/StatusBanner';
import { SalesCharts } from '../src/components/SalesCharts';
import { badgeText } from '../src/lib/low-stock';
import { mySales, summarizeToday } from '../src/lib/misc-v2';
import type { TodayLoad } from '../src/services/today';
import { loadToday } from '../src/services/today';
import { useAlerts } from '../src/state/AlertsContext';
import { useApp } from '../src/state/AppContext';

interface Entry { title: string; subtitle: string; route: string; extra?: string }
/** Todo lo que se puede abrir desde el panel; la búsqueda filtra esta lista (sin acentos ni mayúsculas). */
const ENTRIES: Entry[] = [
  { title: 'Notificaciones de existencias', subtitle: 'Productos agotados o en su mínimo', route: '/notifications', extra: 'avisos alertas inventario' },
  { title: 'Consultar tickets de hoy', subtitle: 'Lo vendido hoy, cierre y permiso', route: '/today', extra: 'ventas tickets' },
  { title: 'Resumen de ventas de hoy', subtitle: 'Vendido, netas, tickets y efectivo esperado', route: '/summary', extra: 'ventas dia' },
  { title: 'Caja', subtitle: 'Abrir, cerrar y ticket de cierre', route: '/cash', extra: 'corte retiro gasto dinero' },
  { title: 'Limpias', subtitle: 'Armar una limpia con artículos y servicio', route: '/limpias' },
  { title: 'Etiquetas', subtitle: 'Vista previa e impresión de etiquetas', route: '/labels', extra: 'imprimir codigos' },
  { title: 'Extras por tipo', subtitle: 'Extras y precios de cada tipo de producto', route: '/extras' },
  { title: 'Apariencia', subtitle: 'Claro, oscuro o personalizado con paletas (web, PC y teléfono)', route: '/theme', extra: 'tema colores' },
  { title: 'Tokens de seguridad', subtitle: 'Permisos con duración para cerrar, devolver o cancelar', route: '/tokens', extra: 'autorizacion codigo' },
  { title: 'Cortes de caja', subtitle: 'Sesiones de caja de los últimos 30 días', route: '/admin-cuts', extra: 'corte diario cierre' },
  { title: 'Corte por periodo (semana, mes)', subtitle: 'De tal fecha a tal fecha: cortes, ventas, ganancia; se guarda e imprime', route: '/admin-period', extra: 'corte semanal mensual semana mes fechas' },
  { title: 'Anticipos de limpias', subtitle: 'Buscar, agregar abonos, anotar usos y reimprimir con QR', route: '/advances', extra: 'adelanto abono qr' },
  { title: 'Terminales', subtitle: 'Ver, editar sucursales, desconectar y eliminar', route: '/terminals', extra: 'dispositivos' },
  { title: 'Usuarios', subtitle: 'Ver, activar y desactivar', route: '/admin-users', extra: 'empleados vendedores' },
  { title: 'Sucursales', subtitle: 'Ver, activar y desactivar', route: '/admin-branches', extra: 'tiendas' },
  { title: 'Permisos temporales', subtitle: 'Ver los vigentes y revocarlos', route: '/admin-grants' },
  { title: 'Auditoría', subtitle: 'Últimos movimientos del sistema', route: '/admin-audit', extra: 'bitacora historial' },
  { title: 'Sistema', subtitle: 'Sincronización, diagnóstico y respaldos', route: '/admin-system', extra: 'sync respaldo' },
  { title: 'Anticipo de limpia (nuevo)', subtitle: 'Un cliente deja dinero: ticket con código y QR', route: '/advance-new', extra: 'adelanto' },
];

export default function Admin() {
  const app = useApp();
  const alerts = useAlerts();
  const router = useRouter();
  const { store, device, session, online, api } = app;
  const [today, setToday] = useState<TodayLoad | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!store || !device) return;
    try {
      setToday(await loadToday({ api, store, online, branchId: device.branchId }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar las ventas de hoy.');
    }
  }, [store, device, api, online]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load, app.dataVersion]),
  );

  // Un vendedor que llegue aquí por error vuelve al inicio (la autorización real está en el servidor y en LocalStore).
  useEffect(() => {
    if (session && !app.can('estadisticas.ver')) router.replace('/home');
  }, [session, app, router]);

  if (!session || !device || !store) return <Loading />;
  if (!app.can('estadisticas.ver')) return <Screen><Banner kind="error" text="Solo el gerente puede entrar al panel administrativo." /></Screen>;

  const mine = today ? mySales(today.items, session.user.id) : [];
  const mineView = summarizeToday(mine);
  const branch = app.myBranches.find((b) => b.id === device.branchId);
  const words = foldText(q).split(/\s+/).filter(Boolean);
  const found = ENTRIES.filter((e) => {
    const hay = foldText(`${e.title} ${e.subtitle} ${e.extra ?? ''}`);
    return words.every((w) => hay.includes(w));
  });

  return (
    <Screen edges={['left', 'right']}>
      <H1>Panel administrativo</H1>
      <Muted>
        {session.user.name} · {branch?.name ?? 'Sucursal'}
      </Muted>
      <StatusBanner compact />

      <Field label="Buscar" placeholder="Ej. corte, anticipo, usuarios, tokens…" value={q} onChangeText={setQ} autoCorrect={false} returnKeyType="search" />
      {q.trim() ? (
        <>
          {found.length === 0 ? <Muted>No hay nada que coincida con «{q.trim()}».</Muted> : null}
          {found.map((e) => (
            <MenuItem key={e.route} title={e.title} subtitle={e.subtitle} onPress={() => router.push(e.route as never)} />
          ))}
          <Button title="Borrar búsqueda" variant="secondary" onPress={() => setQ('')} />
        </>
      ) : (
        <>

      <MenuItem
        title="Notificaciones de existencias"
        subtitle={alerts.counts.total > 0 ? `${alerts.counts.agotados} agotados · ${alerts.counts.bajos} en su mínimo` : 'Ningún producto en su mínimo'}
        badge={badgeText(alerts.counts.total) || undefined}
        onPress={() => router.push('/notifications')}
      />

      <Card>
        <H2>Mis ventas de hoy</H2>
        <Muted>Las que vendió {session.user.name} (según el empleado elegido al cobrar).</Muted>
        {error ? <Banner kind="error" text={error} /> : null}
        {today?.source === 'local' ? <Banner kind="warn" title="Datos locales" text={today.note ?? ''} /> : null}
        <Row label="Tickets" value={String(mineView.count)} />
        <Row label="Vendido (sin cancelados)" value={formatMXN(mineView.totalCents)} strong />
        {mine.slice(0, 5).map((s) => (
          <Row key={s.saleId} label={`${s.folio} · ${formatMxDateTime(s.createdAt).slice(11)}${s.type === 'limpia' ? ' · Limpia' : ''}${s.status === 'cancelada' ? ' · CANCELADO' : ''}`} value={formatMXN(s.totalCents)} />
        ))}
        {mine.length === 0 && today ? <Muted>Todavía no hay ventas tuyas hoy. Las ventas anteriores a la versión 2 no traen empleado y no se asignan.</Muted> : null}
        <Button title="Consultar tickets de hoy" variant="secondary" onPress={() => router.push('/today')} />
      </Card>

      <SalesCharts />

      <H2>Gerencia</H2>
      <MenuItem title="Resumen de ventas de hoy" subtitle="Vendido, netas, tickets y efectivo esperado" onPress={() => router.push('/summary')} />
      <MenuItem title="Caja" subtitle="Abrir, cerrar y ticket de cierre" onPress={() => router.push('/cash')} />
      <MenuItem title="Limpias" subtitle="Armar una limpia con artículos y servicio" onPress={() => router.push('/limpias')} />
      <MenuItem title="Etiquetas" subtitle="Vista previa e impresión de etiquetas" onPress={() => router.push('/labels')} />
      <MenuItem title="Extras por tipo" subtitle="Extras y precios de cada tipo de producto" onPress={() => router.push('/extras')} />
      <MenuItem title="Apariencia" subtitle="Claro, oscuro o personalizado con paletas (web, PC y teléfono)" onPress={() => router.push('/theme')} />
      <MenuItem title="Tokens de seguridad" subtitle="Permisos con duración para cerrar, devolver o cancelar" onPress={() => router.push('/tokens')} />

      <H2>Administración (en línea)</H2>
      <MenuItem title="Cortes de caja" subtitle="Sesiones de caja de los últimos 30 días" onPress={() => router.push('/admin-cuts')} />
      <MenuItem title="Corte por periodo (semana, mes)" subtitle="De tal fecha a tal fecha: cortes, ventas, ganancia; se guarda e imprime" onPress={() => router.push('/admin-period')} />
      <MenuItem title="Anticipos de limpias" subtitle="Buscar, agregar abonos, anotar usos y reimprimir con QR" onPress={() => router.push('/advances')} />
      <MenuItem title="Terminales" subtitle="Ver, editar sucursales, desconectar y eliminar" onPress={() => router.push('/terminals')} />
      <MenuItem title="Usuarios" subtitle="Ver, activar y desactivar" onPress={() => router.push('/admin-users')} />
      <MenuItem title="Sucursales" subtitle="Ver, activar y desactivar" onPress={() => router.push('/admin-branches')} />
      <MenuItem title="Permisos temporales" subtitle="Ver los vigentes y revocarlos" onPress={() => router.push('/admin-grants')} />
      <MenuItem title="Auditoría" subtitle="Últimos movimientos del sistema" onPress={() => router.push('/admin-audit')} />
      <MenuItem title="Sistema" subtitle="Sincronización, diagnóstico y respaldos" onPress={() => router.push('/admin-system')} />

      <Button title="Ir a Inicio (venta e inventario)" variant="dark" onPress={() => router.replace('/home')} />
        </>
      )}
    </Screen>
  );
}
