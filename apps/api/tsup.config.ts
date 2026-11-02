/**
 * Config de compilación de la API (en vez de pasar --noExternal por línea de comandos: esa opción
 * no existe como flag de la CLI de tsup 8.x, solo aquí). Empaqueta los paquetes internos del monorepo
 * (@amara/shared, @amara/sync, @amara/database) dentro del archivo final, para que Render no los necesite
 * como dependencias publicadas aparte.
 */
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/seed.ts', 'src/backup-mongo.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  noExternal: ['@amara/shared', '@amara/sync', '@amara/database'],
});
