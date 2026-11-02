/** Más: accesos a las demás funciones. Las opciones se muestran u ocultan según el rol; el servidor igualmente autoriza. */
import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { foldText } from '@amara/shared';
import { Button, Field, H2, Loading, MenuItem, Muted, Screen, Spacer } from '../../src/components/ui';
import { StatusBanner } from '../../src/components/StatusBanner';
import { useApp } from '../../src/state/AppContext';
import { useCart } from '../../src/state/CartContext';
import { useAlerts } from '../../src/state/AlertsContext';
import { badgeText } from '../../src/lib/low-stock';

interface Entry { title: string; subtitle: string; route: string; extra?: string; manager?: boolean }
/** Todo lo que se puede abrir desde Más y el Panel administrativo (los de gerente solo se ofrecen al gerente). */
const ENTRIES: Entry[] = [
  { title: 'Venta de emergencia', subtitle: 'Funciona sin internet; se envía al reconectar', route: '/cart', extra: 'vender carrito' },
  { title: 'Limpias', subtitle: 'Armar una limpia con artículos y servicio', route: '/limpias' },
  { title: 'Caja', subtitle: 'Abrir y cerrar caja, sacar dinero con motivo y autorización', route: '/cash', extra: 'corte retiro gasto dinero' },
  { title: 'Anticipo de limpia', subtitle: 'Un cliente deja dinero: ticket con código y QR', route: '/advance-new', extra: 'adelanto abono' },
  { title: 'Etiquetas', subtitle: 'Vista previa, imprimir o guardar PDF', route: '/labels', extra: 'codigos' },
  { title: 'Entradas de mercancía', subtitle: 'Registrar mercancía que llega', route: '/entry', extra: 'inventario' },
  { title: 'Códigos QR y de barras', subtitle: 'Consultar y mostrar códigos de un producto', route: '/codes' },
  { title: 'Panel administrativo', subtitle: 'Mis ventas, gráficas y notificaciones', route: '/admin', manager: true, extra: 'graficas' },
  { title: 'Notificaciones', subtitle: 'Productos en o bajo su mínimo', route: '/notifications', manager: true, extra: 'avisos alertas existencias' },
  { title: 'Tickets de hoy', subtitle: 'Lo vendido hoy, cierre y permiso', route: '/today', manager: true, extra: 'ventas' },
  { title: 'Resumen de ventas de hoy', subtitle: 'Vendido, netas, tickets y efectivo esperado', route: '/summary', manager: true },
  { title: 'Anticipos de limpias', subtitle: 'Buscar, abonar, anotar usos y reimprimir', route: '/advances', manager: true, extra: 'adelanto abono qr' },
  { title: 'Extras por tipo', subtitle: 'Extras y precios de cada tipo de producto', route: '/extras', manager: true },
  { title: 'Tokens de seguridad', subtitle: 'Crear, ver y revocar (en línea)', route: '/tokens', manager: true, extra: 'autorizacion codigo' },
  { title: 'Terminales', subtitle: 'Ver, editar sucursales y desconectar (en línea)', route: '/terminals', manager: true, extra: 'dispositivos' },
  { title: 'Cortes de caja', subtitle: 'Sesiones de caja de los últimos 30 días (en línea)', route: '/admin-cuts', manager: true, extra: 'corte diario cierre' },
  { title: 'Corte por periodo (semana, mes)', subtitle: 'De tal fecha a tal fecha: cortes, ventas, ganancia', route: '/admin-period', manager: true, extra: 'corte semanal mensual semana mes fechas' },
  { title: 'Usuarios', subtitle: 'Ver, activar y desactivar (en línea)', route: '/admin-users', manager: true, extra: 'empleados vendedores' },
  { title: 'Sucursales', subtitle: 'Ver, activar y desactivar (en línea)', route: '/admin-branches', manager: true, extra: 'tiendas' },
  { title: 'Permisos temporales', subtitle: 'Ver los vigentes y revocarlos (en línea)', route: '/admin-grants', manager: true },
  { title: 'Auditoría', subtitle: 'Últimos movimientos del sistema (en línea)', route: '/admin-audit', manager: true, extra: 'bitacora historial' },
  { title: 'Sistema', subtitle: 'Sincronización, diagnóstico y respaldos (en línea)', route: '/admin-system', manager: true, extra: 'respaldo' },
  { title: 'Apariencia', subtitle: 'Claro, oscuro o personalizado', route: '/theme', manager: true, extra: 'tema colores' },
  { title: 'Sincronización', subtitle: 'Estado de lo enviado y pendiente', route: '/sync', extra: 'sync' },
  { title: 'Vincular con la PC', subtitle: 'Usar el teléfono como escáner o imprimir en la PC', route: '/pc-link' },
];

export default function More() {
  const app = useApp();
  const cart = useCart();
  const alerts = useAlerts();
  const router = useRouter();
  const [q, setQ] = useState('');
  if (!app.session || !app.device) return <Loading />;

  const pending = app.sync.status?.pending ?? 0;
  const isManager = app.session.user.role === 'gerente';
  const branch = app.myBranches.find((b) => b.id === app.device?.branchId);

  const words = foldText(q).split(/\s+/).filter(Boolean);
  const found = ENTRIES.filter((e) => (!e.manager || app.can('estadisticas.ver')) && words.every((w) => foldText(`${e.title} ${e.subtitle} ${e.extra ?? ''}`).includes(w)));

  return (
    <Screen edges={['left', 'right']}>
      <StatusBanner compact />
      <Field label="Buscar" placeholder="Ej. corte, anticipo, etiquetas, tokens…" value={q} onChangeText={setQ} autoCorrect={false} returnKeyType="search" />
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
      <H2>Vender</H2>
      <MenuItem title="Venta de emergencia" subtitle="Funciona sin internet; se envía al reconectar" badge={cart.units > 0 ? String(cart.units) : undefined} onPress={() => router.push('/cart')} />

      <MenuItem title="Limpias" subtitle={app.session.user.role === 'gerente' ? 'Armar una limpia con artículos y servicio' : 'Pide contraseña de administrador o token'} onPress={() => router.push('/limpias')} />
      <MenuItem title="Caja" subtitle="Abrir y cerrar caja, sacar dinero con motivo y autorización" onPress={() => router.push('/cash')} />
      <MenuItem title="Anticipo de limpia" subtitle="Un cliente deja dinero: ticket con código y QR" onPress={() => router.push('/advance-new')} />

      <H2>Inventario</H2>
      <MenuItem title="Etiquetas" subtitle="Vista previa, imprimir o guardar PDF" onPress={() => router.push('/labels')} />
      <MenuItem title="Entradas de mercancía" subtitle={app.can('inventario.mover') ? 'Registrar mercancía que llega' : 'Solo con permiso temporal del gerente'} onPress={() => router.push('/entry')} />
      <MenuItem title="Códigos QR y de barras" subtitle="Consultar y mostrar códigos de un producto" onPress={() => router.push('/codes')} />

      {app.can('estadisticas.ver') ? (
        <>
          <H2>Gerencia</H2>
          <MenuItem title="Panel administrativo" subtitle="Mis ventas, gráficas y notificaciones" onPress={() => router.push('/admin')} />
          {alerts.enabled ? <MenuItem title="Notificaciones" subtitle="Productos en o bajo su mínimo" badge={alerts.counts.total > 0 ? badgeText(alerts.counts.total) : undefined} onPress={() => router.push('/notifications')} /> : null}
          <MenuItem title="Tickets de hoy" subtitle="Lo vendido hoy, cierre y permiso" onPress={() => router.push('/today')} />
          <MenuItem title="Resumen de ventas de hoy" subtitle="Vendido, netas, tickets y efectivo esperado" onPress={() => router.push('/summary')} />
          <MenuItem title="Anticipos de limpias" subtitle="Buscar, abonar, anotar usos y reimprimir" onPress={() => router.push('/advances')} />
          <MenuItem title="Extras por tipo" subtitle="Extras y precios de cada tipo de producto" onPress={() => router.push('/extras')} />
          <MenuItem title="Tokens de seguridad" subtitle="Crear, ver y revocar (en línea)" onPress={() => router.push('/tokens')} />
          <MenuItem title="Terminales" subtitle="Ver, editar sucursales y desconectar (en línea)" onPress={() => router.push('/terminals')} />
        </>
      ) : null}

      <H2>Conexión</H2>
      <MenuItem title="Sincronización" subtitle={pending > 0 ? `${pending} pendientes por enviar` : 'Todo enviado'} onPress={() => router.push('/sync')} />
      <MenuItem title="Vincular con la PC" subtitle="Usar el teléfono como escáner o imprimir en la PC" onPress={() => router.push('/pc-link')} />

      <H2>Cuenta y terminal</H2>
      {/* Sucursal y terminal solo las modifica el gerente. */}
      {isManager ? (
        <>
          <MenuItem title="Cambiar de sucursal" subtitle={branch?.name ?? ''} onPress={() => router.push('/branch')} />
          <MenuItem title="Terminal" subtitle={`Código ${app.device.terminalCode}`} onPress={() => router.push('/terminal-setup')} />
        </>
      ) : (
        <Muted>Sucursal: {branch?.name ?? '-'} · Terminal {app.device.terminalCode}. Solo el gerente puede cambiarlas.</Muted>
      )}
      <MenuItem title="Compatibilidad de escáner e impresión" onPress={() => router.push('/about')} />
        </>
      )}

      <Spacer />
      <Muted>
        Sesión de {app.session.user.name} ({app.session.user.role}){app.session.mode === 'offline' ? ', iniciada sin conexión' : ''}.
      </Muted>
      <Button
        title="Cerrar sesión"
        variant="secondary"
        onPress={() => {
          const lost = pending > 0 ? `\n\nHay ${pending} operaciones sin enviar. NO se pierden: quedan guardadas y se enviarán al volver a entrar con conexión.` : '';
          Alert.alert('Cerrar sesión', `¿Salir de la cuenta?${lost}`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Salir', style: 'destructive', onPress: () => void app.logout() }]);
        }}
      />
    </Screen>
  );
}
