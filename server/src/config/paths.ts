import path from 'node:path';

// server/dist/config → raíz del repositorio (igual en local, Docker y Render).
const root = path.resolve(import.meta.dirname, '..', '..', '..');

export const paths = {
  root,
  publicDir: path.join(root, 'client', 'public'),
  clientDistDir: path.join(root, 'client', 'dist'),
  // tsc no copia los .sql: las migraciones se leen desde src.
  migrationsDir: path.join(root, 'server', 'src', 'db', 'migrations'),
};
