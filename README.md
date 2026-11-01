# Koma — plataforma de cómics

Un lector de cómics tipo webtoon: explora obras, léelas según tu tipo de cuenta, comenta viñetas y hazte premium. Proyecto final para XarxaTec Activa.

## Probarlo en tu ordenador

Necesitas Node 24 (24.2 o posterior), Docker y Git.

```bash
docker compose up -d db      # levanta la base de datos
npm install
cp .env.example .env         # rellena los valores
npm run build
npm run migrate              # crea las tablas
npm run seed                 # cuentas demo y datos base
npm run dev                  # abre http://localhost:3000
```

Para comprobar que todo va bien, abre `http://localhost:3000/api/health`: debe responder `ok`.

## Demo sin internet

Si no hay red el día de la presentación, todo corre en local con Docker:

```bash
mkdir -p storage             # carpeta de las imágenes, creada con tu usuario
docker compose up --build
```

Se abre en `http://koma.local` o `http://localhost`. Los pagos son simulados y las imágenes se guardan en tu disco.

## Subir datos a la versión online

Seed y obras se cargan desde tu ordenador hacia Neon (base de datos) y R2 (imágenes):

1. Copia `.env.example` como `.env.online` y pon los valores del entorno online.
   - En `DATABASE_URL` usa la conexión **directa** de Neon (sin `-pooler`) y añade `?sslmode=require`.
   - Usa `STORAGE_DRIVER=r2` y rellena las variables `R2_*`.
2. Ejecuta:

   ```bash
   npm run build
   npm run seed:online
   npm run content:import:online
   ```

3. Al empezar, cada comando muestra a qué base de datos y almacenamiento se conecta: confirma que son Neon y `r2`.

`.env.online` tiene secretos: nunca lo subas al repositorio.

## Comandos

| Comando | Para qué |
| --- | --- |
| `npm run watch` y `npm run dev` | Trabajar: uno compila al guardar y el otro reinicia el servidor (dos terminales) |
| `npm run typecheck` | Comprobar los tipos |
| `npm test` | Tests unitarios |
| `npm run test:api` | Tests de la API (vacía y vuelve a llenar la base `koma_test`) |
| `npm run migrate` · `npm run seed` | Tablas y datos demo en local |
| `npm run seed:online` · `npm run content:import:online` | Lo mismo, hacia la versión online |

## Variables

Todas están en `.env.example`, con una nota cada una. Estas son las que cambian según dónde corre:

| Variable | En tu ordenador | Demo en Docker | Online |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | `development` | `production` |
| `HOST` | `127.0.0.1` | `0.0.0.0` | `0.0.0.0` |
| `APP_URL` | `http://localhost:3000` | `http://koma.local` | la URL de Render (HTTPS) |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | `http://koma.local,http://localhost` | solo la URL de Render |
| `DATABASE_URL` | Postgres en Docker (`localhost`) | Postgres en Docker (`db`) | Neon, conexión directa |
| `COOKIE_SECURE` | `false` | `false` | `true` |
| `TRUST_PROXY` | `0` | `0` | los saltos de proxy de Render |
| `STORAGE_DRIVER` | `local` | `local` | `r2` |
| `PAYMENTS_DRIVER` | `fake` | `fake` | `stripe` |

- `JWT_SECRET` y `COOKIE_SECRET`: al menos 32 caracteres aleatorios, distintos en cada entorno.
- `SEED_*_PASSWORD`: contraseñas de las cuentas demo, de 10 caracteres a 72 bytes. Las locales están en `docs/credenciales.local.md`.
- La demo en Docker ya fija sus valores en `docker-compose.yml`; el resto los toma de `.env`.
