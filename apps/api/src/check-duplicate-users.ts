/**
 * Diagnóstico de SOLO LECTURA: busca usuarios con el mismo "username" (exacto o solo cambiando
 * mayúsculas/minúsculas) en la base de producción. No borra ni cambia nada.
 *
 * Motivo: la sincronización del escritorio estaba fallando con
 * "UNIQUE constraint failed: users_local.username" — eso solo puede pasar si el servidor le está
 * mandando dos usuarios distintos (ids distintos) con el mismo nombre de usuario, y la base local
 * (SQLite) sí exige que sea único mientras que, por lo visto, en MongoDB quedó un caso que se coló
 * antes de que existiera el índice único (o justo cuando se creó, si ya había un duplicado, el
 * índice nunca llegó a aplicarse).
 *
 * Uso: npm run check:dup-users   (dentro de apps/api)
 */
import { closeDb, col, connect } from './db.ts';

async function main() {
  await connect();
  const users = await col('users')
    .find({}, { projection: { username: 1, name: 1, role: 1, active: 1, branchIds: 1, createdAt: 1, updatedAt: 1 } })
    .toArray();

  const byLower = new Map<string, typeof users>();
  for (const u of users) {
    const key = String(u.username ?? '').toLowerCase();
    const arr = byLower.get(key) ?? [];
    arr.push(u);
    byLower.set(key, arr);
  }

  const dups = [...byLower.entries()].filter(([, arr]) => arr.length > 1);

  console.log(`Total de usuarios en la base: ${users.length}`);
  if (dups.length === 0) {
    console.log('No se encontró ningún "username" repetido (ni con mayúsculas distintas). El duplicado, si existe, no es por nombre de usuario exacto.');
    console.log('\nLista completa de usuarios para revisar a mano:');
    for (const u of users) console.log(`  - id=${u._id}  username="${u.username}"  name="${u.name}"  role=${u.role}  active=${u.active}`);
    await closeDb();
    return;
  }

  console.log(`\nSe encontraron ${dups.length} nombre(s) de usuario repetido(s):\n`);
  for (const [key, arr] of dups) {
    console.log(`--- "${key}" (${arr.length} usuarios) ---`);
    for (const u of arr) {
      console.log(`  id=${u._id}`);
      console.log(`    username real: "${u.username}"`);
      console.log(`    name: "${u.name}"  role: ${u.role}  active: ${u.active}`);
      console.log(`    branchIds: ${JSON.stringify(u.branchIds ?? [])}`);
      console.log(`    createdAt: ${u.createdAt ?? '(sin fecha)'}  updatedAt: ${u.updatedAt ?? '(sin fecha)'}`);
    }
    console.log('');
  }
  console.log('No se borró ni se cambió nada. Revisa cuál de cada grupo es el correcto antes de decidir qué hacer con el otro.');
  await closeDb();
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
