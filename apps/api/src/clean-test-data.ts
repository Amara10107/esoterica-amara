/**
 * Limpieza de catálogo y existencias de prueba + terminales de prueba, dejando TODO lo demás intacto
 * (usuarios, sucursales, ventas, movimientos, auditoría, permisos, tokens de seguridad no se tocan).
 *
 * Por seguridad corre en modo "solo mostrar" (dry-run) si no le pasas --confirm: cuenta y lista lo que
 * BORRARÍA, sin borrar nada. Solo borra de verdad con --confirm.
 *
 *   npm run clean:test-data            (dry-run: solo muestra qué se borraría)
 *   npm run clean:test-data -- --confirm   (borra de verdad)
 *
 * Recomendado: corre primero `npm run backup:mongo` para tener una copia de seguridad reciente
 * (Atlas M0 no incluye respaldos administrados).
 *
 * Qué borra:
 *  - products, variants, stock: TODO el catálogo y existencias (se asume que todo lo cargado hasta
 *    ahora es de prueba; el negocio aún no ha cargado su inventario real).
 *  - terminals con código "111" o "MU2" (las de prueba vistas en el panel: "111 - empledo",
 *    "MU2 - PC de meme"). Las demás (T1, T2, P1, M1...) NO se tocan.
 * Qué NO toca: users, branches, sales, inventory_movements, transfers, cash_sessions, cash_movements,
 * grants, security_tokens, audit_log, settings, etc.
 */
const TEST_TERMINAL_CODES = ['111', 'MU2'];

async function main() {
  const confirm = process.argv.includes('--confirm');
  const { connect, closeDb, col } = await import('./db.ts');
  const { audit } = await import('./audit.ts');
  await connect();

  const productsCount = await col('products').countDocuments({});
  const variantsCount = await col('variants').countDocuments({});
  const stockCount = await col('stock').countDocuments({});
  const terminals = await col('terminals').find({ code: { $in: TEST_TERMINAL_CODES } }).toArray();

  console.log('--- Esto se va a borrar ---');
  console.log(`Productos:   ${productsCount}`);
  console.log(`Variantes:   ${variantsCount}`);
  console.log(`Existencias: ${stockCount}`);
  console.log(`Terminales de prueba (${TEST_TERMINAL_CODES.join(', ')}):`);
  for (const t of terminals) console.log(`  - ${t.code as string}: ${t.name as string}`);
  if (terminals.length === 0) console.log('  (ninguna encontrada con esos códigos)');
  console.log('----------------------------');

  if (!confirm) {
    console.log('\nModo solo-mostrar (dry-run): no se borró nada todavía.');
    console.log('Si esto es lo que quieres borrar, corre de nuevo con --confirm.');
    await closeDb();
    return;
  }

  const rProducts = await col('products').deleteMany({});
  const rVariants = await col('variants').deleteMany({});
  const rStock = await col('stock').deleteMany({});
  const rTerminals = await col('terminals').deleteMany({ code: { $in: TEST_TERMINAL_CODES } });

  await audit({
    action: 'sistema.limpieza_datos_prueba',
    detail: {
      productsDeleted: rProducts.deletedCount,
      variantsDeleted: rVariants.deletedCount,
      stockDeleted: rStock.deletedCount,
      terminalsDeleted: rTerminals.deletedCount,
      terminalCodes: TEST_TERMINAL_CODES,
      runAt: new Date().toISOString(),
      runBy: 'clean-test-data.ts (script manual)',
    },
  });

  console.log('\n--- Listo ---');
  console.log(`Productos borrados:   ${rProducts.deletedCount}`);
  console.log(`Variantes borradas:   ${rVariants.deletedCount}`);
  console.log(`Existencias borradas: ${rStock.deletedCount}`);
  console.log(`Terminales borradas:  ${rTerminals.deletedCount}`);
  console.log('\nCatálogo, existencias y esas terminales de prueba quedaron limpios.');
  console.log('Usuarios, sucursales, ventas, movimientos, auditoría, permisos y tokens NO se tocaron.');
  await closeDb();
}

main().catch((e) => {
  console.error('Error:', e instanceof Error ? e.message : e);
  process.exit(1);
});
