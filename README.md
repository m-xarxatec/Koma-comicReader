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

## Publicar online (Render + Neon)

1. En Neon, crea la base de datos y copia la conexión **directa** (sin `-pooler`). Cambia los parámetros del final por `?sslmode=verify-full`.
2. En Render, crea un Web Service con este repositorio:
   - Build: `npm ci --include=dev && npm run build`
   - Start: `npm start` (crea o actualiza las tablas al arrancar)
   - Health check: `/api/health`
3. Pon en Render todas las variables de `.env.example` salvo `PORT` (la pone Render) y `SEED_*`, con los valores de la columna "Online" de la tabla de abajo donde cambien. Si falta una, la app no arranca. Las vacías que no uses (`STRIPE_TEST_CLOCK_ID` y, con `STORAGE_DRIVER=local`, las `R2_*`) puedes omitirlas.
4. Cuando arranque, abre `https://<tu-servicio>.onrender.com/api/health`: debe responder `ok`.

En Render, `TRUST_PROXY=3`: los saltos de proxy, comprobados en el primer despliegue (cómo se midió, en `docs/plan_mvp.md`, "Primer despliegue").

## Subir datos a la versión online

Seed y obras se cargan desde tu ordenador hacia Neon (base de datos) y R2 (imágenes). Antes, la app tiene que haber arrancado una vez en Render: es la que crea las tablas.

1. Copia `.env.example` como `.env.online` y pon los mismos valores que en Render.
   - En `DATABASE_URL`, la conexión **directa** de Neon (sin `-pooler`) con `?sslmode=verify-full`.
   - `PORT` y `HOST` tienen que estar, aunque da igual su valor: el seed no abre ningún puerto.
   - Añade las contraseñas `SEED_*` de las cuentas demo online.
2. Ejecuta:

   ```bash
   npm run build
   npm run seed:online
   npm run content:import:online   # (desde el bloque 2)
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
| `npm run seed:online` · `npm run content:import:online` (desde el bloque 2) | Lo mismo, hacia la versión online |

## Variables

Todas están en `.env.example`, con una nota cada una. Estas son las que cambian según dónde corre:

| Variable | En tu ordenador | Demo en Docker | Online |
| --- | --- | --- | --- |
| `NODE_ENV` | `development` | `development` | `production` |
| `HOST` | `127.0.0.1` | `0.0.0.0` | `0.0.0.0` |
| `APP_URL` | `http://localhost:3000` | `http://koma.local` | la URL de Render (HTTPS) |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | `http://koma.local,http://localhost` | solo la URL de Render, sin barra final |
| `DATABASE_URL` | Postgres en Docker (`localhost`) | Postgres en Docker (`db`) | Neon, conexión directa + `?sslmode=verify-full` |
| `COOKIE_SECURE` | `false` | `false` | `true` |
| `TRUST_PROXY` | `0` | `0` | `3` (saltos de proxy de Render, verificado) |
| `STORAGE_DRIVER` | `local` | `local` | `r2` |
| `PAYMENTS_DRIVER` | `fake` | `fake` | `stripe` |

- `JWT_SECRET` y `COOKIE_SECRET`: al menos 32 caracteres aleatorios, distintos en cada entorno.
- `SEED_*_PASSWORD`: contraseñas de las cuentas demo, de 10 caracteres a 72 bytes. Las locales están en `docs/credenciales.local.md`.
- La demo en Docker ya fija sus valores en `docker-compose.yml`; el resto los toma de `.env`.

### Pagos con Stripe (modo prueba)

Estas tres variables salen del panel de Stripe, en el entorno de prueba (sandbox):

- `STRIPE_SECRET_KEY`: la clave secreta de prueba (empieza por `sk_test_`), en Desarrolladores → Claves de API.
- `STRIPE_PRICE_ID`: el identificador del precio mensual de "Koma Premium" (empieza por `price_`).
- `STRIPE_WEBHOOK_SECRET`: se muestra al crear el webhook (empieza por `whsec_`).

Los pasos para crear el producto, el portal y el webhook están en el paso 7 de "Primer despliegue" de `docs/plan_mvp.md`.
Estas claves nunca se suben al repositorio ni se comparten en chats.
