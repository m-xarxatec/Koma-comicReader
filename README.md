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

## Cargar obras (`content/`)

Las obras no se suben desde la web: se preparan en una carpeta y se cargan con un comando. El comando `npm run content:import` llega en el bloque 2; esta guía sirve para dejar tus obras listas desde ya.

La carpeta se llama `content/` y va en la raíz del proyecto. Git la ignora: tus imágenes nunca acaban en GitHub.

### 1. Crea la carpeta de la obra

Ejemplo con *El amante de las princesas* (un capítulo de cuatro páginas):

```
content/
├── tags.json                         ← lista de etiquetas (géneros y temáticas)
└── el-amante-de-las-princesas/       ← una carpeta por obra
    ├── comic.json                    ← datos de la obra
    ├── cover.webp                    ← portada
    └── 001/                          ← capítulo 1
        ├── 001.webp                  ← primera viñeta
        ├── 002.webp
        ├── 003.webp
        └── 004.webp
```

- **Nombre de la carpeta de la obra:** minúsculas, sin acentos, sin espacios y con guiones entre palabras. Es también su dirección en la web (`/obra/el-amante-de-las-princesas`) y no se puede cambiar después.
- **Portada:** se llama `cover` y puede ser `.webp`, `.jpg` o `.png`.
- **Capítulos:** una carpeta por capítulo, con su número (`001`, `002`…). Solo números.
- **Viñetas:** cada imagen es una viñeta y se muestran en el orden de sus números (`001`, `002`…). Solo números en el nombre. Los comentarios y los enlaces para compartir van por viñeta: si una imagen es una página entera, se comenta la página entera.
- **Límites de cada imagen:** formato JPG, PNG o WebP (se comprueba el contenido, no basta con la extensión), 5 MB como máximo y 60 imágenes por capítulo como máximo.

### 2. Escribe los datos de la obra (`comic.json`)

Así queda el de *El amante de las princesas*:

```json
{
  "title": "El amante de las princesas",
  "synopsis": "Un héroe medieval contratado para rescatar princesas. Tiene fama de mujeriego, pero siempre cumple con su trabajo, y es un excelente cazador de bellezas.",
  "authorCredit": "KOMA Original",
  "license": "Obra propia",
  "licenseUrl": null,
  "isAdult": false,
  "contentWarning": null,
  "tags": ["humor", "harem", "romance", "aventura"],
  "chapters": {
    "1": { "title": "El amante" }
  }
}
```

- `authorCredit` es el autor que se ve en la ficha. "Publicado por" pondrá "la plataforma", porque la obra se carga por consola.
- `license` y `licenseUrl`: es obra propia, así que va sin enlace. La ficha muestra "Obra propia".
- `isAdult` tiene que ser `false`: de momento no se pueden cargar obras para mayores de 18.
- `contentWarning`: deja `null` si la obra no necesita aviso. Si lo necesita, escribe el texto y el lector lo mostrará antes del primer capítulo.
- El título de cada capítulo es opcional: sin él, se llama "Capítulo 1", "Capítulo 2"…

Cada etiqueta de `tags` tiene que estar en `content/tags.json`. Las etiquetas base son:
- géneros: `fantasia`, `aventura`, `comedia`, `drama`, `horror`, `misterio`, `romance`, `ciencia-ficcion`;
- temáticas: `magia`, `psicologico`, `sobrenatural`, `slice-of-life`.

`humor` y `harem` no están en esa lista, así que se añaden en `content/tags.json` como géneros nuevos (al cargar, se crean o se actualizan):

```json
[
  { "slug": "romance", "name": "Romance", "type": "genre" },
  { "slug": "aventura", "name": "Aventura", "type": "genre" },
  { "slug": "humor", "name": "Humor", "type": "genre" },
  { "slug": "harem", "name": "Harem", "type": "genre" }
]
```

`type` es `genre` para un género y `theme` para una temática. Una etiqueta nueva lleva el mismo formato que el nombre de la carpeta (minúsculas y guiones).

### 3. Prepara las imágenes desde tu ordenador

Pasar las imágenes a WebP reduce mucho lo que hay que descargar para leer: en esta obra, cada página pasa de unos 3 MB a unos 270 kB, sin diferencia a la vista. Con `ffmpeg`, desde la raíz del proyecto:

```bash
ORIGEN="$HOME/Descargas/entregable/comics Koma/KOMA_El_amante_de_las_princesas_capitulo_01_5_paginas"
DESTINO="content/el-amante-de-las-princesas"
mkdir -p "$DESTINO/001"

# Portada
ffmpeg -i "$ORIGEN/El amante de las princesas_portada.png" -c:v libwebp -quality 82 "$DESTINO/cover.webp"

# Viñetas: pagina-01.png → 001.webp, pagina-02.png → 002.webp…; si alguna pasa de 1200 px de ancho, la reduce
n=1
for f in "$ORIGEN"/pagina-*.png; do
  ffmpeg -i "$f" -vf "scale='min(1200,iw)':-1" -c:v libwebp -quality 82 "$DESTINO/001/$(printf '%03d' "$n").webp"
  n=$((n + 1))
done

ls -lh "$DESTINO" "$DESTINO/001"   # comprueba que ninguna pasa de 5 MB
```

Las páginas se numeran en el orden alfabético de sus nombres: `pagina-01` va antes que `pagina-02`. Si tus originales se llaman `pagina-1`, `pagina-2`… `pagina-10`, renómbralos antes con dos cifras, o la 10 quedará detrás de la 1. Si prefieres no usar `ffmpeg`, también puedes copiar los PNG tal cual con su nuevo nombre (`cover.png`, `001.png`…): pesan menos de 5 MB.

### 4. Cárgala en tu ordenador

```bash
docker compose up -d db
npm run build
npm run migrate
npm run seed              # solo la primera vez: cuentas demo y etiquetas base
npm run content:import
```

Al terminar verás un resumen con las obras creadas, los capítulos añadidos y lo que se ha omitido por algún error. Después, con `npm run dev`, abre:

- `http://localhost:3000`: la obra aparece en el catálogo con su portada.
- `http://localhost:3000/obra/el-amante-de-las-princesas`: título, sinopsis, autor, "Publicado por la plataforma", licencia "Obra propia", etiquetas y el capítulo 1.
- `http://localhost:3000/leer/el-amante-de-las-princesas/1`: las cuatro páginas seguidas, sin huecos.

Puedes repetir la carga sin miedo: no duplica nada. Para añadir un capítulo más adelante, crea la carpeta `002`, añade su título en `comic.json` si quieres y vuelve a ejecutar `npm run content:import`.

Con un solo capítulo, cualquiera puede leer la obra entera: los capítulos 1 y 2 son libres. Para ver en la demo el anuncio (capítulo 3), la invitación a registrarse (capítulo 4) y el saldo de capítulos, la obra necesita al menos cuatro capítulos.

### 5. Cárgala en la versión online

Antes, solo la primera vez:

1. En Cloudflare R2, un bucket **privado** (sin acceso público) y un token de lectura y escritura limitado a ese bucket.
2. En Render y en `.env.online`: `STORAGE_DRIVER=r2` y las cuatro variables `R2_*` del bucket.
3. La versión online desplegada con el código del bloque 2 y arrancada al menos una vez: es la que crea las tablas en Neon.

Después:

```bash
npm run build
npm run content:import:online
```

La primera línea dice a qué base de datos y almacenamiento se conecta: tiene que ser Neon (sin `-pooler`) y `r2`. Si dice `local`, páralo con Ctrl+C: las imágenes irían a tu disco y no se verían online.

Para comprobar que salió bien:

- La obra se ve en la web de Render, con portada y viñetas.
- En la consola del navegador no hay errores. Las imágenes vienen de `r2.cloudflarestorage.com` con una dirección que caduca a las 2 horas.
- En el panel de R2 hay archivos nuevos con nombres al azar (no los tuyos): es lo normal.

### Errores frecuentes

Si una obra tiene un error, se omite con un mensaje y las demás se cargan igual.

| Mensaje o síntoma | Qué pasa | Qué hacer |
| --- | --- | --- |
| Nombre de carpeta no válido | Mayúsculas, espacios, acentos o guiones bajos en la carpeta de la obra | Renómbrala: `el-amante-de-las-princesas` |
| Etiqueta que no existe | Una etiqueta de `comic.json` no está en `tags.json` | Añádela a `tags.json` o corrígela |
| Obra para adultos rechazada | `isAdult` está en `true` | Ponlo en `false`; de momento no se cargan obras +18 |
| Imagen rechazada | Pasa de 5 MB, no es JPG, PNG ni WebP, o su nombre no es solo un número | Redúcela, conviértela o renómbrala (`001.webp`) |
| Capítulo rechazado | La carpeta no es un número o tiene más de 60 imágenes | Renómbrala (`001`) o divide el capítulo |
| Error al leer `comic.json` | Falta una coma o unas comillas, o sobra una coma al final | Revisa el formato con el ejemplo de arriba |
| Online: las tablas no existen | La versión online aún no ha arrancado con el código del bloque 2 | Despliega, espera a que arranque y repite |
| Online: las imágenes no se ven | `STORAGE_DRIVER=local` en `.env.online`, o faltan las `R2_*` | Corrige `.env.online` y repite la carga |

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
