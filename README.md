# Koma — plataforma de cómics

Un lector de cómics tipo webtoon: explora obras, léelas según tu tipo de cuenta, comenta viñetas y hazte premium. Proyecto final para XarxaTec Activa.

> Los comandos de arranque se completarán cuando termine el andamiaje del proyecto.

## Probarlo en tu ordenador

Necesitas Node 24, Docker y Git.

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
