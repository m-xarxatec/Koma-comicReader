# Ideas base · Koma — plataforma de cómics (proyecto final XarxaTec Activa)

Entrega: 25 de noviembre de 2026 (congelación de funciones: 20 de noviembre).
Regla del documento: solo se anotan ideas discutidas y aprobadas.
Documentos relacionados (en `docs/`): `plan_mvp.md` (alcance, fases, reglas RN, calendario, guía para CLAUDE.md) y `casos_de_uso.md`.

## Objetivo y método
- Lector de cómics tipo webtoon tratado como producto real; se evalúa el MVP.
- Método y objetivo del proyecto: **vibecoding**. El código lo genera Claude Code; el desarrollador especifica, revisa y corrige.
- El proceso se documenta en `docs/bitacora.md`: qué se pidió a la IA, qué falló y qué se corrigió a mano.

## Stack
| Capa | Tecnología | Uso |
|---|---|---|
| Frontend | HTML, CSS, TypeScript | Interfaz responsive (prioridad móvil) |
| Servidor | Node.js 24 LTS + Express 5 + TypeScript | API REST y servidor de páginas |
| Módulos | ESM (`"type": "module"`, `NodeNext`) | Cliente y servidor |
| Base de datos | PostgreSQL + `pg` | Datos de la plataforma; SQL escrito a mano |
| Contraseñas | bcrypt | Hash de contraseñas |
| Sesión | JWT (`jsonwebtoken`) en cookie httpOnly + `cookie-parser` | Autenticación y cookies firmadas |
| Subidas | multer | Recepción de archivos |
| Seguridad | helmet, express-rate-limit | Cabeceras HTTP y límite de peticiones |
| Validación | zod 4 | Validación de datos de entrada |
| Pagos | `stripe` | Suscripción en modo prueba |
| Almacenamiento | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | Imágenes en Cloudflare R2 con URLs firmadas |
| Tests | `node:test` | Tests sobre el JS compilado |
| Entorno local | Docker Compose | PostgreSQL (y la app como respaldo de la demo) |

Un solo `package.json` en la raíz. Las versiones exactas se fijan al crearlo y se copian aquí.

**Versiones fijadas** (31-oct-2026, `npm install --save-exact`; Node 24.22.2, npm 11.19.1; Postgres 18 en Docker):

| Dependencia | Versión | Desarrollo | Versión |
|---|---|---|---|
| `express` | 5.3.0 | `typescript` | 7.0.2 |
| `zod` | 4.6.7 | `@types/node` | 24.19.2 |
| `bcrypt` | 6.0.0 | `@types/express` | 5.0.6 |
| `jsonwebtoken` | 9.0.3 | `@types/bcrypt` | 6.0.0 |
| `cookie-parser` | 1.4.7 | `@types/jsonwebtoken` | 9.0.10 |
| `multer` | 2.5.0 | `@types/cookie-parser` | 1.4.10 |
| `helmet` | 8.3.0 | `@types/multer` | 2.3.0 |
| `express-rate-limit` | 8.7.2 | `@types/pg` | 8.23.1 |
| `pg` | 8.23.1 | | |
| `stripe` | 23.1.0 | | |
| `@aws-sdk/client-s3` | 3.1160.0 | | |
| `@aws-sdk/s3-request-presigner` | 3.1160.0 | | |

## Estructura del proyecto
Monorepo con `client` y `server`. Un solo servidor Express sirve la API y el frontend. Las carpetas marcadas con fase **no se crean** antes de la entrega, salvo lo aprobado para el bloque 5 (ver "Decisiones tras el MVP").

```
koma/
├── client/
│   ├── public/            # pages/<página>.html, errors/<código>.html, styles/, icons/ (favicon.svg, sprite.svg, koma-logo.webp, error-<código>.webp)
│   │   ├── styles/        # variables.css, layers.css, base.css, components/ (CSS sin compilar)
│   │   ├── manifest.json  # (fase 2: PWA; ruta propia en la raíz)
│   │   └── sw.js          # (fase 2: PWA; ruta propia en la raíz)
│   ├── src/
│   │   ├── pages/         # home, reader, comic, profile, premium, author, admin,
│   │   │                  # auth, fake-checkout · (fase 3: community)
│   │   ├── components/    # header, comic-card, comment-panel, ad, timer
│   │   ├── services/      # api.ts (fetch centralizado), auth.ts
│   │   └── utils/         # validate.ts, redirect.ts, catalog.ts, fullscreen.ts, ratio.ts
│   └── tsconfig.json
├── server/
│   ├── src/
│   │   ├── modules/       # auth, users, comics, chapters, reading, comments, payments, audit, admin
│   │   │                  # (fase 2: gamification · fase 3: illustrations)
│   │   │                  # reading/reading.rules.ts: reglas puras de RN-01–03 (sin BD ni reloj) · comics/comics.rules.ts: slug (RN-09)
│   │   ├── middlewares/   # request-id, trailing-slash, auth, roles, rate-limit, validate, upload, csrf, error-handler
│   │   ├── integrations/  # storage/ (driver.ts, index.ts, local.ts, r2.ts), payments (stripe, fake)
│   │   │                  # (fase 2: discord —webhook—, mailer)
│   │   ├── db/            # pool.ts, migrations/, seeds/
│   │   ├── scripts/       # migrate.ts, seed.ts, import-content.ts, reset-test-db.ts, demo-data.ts, demo-guard.ts y demo-png.ts (solo BD local)
│   │   ├── config/        # env.ts, paths.ts, limits.ts (valores fijos del plan)
│   │   ├── utils/         # logger.ts, app-error.ts, html.ts, origin.ts, password.ts, page.ts, layout.ts, redirect.ts, image.ts, signing.ts, text.ts
│   │   ├── tests/         # unit/ y api/: <tema>.test.ts
│   │   ├── app.ts
│   │   └── server.ts
│   └── tsconfig.json
├── docker/initdb/         # 01-test-db.sql: crea koma_test
├── content/               # obras para importar (ignorado por git); formato en plan_mvp.md
├── storage/               # imágenes del driver local (ignorado por git)
├── docs/                  # plan_mvp.md, modelo_datos.md, ideas_base.md, casos_de_uso.md, bitacora.md,
│                          # credenciales.local.md (ignorado por git)
├── tsconfig.json          # referencias a client y server (tsc -b)
├── package.json
├── docker-compose.yml
├── Dockerfile
├── .dockerignore
├── .claude/            # agents/auditor.md, agents/frontend.md, skills/constructor/SKILL.md (ignorado por git)
├── .env.example
├── .env.test              # solo DATABASE_URL de koma_test (versionado)
└── README.md
```

`.gitignore`: `.env`, `.env.online`, `node_modules/`, `dist/`, `/storage/`, `content/`, `.claude/`, `docs/credenciales.local.md`. `.env.test` sí se versiona: no contiene secretos.

**Arquitectura:** monolito modular por dominios, con arquitectura en capas y patrón Repository.

- Cada módulo: routes → schema → controller → service → repository.
- El SQL solo vive en los repositorios; la lógica de negocio, en los servicios.
- Frontend multipágina en TypeScript compilado con `tsc`, sin bundler. Cada página es `client/public/pages/<página>.html` + `client/src/pages/<página>.ts`. `express.static` solo sirve `/styles`, `/icons` y `client/dist` en `/js`; los HTML salen por el mapa de rutas.
- Páginas: HTML estático por página + datos desde `/api`. Express comprueba cada ruta en la BD (404/410/301) e inyecta el `requestId` (y, en el bloque 5, las meta etiquetas Open Graph de `/`, `/obra` y `/leer`).
- Todas las imágenes con URLs firmadas que caducan (2 h). Driver `r2` online; driver `local` (disco + firma HMAC) en desarrollo y como respaldo sin internet.
- Pagos con driver `stripe` online y driver `fake` (pago simulado mínimo) sin internet; `fake` prohibido en producción.
- Las obras se añaden copiando carpetas en `content/` y ejecutando `npm run content:import`.

**Convenciones:** código, tablas, archivos y rutas de la API en inglés; interfaz, URLs de páginas y mensajes en español.

## Despliegue
Doble despliegue con el mismo código; solo cambian las variables de entorno.

| | Local | Online |
|---|---|---|
| Uso | Desarrollo y respaldo sin internet | Demo pública |
| Web | App en el host (desarrollo, solo `localhost`); contenedor para la demo en la LAN de confianza (`http://koma.local`) | Render |
| Base de datos | PostgreSQL en contenedor | Neon |
| Imágenes | Disco local | Cloudflare R2 |
| Pagos | Pago simulado mínimo | Stripe modo prueba |

- Demo local en la LAN de confianza: `http://koma.local` por mDNS (Avahi), sin puerto; Postgres solo en `127.0.0.1`. Sin HTTPS en local ni uso en redes públicas o desconocidas.
- En `http` fuera de `localhost` no hay Web Share ni portapapeles: se muestra el enlace para copiarlo a mano (CU-06).
- Migraciones al arrancar; seed e importación de contenido a mano desde local.
- Cuentas demo (una por rol): contraseñas por variables de entorno, anotadas en `docs/credenciales.local.md`, nunca en el repo.

## Actores
| Actor | Descripción |
|---|---|
| Invitado | Sin cuenta. Lectura limitada. |
| Registrado | Cuenta gratuita. Lectura con anuncios y espera para desbloquear. |
| Premium | Sin anuncios ni espera. (Fase 3: pase anticipado y descarga sin conexión.) |
| Autor | Rol que se suma a una cuenta registrada. Lo activa el admin; cada obra se verifica al aprobarla. Sube obras propias. |
| Admin | Aprueba, publica y supervisa toda la plataforma. No es autor; importa contenido por consola. |

## Contenido inicial
- Lo añade el desarrollador en `content/` y se publica con `npm run content:import`.
- Solo licencias que permitan uso comercial (la plataforma vende suscripción): CC BY, CC BY-SA, dominio público u obra propia. Sin licencias NC.
- Candidatas: Pepper&Carrot ("Pimienta y Zanahoria", CC BY 4.0, en español) y cómics de dominio público del Digital Comic Museum (en inglés; se pueden traducir).
- Cada obra muestra autor original, "publicado por" y licencia con enlace en su ficha.

## Decisiones de alcance (30 de octubre)
- MVP con recorte B: auditoría solo de consulta, contenido semilla mínimo, tests durante cada bloque.
- Demo local en la LAN de confianza (cambio del 1 de noviembre) y pago simulado mínimo; contingencia por niveles el 12 de noviembre (ver plan).
- Editar los datos de una obra aprobada no exige reaprobación; queda en la auditoría.
- Dedicación prevista: 6 h o más al día, fines de semana incluidos.

## Decisiones tras el MVP (10 de noviembre)
El MVP (bloques 1–4) se cerró el 9 de noviembre, antes de lo previsto. Se abre un **bloque 5** con funciones de la fase 2 elegidas por su valor en la presentación. Es la única excepción a "nada de las fases 2 y 3".

Orden de construcción:

| # | Función | Idea | Notas |
|---|---|---|---|
| 1 | Estadísticas globales del admin (CU-39) y su exportación | 7 | Solo lectura; parte de las métricas de la maqueta del admin. Exportación: vista de impresión para guardar como PDF, sin dependencias |
| 2 | Punto de abandono (CU-31, resto) | 7 | Viñeta máxima alcanzada; sin migración (`chapter_reads.last_panel`) |
| 3 | Open Graph (CU-06) | 1 | En `/`, `/obra` y `/leer`; imagen propia de Koma, no la portada |
| 4 | Enlace «Únete a nuestro Discord» | 10 | Solo el enlace de invitación; el webhook sigue en fase 2 |

- El enlace de Discord empieza solo con las tres primeras desplegadas y auditadas.
- Antes de la primera: cerrar lo pendiente del bloque 4 y probar la demo en contenedores de punta a punta.
- Quedan fuera antes de la entrega: avatar, PWA, reportes (descartados), todo lo que necesita correo o cambia el login, puntos y logros, restauración y apelaciones, y la fase 3 entera.
- Actividad simulada antes de la demo (idea 24): excepción a la regla de que los datos de demostración solo viven en local.
- Test Clocks de Stripe: recortado el 9 de noviembre (contingencia nivel 1).

## Aprobadas
Entre paréntesis, la fase de cada idea o parte. Sin indicación = MVP. "Bloque 5" = se construye antes de la entrega (ver "Decisiones tras el MVP").

### 1. Compartir la viñeta exacta
- Enlace profundo que abre el capítulo directamente en la viñeta compartida: `/leer/:slug/:numero#v-:n`.
- Slug de obra fijo; el capítulo se identifica por número y su reemplazo hereda número y URL.
- Viñeta = cada imagen del capítulo, en orden.
- En móvil, menú nativo de compartir (Web Share API); en escritorio, botones y copiar enlace.
- (Bloque 5) Vista previa en redes sociales (Open Graph) en `/` (texto fijo), `/obra/:slug` (título y sinopsis) y `/leer/:slug/:numero` (obra y capítulo).
  - Imagen: una propia de Koma, en PNG y servida desde `/icons`. No se usa la portada: las imágenes de las obras van con URL firmada que caduca.
  - `og:image` y `og:url` son URLs absolutas, construidas con `APP_URL`.

### 2. Seguridad visible
- Contraseñas con hash (bcrypt).
- Control de acceso por roles.
- Límite de peticiones (rate limiting) en login, registro, subidas y comentarios.
- Validación real de archivos subidos (firma del archivo y tamaño).
- Registro de auditoría consultable desde el dashboard de administración.

### 3. Retos semanales de ilustración (fase 3)
- Un reto con temática por semana dentro de la comunidad.

### 4. Comentarios por viñeta
- Icono discreto con contador en cada viñeta.
- Al tocarlo se abre un panel inferior con los comentarios; la lectura queda limpia.
- Botón para ocultar todos los iconos.
- El admin puede ocultar o eliminar comentarios (borrado lógico).

### 5. Límites de lectura y gamificación
- Invitado: caps. 1 y 2 libres; cap. 3 tras ver un anuncio; desde el cap. 4 debe registrarse.
- Registrado: un anuncio al final de cada capítulo y un intersticial cada 5 capítulos nuevos.
- Registrado: saldo de 5 capítulos; después se desbloquean 2 por periodo de espera. Los caps. 1–2 y las relecturas no consumen.
- El saldo de capítulos es global por usuario (no por obra).
- Cada lectura se registra desde el MVP.
- Tiempo de espera configurable desde el dashboard del admin (en la demo, 1 minuto).
- Premium y admin: sin espera ni anuncios.
- (Fase 2) Puntos por leer y comentar; logros desbloqueables.

### 6. PWA (fase 2; descarga en fase 3)
- Instalable para todos.
- Descarga de capítulos para lectura sin conexión: exclusiva de premium.
- No entra antes de la entrega: `http://koma.local` no es un contexto seguro y un service worker con fallos se queda instalado en los dispositivos de la demo.

### 7. Estadísticas (autor en el MVP; admin, punto de abandono y exportación en el bloque 5)
- Autor (MVP): lecturas por obra y por capítulo (total, 7 y 30 días) y comentarios recientes en su panel.
- (Bloque 5) Punto de abandono en el panel del autor:
  - Se guarda la viñeta máxima alcanzada por cada lector registrado (no la última vista). Los invitados no cuentan.
  - Por capítulo: lectores que llegan al final (en número y en porcentaje) y viñeta donde más se abandona.
  - El progreso solo actualiza una lectura ya registrada; nunca la crea. El valor solo sube.
  - Fuera del cálculo: el admin y el autor dueño.
  - El observador del lector es pasivo: si el envío falla, la lectura sigue igual.
- (Bloque 5) Admin: estadísticas de toda la plataforma (CU-39), solo lectura y sin datos personales.
  - Cuatro métricas de la maqueta: revisión pendiente, comentarios de 7 días con los moderados (sustituye a «Comentarios reportados»), usuarios activos (con alguna lectura en los últimos 30 días) y eventos recientes de 24 h.
  - Sección «Estadísticas» con cuatro tablas: usuarios por rol y estado, lecturas (total, 7 y 30 días; invitados y registrados por separado), obras más leídas, y actividad y catálogo (premium activos, obras y capítulos publicados, comentarios).
- (Bloque 5) Exportar las estadísticas del admin: vista de impresión (`@media print`) que el navegador guarda como PDF, con cabecera «Koma · Informe de la plataforma» y la fecha. Solo se imprime la sección «Estadísticas». Sin dependencias nuevas ni generación de archivos en el servidor. Se construye junto con CU-39.

### 8. Zona +18 (fase 3; campo `is_adult` en el MVP)
- Pestaña visible solo para usuarios con edad verificada (vacía en la demo).
- Verificación: fecha de nacimiento + subida simulada de documento, aprobada por el admin desde el dashboard.
- Cada obra declara si es +18 (`is_adult`) desde el MVP; el admin rechaza las mal clasificadas. En el MVP las obras +18 no se publican.

### 9. Pago premium
- Suscripción mensual con Stripe en modo de prueba (tarjetas de prueba, sin dinero real).
- Al completar el pago, el usuario sube a premium; el estado se actualiza por webhook.
- Cancelación y cambio de tarjeta en el portal de cliente de Stripe.
- Renovación con Test Clocks de Stripe: recortada el 9 de noviembre. La demo muestra alta, portal, cancelación y renovación desde el portal.
- Sin internet: pago simulado mínimo (pagar y cancelar) por el mismo servicio.
- La plataforma nunca maneja datos de tarjeta.

### 10. Discord (enlace en el bloque 5; webhook en fase 2)
- Canal real de la comunidad.
- (Bloque 5) Enlace «Únete a nuestro Discord» que abre la invitación en otra pestaña. Sin la URL de invitación configurada, el enlace no se muestra. Sin internet no abre nada, y la plataforma sigue funcionando igual.
- (Fase 2) Webhook que publica automáticamente cada capítulo nuevo aprobado.

### 11. Anuncios falsos
- Anuncios divertidos de marcas inventadas (nunca marcas reales).
- Fijos desde el seed; (fase 2) gestión desde el dashboard.

### 12. Etiquetas
- Etiquetas de género y temática (`#horror`, `#psicologico`…); el género es un tipo de etiqueta.
- Búsqueda combinando varias etiquetas: muestra las obras que tienen todas.

### 13. Doble factor (fase 2; TOTP en fase 3)
- Inicio de sesión desde un dispositivo nuevo: código de 6 dígitos al correo, válido 10 minutos.
- Código generado con aleatoriedad criptográfica (`crypto.randomInt`).
- Lista de dispositivos de confianza.
- Opcional: app autenticadora (TOTP).

### 14. Pase anticipado (fase 3)
- Lectura de capítulos antes de su publicación general, con premium o con puntos.

### 15. Apoyo al autor (fase 3)
- Los lectores envían puntos a un autor en cada capítulo.

### 16. Referidos (fase 3)
- Versión mínima: solo enlace de referido.

### 17. Onboarding por gustos (fase 2)
- Al registrarse, el usuario elige géneros favoritos para recibir recomendaciones.

### 18. Seguir series (fase 2)
- Notificación de capítulo nuevo por correo y en la bandeja de entrada del perfil.
- Discord publica los capítulos nuevos en el canal de la comunidad.

### 19. Advertencias de contenido
- Aviso previo en obras de horror o temas sensibles; la aceptación se recuerda por obra.

### 20. Recursos para creadores (fase 3)
- Sección con libros, tutoriales, videos y tips de dibujo.
- Videos: solo enlaces o incrustaciones de YouTube; nunca se alojan en la plataforma.
- Temas: crear webtoons, crecer en la app, compartir en redes.
- Ubicación por decidir: dentro de la comunidad o en una pestaña propia.

### 21. Eventos (fase 3)
- El admin crea eventos: sorteos (tableta de dibujo, pase premium), concursos de dibujo y convocatorias de obras.

### 22. Reportes (descartada el 10 de noviembre)
- Botón de reportar en obras, contenidos, usuarios y comentarios, con revisión en el panel del admin.
- No se construye: la moderación ya se hace desde el panel del admin.

### 23. Importación de obras desde directorios
- El desarrollador copia cada obra en `content/<slug>/` con `comic.json`, portada y una carpeta por capítulo.
- `npm run content:import` valida, sube las imágenes y publica las obras ya aprobadas; es idempotente.

### 24. Actividad simulada para la demo (antes de la presentación)
- Un par de bots que actúan como usuarios reales, para que la plataforma muestre actividad: lecturas, comentarios y datos en las estadísticas y en el punto de abandono.
- Es una excepción aprobada a la regla de que los datos de demostración solo viven en local: Koma se trata como producto real, pero es una demo de clase.
- Forma por definir (cuentas, qué acciones hacen y en qué entorno) después del bloque 5.
