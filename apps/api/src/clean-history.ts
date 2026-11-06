/**
 * Segunda limpieza: historial de ventas/caja, movimientos de inventario, auditoría, permisos
 * temporales y tokens de seguridad — Y usuarios de prueba (deja SOLO al usuario "gerente").
 *
 * NO toca: branches (sucursales), terminals, products/variants/stock (ya limpiados por
 * clean-test-data.ts), settings, backups_log, dashboard_prefs, counters.
 *
 * Igual que clean-test-data.ts: por seguridad corre en modo "solo mostrar" (dry-run) si no le pasas
 * --confirm.
 *
 *   npm run clean:history            (dry-run: solo muestra qué se borraría / a quién)
 *   npm run clean:history -- --confirm   (borra de verdad)
 *
 * Seguridad: se niega a correr si no existe ya un usuario con username "gerente" (para no dejarte
 * sin forma de entrar por un error de dedo). Al terminar, el registro de auditoría (que se borra
 * también) queda con UN solo renglón: el de esta misma limpieza.
 */
const KEEP_USERNAME = 'gerente';

const WIPE_COLLECTIONS = [
  'sales', 'sale_adjustments', 'cash_sessions', 'cash_movements', 'advances', 'advance_entries',
  'inventory_movements', 'transfers',
  'audit_log',
  'grants', 'security_tokens', 'security_token_uses', 'security_verifications',
] as const;

async function main() {
  const confirm = process.argv.includes('--confirm');
  const { connect, closeDb, col } = await import('./db.ts');
  const { audit } = await import('./audit.ts');
  await connect();

  const keepUser = await col('users').findOne({ username: KEEP_USERNAME });
  if (!keepUser) {
    console.error(`No se encontró ningún usuario con username "${KEEP_USERNAME}". Me detengo por seguridad: así no te quedas sin forma de entrar.`);
    await closeDb();
    process.exit(1);
  }

  const otherUsers = await col('users').find({ username: { $ne: KEEP_USERNAME } }).toArray();
  const counts: Record<string, number> = {};
  for (const name of WIPE_COLLECTIONS) counts[name] = await col(name).countDocuments({});

  console.log('--- Esto se va a borrar ---');
  for (const name of WIPE_COLLECTIONS) console.log(`${name}: ${counts[name]}`);
  console.log(`\nUsuarios que se BORRARÍAN (todos menos "${KEEP_USERNAME}"):`);
  if (otherUsers.length === 0) console.log('  (ninguno más: solo existe "gerente")');
  for (const u of otherUsers) console.log(`  - ${u.username as string} (${u.name as string}, rol: ${u.role as string})`);
  console.log(`\nSe conserva: usuario "${keepUser.username as string}" (${keepUser.name as string}), sucursales, terminales, catálogo.`);
  console.log('----------------------------');

  if (!confirm) {
    console.log('\nModo solo-mostrar (dry-run): no se borró nada todavía.');
    console.log('Si esto es lo que quieres borrar, corre de nuevo con --confirm.');
    await closeDb();
    return;
  }

  const results: Record<string, number> = {};
  for (const name of WIPE_COLLECTIONS) {
    const r = await col(name).deleteMany({});
    results[name] = r.deletedCount;
  }
  const rUsers = await col('users').deleteMany({ username: { $ne: KEEP_USERNAME } });

  // audit_log ya se borró arriba: este es el único renglón que queda.
  await audit({
    userId: keepUser.id as string,
    action: 'sistema.limpieza_historial',
    detail: { ...results, usersDeleted: rUsers.deletedCount, keptUsername: KEEP_USERNAME, runAt: new Date().toISOString(), runBy: 'clean-history.ts (script manual)' },
  });

  console.log('\n--- Listo ---');
  for (const name of WIPE_COLLECTIONS) console.log(`${name} borrados: ${results[name]}`);
  console.log(`usuarios borrados: ${rUsers.deletedCount}`);
  console.log(`\nSolo queda el usuario "${KEEP_USERNAME}". Sucursales, terminales y catálogo no se tocaron.`);
  await closeDb();
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
