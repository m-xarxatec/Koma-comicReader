# Plan MVP · Koma — plataforma de cómics

Oct 30, 2026 · @M3 · Revisado tras `informe_auditoria2.md` (decisiones aprobadas el 30-oct).

## Objetivo del MVP

El MVP es un lector de cómics desplegado y usable de punta a punta: un visitante encuentra una obra, la lee con límites según su rol, comenta una viñeta, paga premium en modo prueba, y un admin aprueba contenido y audita cada acción sensible. Quedan 26 días (30 oct → 25 nov), así que todo lo que no sostenga ese recorrido pasa a fase 2.

**Método y objetivo:** vibecoding. El código lo genera una IA (Claude Code) y el desarrollador lo especifica, revisa y corrige. El proceso se documenta en `docs/bitacora.md`.

**Criterio para entrar en el MVP** (debe cumplir al menos uno):

- Sin ello la app no funciona (auth, catálogo, lector, aprobación).
- Es la regla de negocio central (límites de lectura por rol, premium).
- Es lo que hace destacar el proyecto: comentarios por viñeta, seguridad visible (auditoría, rate limit, roles) y pago real en modo prueba.

**Este documento es la fuente del CLAUDE.md** (ver la sección final "Guía para CLAUDE.md"): lo que aquí se marque como "no haremos" no se implementa aunque surja la tentación.

## Priorización por fases

El MVP cubre 24 de los 41 casos de uso, varios con un recorte explícito. Fase 2 se aborda solo si el MVP está desplegado y probado; fase 3 queda documentada como ampliación.

### Fase 1 — MVP (entrega)

| CU | Funcionalidad | Recorte en el MVP |
| --- | --- | --- |
| 01, 02 | Catálogo, búsqueda combinando etiquetas (Y), ficha con licencia y advertencias | El género es una etiqueta de tipo `genre` |
| 03, 04 | Lectura de invitado: caps. 1–2 libres, cap. 3 tras anuncio | — |
| 05, 13 | Comentarios por viñeta (leer y publicar), con contador por viñeta | Sin respuestas anidadas ni likes |
| 06 | Compartir viñeta: enlace profundo + Web Share / copiar enlace | Open Graph pasa a fase 2 |
| 07, 08 | Registro e inicio de sesión | Sin 2FA ni referido |
| 12, 24 | Límites de lectura de registrado y lectura sin límites premium | — |
| 21, 27 | Suscripción premium con Stripe (modo prueba) y cancelación | Cancelar y cambiar tarjeta en el portal de Stripe; pago simulado mínimo sin internet |
| 23 | Editar perfil | Nombre y contraseña; avatar en fase 2 |
| 28, 29, 30 | Autor: crear obra, subir capítulo (borrador → revisión), editar o retirar | El rol autor lo activa el admin |
| 31 | Panel del autor: resumen, lecturas por obra y capítulo (total, 7 y 30 días) y comentarios recientes | Sin punto de abandono ni puntos recibidos (fase 2); donaciones solo como «Próximamente» |
| 32, 33 | Admin: aprobar contenido y moderar comentarios (ocultar y eliminar) | Ilustraciones en fase 3 |
| 35, 36 | Admin: gestionar usuarios y parámetros de lectura | — |
| 40 | Consultar auditoría con filtros | Sin restauración ni apelaciones |
| 41 | Importar obras desde el directorio `content/` (consola) | Sin interfaz; solo script |
| — | Anuncios falsos | Fijos desde seed; su gestión (CU-38) en fase 2 |

### Fase 2 · bloque 5 (aprobada el 10-nov)

Tras cerrar el MVP, entra una selección cerrada de la fase 2. El resto de la fase 2 y toda la fase 3 siguen fuera de la entrega.

| CU / idea | Funcionalidad | Recorte |
| --- | --- | --- |
| 39 | Estadísticas globales del admin (RN-20) y su exportación | Solo lectura; sin gráficos; exportación = vista de impresión (`@media print`) para guardar como PDF, sin archivos generados en el servidor |
| 31 (resto) | Punto de abandono en el panel del autor (RN-21) | Solo lectores registrados; sin puntos recibidos |
| Idea 1 (CU-06) | Open Graph en `/`, `/obra/:slug` y `/leer/:slug/:numero` | Imagen propia de Koma (`/icons`), nunca la portada ni una viñeta |
| Idea 10 | Enlace «Únete a nuestro Discord» | Sin webhook ni lógica de servidor; sin `DISCORD_INVITE_URL`, no se muestra |

### Fase 2 — si sobra tiempo antes de la entrega

| CU / idea | Funcionalidad |
| --- | --- |
| 09 | Recuperar contraseña (requiere mailer) |
| 08, 10 | 2FA por correo y dispositivos de confianza |
| 14 | Seguir serie + bandeja de entrada |
| 15 | Puntos y logros |
| 11 | Onboarding por gustos |
| 31 (resto) | Puntos recibidos del autor |
| 38 | Gestionar anuncios |
| 23 | Avatar |
| 40 | Restauración desde auditoría y apelaciones |
| Ideas 6, 10 | PWA instalable, webhook de Discord |
| Idea 6 | `/manifest.json` y `/sw.js` con rutas propias en la raíz: un service worker solo controla las URLs bajo su ruta, así que en `/js/` no serviría |

### Fase 3 — ampliación posterior

| CU / idea | Funcionalidad |
| --- | --- |
| 16, 17, 25 | Apoyo al autor y pase anticipado |
| 18, 37 | Ilustraciones y retos semanales |
| 19, 20, 34 | Zona +18 y verificación de edad |
| 22 | Referidos |
| 26 | Descarga sin conexión |
| Ideas 13, 20, 21 | TOTP, recursos para creadores, eventos |

Descartada el 10-nov (no aplazada): idea 22, reportes.

**Regla para la IA:** no se crean carpetas, tablas, rutas ni dependencias de las fases 2 y 3, salvo las de "Fase 2 · bloque 5".

## Qué haremos y qué no haremos

| Haremos | No haremos |
| --- | --- |
| Frontend multipágina con TypeScript compilado por `tsc` | Frameworks de frontend (React, Vue…) ni bundler |
| CSS propio con variables y mobile-first | Frameworks CSS (Bootstrap, Tailwind) |
| SQL escrito a mano en repositorios con `pg` | ORM (Prisma, Sequelize…) |
| Un solo servidor Express que sirve API y estáticos | Microservicios ni WebSockets |
| Doble despliegue: local (funciona sin internet) y online | Depender de internet el día de la presentación |
| Demo local en la LAN de confianza (`http://koma.local`, por mDNS) | Uso en redes públicas o desconocidas; HTTPS en local |
| Stripe en modo prueba con suscripción; la tarjeta solo la ve Stripe | Pagos reales o guardar datos de tarjeta |
| Pago simulado mínimo para la demo sin internet | Pago simulado en producción |
| Anuncios falsos de marcas inventadas | Redes publicitarias reales o marcas reales |
| Todas las imágenes con URLs firmadas que caducan | Imágenes con URL pública permanente; alojar vídeos |
| Borrado lógico (`deleted_at`, `hidden_at`) | Borrado físico desde la interfaz (salvo viñetas de un capítulo en borrador) |
| Código y API en inglés; interfaz, URLs de páginas y mensajes en español | Internacionalización |
| Campo `is_adult` en obras (zona +18 en fase 3) | Verificación de identidad real ni contenido +18 real |
| Fuentes del sistema y recursos propios | Fuentes, scripts o estilos desde CDN o servicios externos |
| Contenido de terceros solo con licencia que permita uso comercial | Obras con licencia NC (la plataforma vende suscripción) |
| Web responsive instalable como PWA (fase 2) | APK o apps nativas antes de la entrega |

## Limitaciones tecnológicas

La mayor limitación es el tiempo: una persona, 26 días y primera vez con Node. El código lo genera la IA; cada decisión técnica prioriza lo que se pueda revisar y depurar leyendo ese código.

| Limitación | Consecuencia en el diseño |
| --- | --- |
| Sin bundler | El navegador carga módulos ES nativos; los imports del cliente llevan extensión `.js`. Las librerías de `node_modules` (zod incluido) no llegan al cliente. `tsc` no copia CSS ni HTML: viven ya en `client/public/`. |
| Validación no compartible | El servidor (zod) es la única fuente de verdad. El cliente valida con atributos HTML y funciones pequeñas en `client/src/utils/validate.ts`; las constantes se duplican de forma explícita. |
| Hosting gratuito (verificado 30-oct) | Render duerme el servicio tras 15 min sin tráfico y su disco es efímero: se abre la web unos minutos antes de la demo y las imágenes van a R2. La BD va en Neon porque el Postgres gratuito de Render caduca a los 30 días. El *pre-deploy command* de Render no está en el plan gratuito: las migraciones corren al arrancar. |
| Sin internet el día de la demo | Respaldo local completo: Postgres en Docker, imágenes en disco y pago simulado mínimo. Mismo código; cambian los *drivers* por variable de entorno. |
| LAN sin HTTPS | La demo local (`docker compose up`) se abre desde cualquier dispositivo de la LAN de confianza en `http://koma.local` (mDNS con Avahi, puerto 80). Se entra por ese nombre, no por IP (salvo el plan C del checklist de la demo): el control CSRF solo acepta los orígenes de `ALLOWED_ORIGINS`. El desarrollo diario sigue solo en `127.0.0.1`; Postgres, siempre en `127.0.0.1:5432`. Fuera de `localhost`, `http` no es contexto seguro: Web Share y portapapeles no funcionan, y el respaldo es mostrar el enlace en un `<input readonly>` ya seleccionado para copiarlo a mano (bloque 3, CU-06). Las cookies funcionan con `COOKIE_SECURE=false`. |
| Sin correo real en el MVP | Lo que dependa de correo (recuperar contraseña, 2FA) pasa a fase 2. |
| Stripe Test Clocks | Solo en modo prueba; el cliente debe crearse ya asociado al reloj; máximo 3 clientes por reloj; se avanza como mucho dos periodos cada vez; el tiempo solo avanza. Se usa solo si queda tiempo en el bloque 4 (contingencia nivel 1). |
| Invitado sin cuenta | Su progreso vive en una cookie firmada: puede saltarse el desbloqueo del cap. 3 borrándola, pero el cap. 4+ se bloquea siempre en el servidor. Riesgo aceptado. |

## Modelo de permisos

Los permisos se calculan en el servidor en cada petición a partir del usuario leído de la base de datos, nunca solo del JWT. Así una suspensión o un premium vencido surten efecto al instante.

**Representación en `users`:**

- `role`: `user` | `admin`.
- `is_author`: booleano que suma permisos de autor a una cuenta `user`. Un admin nunca es autor.
- `premium_until`: fin del periodo pagado; es premium si es posterior a ahora. Se deriva de `subscriptions` en la misma transacción (RN-04).
- `status`: `active` | `suspended`.
- `token_version`: entero que se incrementa al cambiar contraseña, rol o estado; invalida los JWT anteriores.
- Invitado = petición sin sesión válida.

**Aplicación en código:**

- Middleware `auth` adjunta `req.user` (o `null`) y comprueba `token_version` y `status`.
- Middlewares `requireAuth`, `requireAdmin`, `requireAuthor` protegen rutas.
- La propiedad ("la obra le pertenece") se comprueba en el servicio, no en la ruta.
- Un único archivo `server/src/modules/auth/permissions.ts` define las reglas; el frontend solo oculta botones, nunca decide.

| Acción | Invitado | Registrado | Premium | Autor | Admin |
| --- | --- | --- | --- | --- | --- |
| Explorar, ver ficha, leer comentarios | ✓ | ✓ | ✓ | ✓ | ✓ |
| Leer caps. 1–2 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Leer cap. 3 | Tras anuncio | Con límite | ✓ | Según su cuenta | ✓ |
| Leer cap. 4 en adelante | — | Con límite | ✓ | Según su cuenta | ✓ |
| Comentar viñeta, editar perfil | — | ✓ | ✓ | ✓ | ✓ |
| Hacerse premium | — | ✓ | Portal de Stripe | ✓ | — |
| Crear obra, subir capítulo | — | — | — | Propias | — |
| Ver obras y capítulos `draft`/`pending` | — | — | — | Propios | ✓ |
| Editar o retirar obra | — | — | — | Propias | Retirar cualquiera |
| Aprobar contenido, moderar | — | — | — | — | ✓ |
| Gestionar usuarios | — | — | — | — | ✓ (no a sí mismo) |
| Gestionar parámetros | — | — | — | — | ✓ |
| Consultar auditoría | — | — | — | — | ✓ |
| Importar contenido (`content/`) | — | — | — | — | Solo por consola |

"Según su cuenta": un autor lee con las reglas de registrado o premium; sus propias obras las lee sin límite. El admin lee sin límites ni anuncios.

## Reglas de negocio

Cada regla lleva un código RN para citarla en CLAUDE.md, en commits y en tests. Los valores numéricos viven en constantes o en la tabla `settings`, nunca dispersos en el código.

### Lectura

- **RN-01 Invitado:** caps. 1 y 2 de cada obra libres. Cap. 3 tras completar un anuncio: el servidor emite un token firmado (HMAC con `comic_id` y hora de inicio) y solo lo acepta para esa obra y pasados `AD_MIN_SECONDS`. Cap. 4 en adelante → 401 `UNAUTHENTICATED`; el lector muestra la invitación a registrarse (no redirige).
- **RN-02 Registrado — saldo de capítulos:** saldo global por usuario, máximo `max_balance`. Cada primera lectura de un capítulo consume 1; releer uno ya leído (tabla `chapter_reads`) no consume; los caps. 1–2 nunca consumen. El periodo de espera corre mientras el saldo esté por debajo del máximo: empieza con el primer consumo desde el saldo lleno y, cada `wait_minutes`, recarga `refill` sin superar el máximo; si tras recargar sigue por debajo, el siguiente periodo empieza en ese instante. `retryAt` = próxima recarga. Se recalcula al consultar (cálculo perezoso), con los parámetros vigentes:

  ```
  n = floor((now - period_started_at) / wait)
  balance = min(max, balance + n * refill)
  period_started_at = balance == max ? null : period_started_at + n * wait
  ```

- **RN-03 Anuncios:** registrado ve uno al final de cada capítulo (caps. 1–2 incluidos) y uno intersticial cada 5 primeras lecturas (`reads_since_ad`; caps. 1–2 incluidos, relecturas no). Premium y admin no ven anuncios.
- **RN-04 Premium:** suscripción mensual en Stripe (modo prueba) con `apiVersion` fijada en código. Toda novedad pasa por una única función `syncSubscription(subscriptionId)`: recupera la suscripción desde Stripe y actualiza en una transacción `subscriptions` y `users.premium_until`. Es premium si `status = 'active'` y el fin de periodo es futuro. Cancelar desde el portal mantiene premium hasta ese fin (CU-27). Al vencer se aplican las reglas de registrado sin intervención. El driver `fake` llama al mismo servicio con datos simulados.

### Contenido

- **RN-05 Aprobación:** las obras nacen en `pending`; los capítulos en `draft` y pasan a `pending` con "Enviar a revisión" (requiere al menos 1 imagen). Solo `approved` es público. Rechazar exige motivo. Editar datos de una obra aprobada no requiere reaprobación y queda en auditoría. Mientras un capítulo está en `draft`, el autor puede eliminar viñetas (borrado físico, porque nunca fueron públicas) y las posiciones se recompactan, y puede cambiar su orden; desde `pending`, el capítulo no se edita: se retira y se sube otro. El contenido importado (RN-18) nace `approved`.
- **RN-06 Obra retirada:** deja de ser visible y su URL responde 410. Sus comentarios se conservan ocultos.
- **RN-07 Autoría y licencia:** crear obra exige declaración de autoría y licencia. La ficha muestra "Autor" (`author_credit`, el creador original), "Publicado por" (usuario autor o "la plataforma" si es importada) y la licencia con su enlace (`license_url`).
- **RN-08 Advertencias:** una obra con advertencia muestra un aviso antes del primer capítulo; la aceptación se recuerda por obra en `localStorage` (una vez por dispositivo, sin tabla).
- **RN-09 URLs y viñetas:** slug de obra generado al crearla (minúsculas, sin acentos, sufijo `-2` si existe) e inmutable. Capítulo identificado por número; el que reemplaza a uno retirado o rechazado hereda número y URL. Viñeta = cada imagen, en orden. Enlace profundo: `/leer/:slug/:numero#v-:n`.
- **RN-10 Subidas:** JPEG, PNG o WebP comprobados por firma del archivo. Máximo 5 MB por imagen y 60 por capítulo, subidas de una en una (multer en disco temporal, nunca en memoria). Claves de almacenamiento generadas por el servidor: `UUID.ext`.
- **RN-17 Contenido adulto:** toda obra declara `is_adult`. En el MVP una obra con `is_adult = true` no se puede aprobar ni importar; el admin rechaza con motivo una obra +18 no marcada (CU-32). La zona +18 llega en fase 3.
- **RN-18 Importación de contenido:** el script `npm run content:import` lee `content/` (formato en "Contenido desde directorios"), valida con zod y con las reglas de RN-10, sube las imágenes con el driver de almacenamiento activo y registra obras, etiquetas, capítulos y viñetas en una transacción por obra. Es idempotente: una obra se identifica por el nombre de su carpeta (= slug) y un capítulo ya existente se omite. Las obras importadas tienen `author_id = NULL` y nacen `approved`. Cada obra importada genera una entrada `content.import` en la auditoría (actor `NULL` = sistema). Si `tags.json` crea o cambia etiquetas, otra entrada `content.import` con `entity_type` `tags` y sin `entity_id`: en `after`, las creadas y los campos cambiados de las actualizadas; en `before`, esos campos antes del cambio.

### Comunidad y cuentas

- **RN-11 Comentarios:** 1–500 caracteres, texto plano escapado al mostrarse. Su autor puede borrarlo; el admin puede ocultarlo o eliminarlo. Un comentario oculto no lo ve nadie, tampoco su autor. Borrado siempre lógico; actuar sobre uno ya eliminado → 409.
- **RN-12 Registro:** correo único sin distinguir mayúsculas; contraseña de 10 caracteres a 72 **bytes** (`Buffer.byteLength`, límite de bcrypt); nombre visible de 3 a 30 caracteres. `EMAIL_TAKEN` revela que el correo existe: riesgo aceptado (registro limitado a 3/h).
- **RN-13 Límites de peticiones:** login 5 fallos / 15 min por IP y correo (un login correcto pone el contador a cero); registro 3 / h por IP, contando todo intento válido, también los 409 y los que el cliente corta antes de la respuesta (la cuenta se crea igualmente); subidas 100 imágenes / h por usuario (portada incluida); comentarios 5 / min por usuario; progreso de lectura 60 / min por usuario (RN-21); cambio de contraseña 5 contraseñas actuales incorrectas / 15 min por usuario (acertar pone el contador a cero). Cada limitador va después de la validación con zod: un 400 no cuenta ni crea una clave en memoria, y la clave del login usa el correo ya validado (sin espacios, en minúsculas, 254 caracteres como mucho). Las IPv6 se agrupan por /56. El cuerpo de `/api/auth/*` admite como mucho 4 kB. Online, `trust proxy` = 3, los saltos de Render: `X-Forwarded-For` llega con tres entradas (cliente, Cloudflare y proxy interno). Verificado el 1-nov en el primer despliegue: `req.ip` es la del cliente y una `X-Forwarded-For` falsa se ignora. Nunca `true`.
- **RN-14 Administración:** un admin no puede suspenderse ni quitarse el rol; siempre debe quedar al menos un admin activo.
- **RN-15 Sesión:** suspender, cambiar rol o cambiar contraseña incrementa `token_version`. Al cambiar la propia contraseña se emite un JWT nuevo en la misma respuesta; las demás sesiones se cierran. El contenido de un suspendido sigue visible.
- **RN-16 Parámetros:** periodo de espera 1–1440 min (demo: 1), saldo máximo 1–20 (por defecto 5), recarga 1–10 (por defecto 2); fuera de rango → 400.
- **RN-19 Estadísticas del autor:** lecturas = `guest_reads` + `user_reads` de `chapter_read_counts`; total, últimos 7 y últimos 30 días (hoy incluido, día de `Europe/Madrid`); sin obras ni capítulos retirados; solo las obras propias.
- **RN-20 Estadísticas globales:** solo el admin; solo agregados, sin correos ni nombres de usuario. Lecturas como RN-19, para toda la plataforma. «N días» son días naturales de `Europe/Madrid` con hoy incluido; «24 h» es una ventana móvil. Cuentas: las activas, por su rol (lector, autor, admin) y las suspendidas aparte, de modo que la suma es el total. Premium = cuenta activa, no admin, con `premium_until` futuro (RN-04). Usuarios activos = cuentas activas, no admin, con alguna lectura en los últimos 30 días. Comentarios moderados = comentarios distintos ocultados o eliminados por el admin. Obras más leídas: por lecturas de 30 días, después total y después slug. La exportación es la misma sección en vista de impresión: los mismos números.
- **RN-21 Punto de abandono:** por lector registrado y capítulo, la viñeta máxima alcanzada (`chapter_reads.last_panel`). Solo se actualiza una fila que ya existe (la crea la lectura, RN-02); el valor solo sube y se valida contra el número de viñetas del capítulo. No cuentan el admin ni el autor dueño. «Llega al final» = `last_panel` igual al número de viñetas; «viñeta donde más se abandona» = la moda de `last_panel` entre quienes no llegan al final (empate: la menor). Las filas con `last_panel` NULL no entran en el cálculo. Solo envía progreso un lector con sesión; un fallo del envío no afecta a la lectura.

## Registro de auditoría y reversión

En el MVP la auditoría es un registro de solo inserción que el admin consulta con filtros (actor, acción, entidad, fechas). La restauración y las apelaciones pasan a fase 2; la columna `reverts_id` se crea ya para no migrar después.

```sql
CREATE TABLE audit_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    INTEGER REFERENCES users(id),   -- NULL = invitado o sistema
  action      TEXT NOT NULL,                  -- 'comic.approve', 'user.role_change'…
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  before      JSONB,                          -- solo campos cambiados
  after       JSONB,
  reverts_id  BIGINT REFERENCES audit_log(id),
  ip          INET,
  request_id  UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Triggers rechazan UPDATE y DELETE (FOR EACH ROW) y TRUNCATE (FOR EACH STATEMENT).
```

**Reglas:**

- La escritura en `audit_log` va en la misma transacción que el cambio: si falla una, fallan ambas.
- Nunca se guardan contraseñas, hashes, tokens ni datos de pago en `before`/`after`.
- Los scripts (seed, importación) generan su propio `request_id` con `crypto.randomUUID()`.
- `system.seed`: una entrada por cada fila que el seed crea de verdad (no las omitidas por `ON CONFLICT`), con actor `NULL`, `entity_type` = la tabla y `after` = los ids o claves creados; nunca contraseñas ni hashes.
- `npm run demo:data` (solo local) audita las aprobaciones y el rechazo que simula y los lectores que crea (`system.seed`); sus lecturas y comentarios no se auditan, como los que se registran al leer y comentar.
- En fase 2, restaurar creará una entrada nueva con `reverts_id`; la original no se toca.
- `request_id` enlaza cada entrada con los logs del servidor para depurar.

| Entidad | Acciones auditadas (nombre exacto) |
| --- | --- |
| Sesión | `auth.login_ok`, `auth.login_fail`, `auth.logout` |
| Usuario | `user.register`, `user.update_profile`, `user.password_change`, `user.role_change`, `user.author_grant`, `user.author_revoke`, `user.suspend`, `user.reactivate` |
| Obra | `comic.create`, `comic.update`, `comic.approve`, `comic.reject`, `comic.withdraw` |
| Capítulo | `chapter.create`, `chapter.submit`, `chapter.approve`, `chapter.reject`, `chapter.withdraw` |
| Comentario | `comment.delete_own`, `comment.hide`, `comment.delete` |
| Suscripción | `subscription.start`, `subscription.renew`, `subscription.cancel`, `subscription.resume`, `subscription.expire` |
| Sistema | `settings.update`, `content.import`, `system.seed` |

Fase 2 — restauración solo de acciones de admin, solo si el estado actual coincide con `after` (si no, 409), pasando por el mismo servicio para respetar RN-14; y tabla `appeals` con botón "Apelar" en rechazos y moderaciones.

## Contenido desde directorios

El desarrollador añade obras copiando carpetas en `content/` (raíz del repo, ignorada por git) y ejecutando `npm run content:import`. Online se ejecuta desde local con `npm run content:import:online`, que lee `.env.online` (variables de Neon + R2; ignorado por git y Docker), igual que el seed con `npm run seed:online`. Requisito previo: `npm run migrate`.

```
content/
├── tags.json                     # catálogo de etiquetas
└── pepper-carrot/                # nombre de carpeta = slug (minúsculas, guiones, sin acentos)
    ├── comic.json
    ├── cover.webp                # portada: cover.jpg | cover.png | cover.webp
    ├── 001/                      # carpeta = número de capítulo
    │   ├── 001.webp              # viñetas en orden numérico
    │   └── 002.webp
    └── 002/
        └── ...
```

`tags.json`:

```json
[
  { "slug": "fantasia", "name": "Fantasía", "type": "genre" },
  { "slug": "magia", "name": "Magia", "type": "theme" }
]
```

`comic.json`:

```json
{
  "title": "Pimienta y Zanahoria",
  "synopsis": "Una joven bruja y su gato…",
  "authorCredit": "David Revoy",
  "license": "CC BY 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by/4.0/deed.es",
  "isAdult": false,
  "contentWarning": null,
  "tags": ["fantasia", "magia"],
  "chapters": {
    "1": { "title": "La poción de vuelo" }
  }
}
```

**Reglas de validación** (fallo → la obra se omite con un mensaje claro y el resto continúa):

- Slug válido: `^[a-z0-9]+(-[a-z0-9]+)*$`.
- `comic.json` validado con zod; `tags` deben existir en `tags.json`; `isAdult: true` se rechaza (RN-17).
- Carpetas de capítulo y archivos de viñeta solo con dígitos; se ordenan por valor numérico.
- Cada imagen cumple RN-10 (firma, 5 MB, 60 por capítulo). El título de capítulo es opcional; por defecto "Capítulo N".
- Al final se imprime un resumen: obras creadas, capítulos añadidos, omitidos y errores.

## Frontend: HTML, CSS y TypeScript

Cada página HTML funciona y se entiende sin JavaScript a nivel de estructura; TypeScript añade comportamiento, no marcado esencial.

### HTML semántico por caso de uso

| Página | CU | Estructura clave |
| --- | --- | --- |
| Catálogo (`home`) | 01 | `<search>` con `<form role="search">`; resultados en `<ul>` de `<article>` |
| Ficha (`comic`) | 02 | `<article>` con `<h1>`, `<dl>` para autor, publicado por, licencia y etiquetas; capítulos en `<ol>` |
| Lector (`reader`) | 03, 05, 06, 12 | `<main>` con una `<figure id="v-n">` por viñeta e `<img alt>`; icono de comentarios con contador = `<button aria-label>`; panel = `<dialog>` |
| Registro / login (`auth`) | 07, 08 | `<form>` con `<label for>`, `autocomplete`, `required`, `minlength` |
| Premium | 21 | `<section>` con precio y `<form method="post">` hacia la API |
| Panel de autor y admin | 28–40 | `<nav>` lateral, `<table>` con `<caption>` y `<th scope>` |

Común: `<title>` "Koma" o "<página> · Koma" (también en las páginas de error) y el nombre Koma en la cabecera y el pie, que salen de una sola plantilla (`server/src/utils/layout.ts`, marcadores `<!-- @head -->`, `<!-- @header -->` y `<!-- @footer -->`, también en las páginas de error; `home.html` lleva además `<!-- @community -->`, el acceso rápido «Comunidad» (enlace de Discord o «Próximamente», bloque 5)); un solo `<h1>` por página, `<header>`/`<nav>`/`<main>`/`<footer>`, enlace "Saltar al contenido", `lang="es"`, imágenes con `loading="lazy"` salvo las de la primera pantalla, y `<link rel="icon" href="/icons/favicon.svg">` (sin él, el navegador pide `/favicon.ico` y cada página genera un 404 en los logs).

**Imagen que no carga (CU-03):** el lector muestra un mensaje en la viñeta y un botón "Recargar", que vuelve a pedir el capítulo (URLs firmadas nuevas).

### CSS responsivo sin framework

- Los CSS viven en `client/public/styles/` (no se compilan): `variables.css`, `layers.css` (capas de `z-index`), `base.css` y `components/`.
- Mobile-first: estilos base para móvil y `@media (min-width: 40rem)` y `(min-width: 64rem)`.
- `variables.css` concentra todo valor visual (colores, espacios, tipografía, bordes, desplazamientos) en custom properties semánticas: el diseño lo sustituye sin tocar HTML, TypeScript ni componentes; solo tema oscuro (`color-scheme: dark`, sin tema claro: es una plataforma de lectura); única excepción: el `<meta name="theme-color">` de `layout.ts`, que repite `--color-bg` y un test lo compara. Tipografía del sistema.
- Nombres de clase BEM (`comic-card__title--featured`); un archivo por componente.
- Layout con Grid y Flexbox; lector a una columna, `max-width: 50rem`, imágenes `width: 100%`.
- Foco visible siempre (`:focus-visible`) y áreas táctiles de 44 px mínimo.

### TypeScript en el cliente

- `client/tsconfig.json` en modo `strict`; salida en `client/dist`, servida por Express en `/js`.
- **Peticiones:** todo pasa por `services/api.ts`, que devuelve un resultado tipado y nunca lanza por errores HTTP:

```ts
type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: ApiError };

interface ApiError {
  code: string;                     // 'VALIDATION_ERROR', 'READING_LIMIT'…
  message: string;                  // texto para el usuario
  fields?: Record<string, string>;  // errores por campo (400)
  retryAt?: string;                 // ISO 8601, en READING_LIMIT y RATE_LIMITED
  requestId: string;
}
```

- **Sin respuesta del servidor** (red caída o servidor apagado): `api.ts` devuelve `{ ok: false, status: 0, error: { code: 'NETWORK_ERROR', message, requestId: '' } }`. `NETWORK_ERROR` es un código solo del cliente y no está en la tabla de errores del servidor. Una respuesta de error sin cuerpo JSON (p. ej. de un proxy) llega como `INTERNAL_ERROR`.

- **Formularios:** un helper `bindForm(form, rules, onSubmit)` valida en cliente con reglas por campo (objeto de funciones que devuelven el mensaje de error o `null`), desactiva el botón durante el envío y pinta `fields` del servidor junto a cada `<input>` con `aria-invalid` y `aria-describedby`.
- **Estado:** un `store` mínimo por página (objeto + `subscribe`/`set`); la sesión se obtiene de `GET /api/me`. Nada sensible en `localStorage`; solo preferencias (p. ej. ocultar iconos de comentarios).
- El JWT nunca es accesible desde JavaScript (cookie httpOnly).

## Backend y despliegue

El mismo código corre en dos entornos que solo cambian por variables de entorno: local (respaldo sin internet) y online (Render + Neon + R2 + Stripe). Ambos se despliegan en el bloque 1 aunque sea un "hola mundo".

### Proyecto y comandos

Un solo `package.json` en la raíz, con `"type": "module"` y `"engines": { "node": ">=24.2 <25" }` (24.2 es la primera con `import.meta.main`, que usan `migrate` y `seed`). Dos proyectos TypeScript (`server/tsconfig.json`, `client/tsconfig.json`) unidos por un `tsconfig.json` raíz con referencias (`tsc -b`). Salidas: `server/dist` y `client/dist`.

| Comando | Qué hace |
| --- | --- |
| `docker compose up -d db` | Levanta solo Postgres (desarrollo diario) |
| `npm run watch` | `tsc -b --watch` (terminal 1) |
| `npm run dev` | `node --watch --env-file=.env server/dist/server.js` (terminal 2) |
| `npm run build` | `tsc -b` |
| `npm run typecheck` | `tsc -b` sin errores (con referencias de proyecto, compilar es comprobar tipos) |
| `npm start` | `node server/dist/server.js` (online; migra al arrancar) |
| `npm run migrate` | Aplica las migraciones pendientes |
| `npm run seed` | Cuentas demo, etiquetas base, anuncios y `settings` |
| `npm run content:import` | Importa `content/` (RN-18) |
| `npm run seed:online` | `seed` con `--env-file=.env.online` (Neon + R2); imprime al empezar el host de la BD y `STORAGE_DRIVER` |
| `npm run content:import:online` | `content:import` con `--env-file=.env.online`; imprime al empezar el host de la BD y `STORAGE_DRIVER` |
| `npm run demo:data` | Datos de demostración del panel del autor (obras, lectores, lecturas y comentarios); solo BD local de desarrollo: aborta si no lo es. Nunca online |
| `npm test` | Compila y ejecuta `node --test` sobre las funciones puras |
| `npm run test:api` | Reinicia `koma_test` (`DROP SCHEMA` + migraciones + seed) y ejecuta las pruebas de API |
| `docker compose up` | App + BD en contenedores (respaldo de la demo) |

### Recorrido de una petición

1. `routes` declara método, ruta y middlewares (`auth`, `requireAdmin`, `rateLimit`, `upload`).
2. `schema` valida `body`, `params` y `query` con zod → 400 si falla. Lo validado se guarda en `res.locals` (en Express 5 `req.query` es de solo lectura).
3. `controller` traduce HTTP ↔ servicio; no contiene lógica.
4. `service` aplica reglas RN y permisos de propiedad; abre la transacción si hay auditoría.
5. `repository` ejecuta SQL parametrizado (`$1, $2`), nunca concatenado.
6. Cualquier error llega a `error-handler`, que decide código y formato (sección de errores).

Archivos de módulo: `<módulo>.<capa>.ts` (`comics.routes.ts`, `comics.service.ts`…).

**Conexión y transacciones** (`db/pool.ts`):

- `type Queryable = Pool | PoolClient`. Cada función de repositorio recibe como primer parámetro un `Queryable`: `pool` fuera de una transacción o el `client` dentro de ella.
- `withTransaction(async (client) => …)`: `BEGIN`; si la función termina, `COMMIT`; si lanza, `ROLLBACK` y relanza el error; siempre `client.release()` en `finally`.
- La auditoría se escribe con el mismo `client` que el cambio auditado.

Módulos añadidos a la lista de `ideas_base.md`: `reading` (RN-01 a RN-03, anuncios, `chapter_reads`) y `audit` (escritura y consulta).

### Decisiones del servidor

- **Entorno base:** Node 24 LTS, 24.2 o posterior (misma versión en `engines`, imagen Docker `node:24-slim` y Render), módulos ESM (`module: NodeNext`) en cliente y servidor, Express 5. Versiones exactas fijadas en `package.json` y copiadas a `ideas_base.md`. Variables con `--env-file` nativo de Node (sin dotenv).
- **Estáticos:** `express.static` solo sirve `client/public/styles` (`/styles`), `client/public/icons` (`/icons`) y `client/dist` (`/js`). Las páginas (`client/public/pages/<página>.html`, con su script en `client/src/pages/<página>.ts`) y las de error se sirven por el mapa de rutas, nunca por `express.static`.
- **Dependencias:** las del stack + `pg`, `cookie-parser`, `jsonwebtoken`, `stripe`, `@aws-sdk/client-s3` y `@aws-sdk/s3-request-presigner`. Ninguna otra sin aprobación.
- **Drivers:** `STORAGE_DRIVER` (`local` | `r2`) y `PAYMENTS_DRIVER` (`fake` | `stripe`) con la misma interfaz en `integrations/`.
- **Almacenamiento:** todas las imágenes (viñetas, portadas, anuncios) con URL firmada de `SIGNED_URL_TTL_SECONDS` (2 h). El driver local firma con HMAC y sirve `GET /files/:key?exp=&sig=`; la clave se valida con `^[0-9a-f-]{36}\.(jpg|png|webp)$` antes de tocar el disco (evita *path traversal*).
- **Pago simulado (`fake`):** `/pago-simulado` con dos botones, "Pagar" y "Cancelar", que llaman al mismo servicio que el webhook (`premium_until = now + 30 días` o cancelación al fin de periodo). No simula portal ni renovación. `config/env.ts` rechaza `PAYMENTS_DRIVER=fake` con `NODE_ENV=production`.
- **Stripe online:** Checkout en modo suscripción, portal de cliente para cancelar y cambiar tarjeta, webhooks idempotentes (tabla `payment_events`) y `syncSubscription` (RN-04). Eventos: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`. La ruta del webhook usa `express.raw()` y se registra antes de `express.json()`. La prueba mínima (producto, precio, portal y un webhook verificado por firma en Render) se hace en el bloque 1.
- **Cuenta premium demo:** con `fake`, el seed fija `premium_until`. Con `stripe`, se le asigna con un pago de prueba (o con `npm run stripe:demo-reset` si se usan Test Clocks: crea reloj, cliente y suscripción nuevos).
- **Migraciones:** archivos SQL numerados en `server/src/db/migrations/`, registrados en `schema_migrations`. `npm start` las aplica al arrancar (idempotente); una migración rota impide arrancar y se ve en los logs.
- **Seeds:** `npm run seed` crea las cuentas demo (`admin@demo.test`, `author@demo.test`, `premium@demo.test`, `reader@demo.test`), etiquetas base, anuncios falsos y `settings`. Contraseñas desde `SEED_*_PASSWORD`, anotadas en `docs/credenciales.local.md` (ignorado por git). Las obras llegan por `content:import`. Online se ejecuta a mano desde local con `npm run seed:online`, que lee `.env.online` e imprime al empezar el host de la BD y el `STORAGE_DRIVER`.
- **Configuración:** `config/env.ts` valida las variables con zod al arrancar; si falta una, el proceso termina con un mensaje claro.
- **Cookie de sesión:** `httpOnly`, `Secure` según `COOKIE_SECURE`, `SameSite=Lax`, 7 días.
- **CSRF:** ningún GET modifica datos. Las peticiones que modifican datos deben traer un `Origin` incluido en `ALLOWED_ORIGINS` (lista separada por comas; sin la variable, el origen de `APP_URL`); si `Origin` falta o es ajeno → 403. Cada entrada es un origen exacto (`http` o `https`, sin ruta, barra final ni comodines); `env.ts` rechaza el resto. `APP_URL` solo se usa para URLs absolutas que salen de la app (retorno de Stripe); las redirecciones internas son relativas. El webhook de Stripe queda exento y se valida por firma.
- **Cabeceras:** CSP de helmet definida directiva a directiva: `img-src` con `'self'` y el dominio de R2; `form-action` con `'self'`, `https://checkout.stripe.com` y `https://billing.stripe.com` (el navegador aplica `form-action` también a las redirecciones); sin `upgrade-insecure-requests`, HSTS ni `Cross-Origin-Opener-Policy` cuando `APP_URL` es `http` (desarrollo y demo en la LAN). `Referrer-Policy: same-origin`: con `no-referrer`, el valor de serie de helmet, un formulario POST nativo envía `Origin: null` y el control CSRF lo rechaza; `fetch()` (modo CORS) no se ve afectado (comprobado en Brave el 1-nov: formulario → 403 `CSRF`, `fetch` → aceptado). Sin scripts en línea.
- **Redirecciones:** `next` (`safeNext` en `utils/redirect.ts`) solo acepta rutas que empiezan por `/`; rechaza las que empiezan por `//` o `/\` (el navegador trata `\` como `/`) y las que contienen caracteres de control (el navegador elimina tabuladores y saltos de línea, así que `/\t/evil.com` acabaría en `//evil.com`). Si no es válido, se vuelve a `/`.

### Variables de entorno (`.env.example`)

```bash
NODE_ENV=development
PORT=3000
HOST=127.0.0.1                # solo esta máquina; Compose usa 0.0.0.0
APP_URL=http://localhost:3000 # URLs absolutas que salen de la app (retorno de Stripe y Open Graph)
ALLOWED_ORIGINS=http://localhost:3000 # CSRF: orígenes aceptados, separados por comas (por defecto, el de APP_URL)
DISCORD_INVITE_URL=           # opcional: invitación de Discord (https://discord.gg/…); vacía = sin enlace
DATABASE_URL=postgres://koma:koma@localhost:5432/koma  # en Compose: host "db"; Neon: conexión directa + ?sslmode=verify-full
JWT_SECRET=cambia-esto
COOKIE_SECRET=cambia-esto     # cookies firmadas (invitado, anuncio)
COOKIE_SECURE=false           # true online (HTTPS)
TRUST_PROXY=0                 # número de saltos; online, 3 (verificado en Render, "Primer despliegue")
AD_MIN_SECONDS=5
SIGNED_URL_TTL_SECONDS=7200
LOG_LEVEL=info
CONTENT_DIR=./content

STORAGE_DRIVER=local          # local | r2
STORAGE_LOCAL_DIR=./storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

PAYMENTS_DRIVER=fake          # fake | stripe (fake prohibido en producción)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_TEST_CLOCK_ID=

SEED_ADMIN_PASSWORD=
SEED_AUTHOR_PASSWORD=
SEED_PREMIUM_PASSWORD=
SEED_READER_PASSWORD=
```

`.env.test` (versionado, sin secretos): `DATABASE_URL=postgres://koma:koma@localhost:5432/koma_test`.

## Entornos de despliegue

La presentación se hace con el entorno que esté disponible ese día: online si hay red, local si no. Los dos tienen los mismos datos de seed, el mismo contenido importado y las mismas cuentas demo. Los datos de `npm run demo:data` (obras, lectores, lecturas y comentarios del panel del autor) solo existen en local: nunca van a producción.

|  | Local | Online |
| --- | --- | --- |
| Uso | Desarrollo y respaldo sin internet | Demo pública y enlaces compartibles |
| Web | Desarrollo: app en el host. Respaldo: contenedor `app` (`docker compose up`) | Render (plan gratuito) |
| Base de datos | Contenedor `db` (Postgres) con volumen: `koma` y `koma_test` | Neon (plan gratuito, conexión directa con SSL) |
| Imágenes | Disco (volumen) + URLs firmadas con HMAC | Cloudflare R2 + URLs prefirmadas |
| Pagos | Pago simulado mínimo | Stripe modo prueba + webhooks |
| Acceso | Desarrollo: `http://localhost:3000` (solo `127.0.0.1`). Demo: `http://koma.local` desde la LAN de confianza (mDNS, puerto 80) | HTTPS; `ALLOWED_ORIGINS` = solo su URL |
| Arranque | `docker compose up -d db` + `npm run dev` | Push a la rama principal |
| Build | `npm run build` | `npm ci --include=dev && npm run build` |

**Render (online):** `HOST=0.0.0.0`, porque Render espera la app en `0.0.0.0:$PORT`. En cada despliegue, comprobar en el log de build la línea "Using Node.js version…": debe ser 24.2 o superior, porque con una anterior `migrate` y `seed` terminarían sin hacer nada (`import.meta.main`).

**Primer despliegue (Render + Neon, bloque 1):**

1. **Neon:** la misma versión mayor de Postgres que el contenedor `db` (`postgres:18`) y, si se puede, la misma región que Render. `DATABASE_URL` = conexión **directa** (sin `-pooler`; las migraciones corren al arrancar) terminada en `?sslmode=verify-full`, en lugar de los parámetros que trae Neon (`sslmode=require`, `channel_binding=…`). `pg` 8 ya trata `require` como `verify-full`, pero lo avisa en el log y la v9 lo cambiará a la semántica de libpq, que no comprueba el certificado; `channel_binding` no lo lee.
2. **Render:** Web Service del repositorio, rama principal. Build `npm ci --include=dev && npm run build`; start `npm start`; *Health Check Path* `/api/health`.
3. **Variables en Render:** todas las de `.env.example` salvo `PORT` (la pone Render) y `SEED_*` (solo las usa el seed, desde local), con los valores de la columna "Online" del README donde cambien. `env.ts` también exige las que no cambian (`AD_MIN_SECONDS`, `SIGNED_URL_TTL_SECONDS`, `LOG_LEVEL`, `CONTENT_DIR`, `STORAGE_LOCAL_DIR`): si falta una, la app no arranca. `APP_URL` = `https://<servicio>.onrender.com`; `ALLOWED_ORIGINS`, ese mismo origen exacto, sin ruta ni barra final (`env.ts` rechaza otra forma y la app no arranca), o sin definir (toma el de `APP_URL`). `COOKIE_SECURE=true`; `JWT_SECRET` y `COOKIE_SECRET`, nuevos y distintos de los locales. Con `NODE_ENV=production`, `env.ts` no arranca sin `PAYMENTS_DRIVER=stripe` y sus tres `STRIPE_*`, ni, con `STORAGE_DRIVER=r2`, sin las cuatro `R2_*`. Las opcionales que no se usan (`STRIPE_TEST_CLOCK_ID` y, con `STORAGE_DRIVER=local`, las cuatro `R2_*`) se pueden omitir: `env.ts` trata igual una variable vacía y una ausente. `TRUST_PROXY=3` (verificado en el paso 5).
4. **Seed online**, desde local y después del primer arranque correcto en Render (es el que crea las tablas; sin ellas el seed falla). `.env.online` lleva los valores de Render (mismo `DATABASE_URL`, `NODE_ENV=production` y `PAYMENTS_DRIVER=stripe`, con el que la cuenta premium nace sin `premium_until`), un `PORT` y un `HOST` cualesquiera (`env.ts` los exige aunque el seed no abra puerto) y los `SEED_*` online, anotados en `docs/credenciales.local.md`. `npm run build && npm run seed:online`; la primera línea debe mostrar el host de Neon sin `-pooler`. Es idempotente.
5. **Verificación de `trust proxy` (RN-13)**. Hecha el 1-nov: 3 saltos (cliente, Cloudflare y proxy interno). El endpoint temporal `GET /api/debug/ip` ya está retirado; si hubiera que repetirla (otro servicio o cambios en la red de Render), se recupera de la historia de git (`git log -S /api/debug/ip`). Procedimiento:
   - Con `TRUST_PROXY=0`, `curl -s https://<servicio>.onrender.com/api/debug/ip`. Sin cabecera propia, la primera entrada de `xForwardedFor` es tu IP pública y `ip` todavía es la del último proxy (`remoteAddress`).
   - `TRUST_PROXY` = número de entradas de `xForwardedFor` en esa respuesta (Express cuenta los saltos desde el socket hacia la izquierda). Repetirlo varias veces: el número debe ser estable.
   - Fijarlo en Render y repetir: `ip` debe ser tu IP pública.
   - Suplantación: `curl -s -H 'X-Forwarded-For: 203.0.113.7' …/api/debug/ip`. `ip` sigue siendo tu IP; `203.0.113.7` solo aparece a la izquierda de `xForwardedFor`. Si sale como `ip`, el valor es demasiado alto: el cliente elegiría su IP y se saltaría los límites. Demasiado bajo, todos los clientes comparten la IP de un proxy y los límites los bloquean a la vez.
   - Anotar el valor en la bitácora. Ya fijado (no antes: el endpoint hace falta para medirlo), borrar en un solo commit: el endpoint (`server/src/app.ts`), su test (`server/src/tests/api/debug-ip.test.ts`), su fila del contrato de la API del bloque 1, la nota bajo el contrato y la mención del endpoint en RN-13 (la regla se queda con el número de saltos verificado).
6. **Comprobación:** `GET /api/health` → 200 con `X-Request-Id`; entrar con una cuenta demo desde el navegador (un 403 `CSRF` indica que `APP_URL` o `ALLOWED_ORIGINS` no coinciden con la URL real); los logs de Render, sin errores.
7. **Webhook de Stripe (modo prueba)**. Hecho el 2-nov en el sandbox: `stripe trigger customer.subscription.created` entregó `customer.subscription.created` e `invoice.paid` con 200, y el log muestra "Webhook de Stripe verificado" y la línea `request` con el mismo `requestId`; sin firma, 400 `VALIDATION_ERROR`. Procedimiento, después de desplegar el código con `PAYMENTS_DRIVER=stripe`:
   - Producto "Koma Premium" con precio recurrente mensual en EUR (su `price_…` va a `STRIPE_PRICE_ID`) y portal de cliente con cancelación y cambio de método de pago.
   - Workbench → Webhooks: destino `https://<servicio>.onrender.com/api/stripe/webhook`, versión de API `2026-10-28.endive` (la del SDK), formato *snapshot* y los eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`. Su `whsec_…` va a `STRIPE_WEBHOOK_SECRET` en Render; volver a desplegar.
   - Prueba: `stripe trigger customer.subscription.created` (CLI o Stripe Shell) → *Event deliveries* con 200 y, en el log, "Webhook de Stripe verificado" con `apiVersion` `2026-10-28.endive` y la línea `request` con el mismo `requestId`. Un `curl -X POST` sin firma → 400 (no 403: está fuera de CSRF).

**Checklist del día de la demo:** abrir la web online 5 minutos antes (Render despierta en 30–60 s); tener el entorno local levantado en paralelo; comprobar `GET /api/health` en ambos; entrar desde el móvil en `http://koma.local`; tener preparada la zona wifi del portátil como plan B, por si la red aísla a los clientes; ensayar el local con la red apagada (sin recursos externos e imágenes Docker ya descargadas).

Demo en la LAN, paso a paso (los comandos con `sudo` los ejecuta el desarrollador):

```bash
# 1. Avahi (mDNS)
sudo apt install avahi-daemon                  # si no está instalado
sudo systemctl enable --now avahi-daemon
systemctl status avahi-daemon                  # active (running)

# 2. Publicar koma.local. Opción recomendada: renombrar el equipo (Avahi anuncia <nombre>.local)
hostname                                       # anotar el nombre actual para restaurarlo después
sudo hostnamectl set-hostname koma             # y cambiar el nombre en la línea 127.0.1.1 de /etc/hosts
sudo systemctl restart avahi-daemon
#    Alternativa: publicar solo el nombre mientras el comando siga abierto (avahi-utils, sin sudo)
ip -4 addr show                                # IP del portátil en la wifi, p. ej. 192.168.1.40
avahi-publish -a -R koma.local 192.168.1.40

# 3. Cortafuegos, si ufw está activo (el puerto 80 de Docker no pasa por ufw)
sudo ufw status
sudo ufw allow 5353/udp comment 'mDNS'

# 4. Levantar la demo
mkdir -p storage                               # con tu usuario; si la crea Docker, es de root y la app no puede escribir
docker compose up --build
curl -i http://koma.local/api/health           # 200

# 5. Si un dispositivo no carga
avahi-resolve -n koma.local                    # debe devolver la IP del portátil
```

- Desde el móvil, en la misma wifi: abrir `http://koma.local/api/health` (`{"status":"ok","db":"ok"}`) y después `http://koma.local`, escribiendo `http://`. iOS resuelve `.local` de serie; en Android depende de la versión: probarlo antes del día de la demo.
- Si la red aísla a los clientes (wifi de invitados o de centros): zona wifi del portátil (plan B) y el móvil conectado a ella.
- **Plan C**, un dispositivo no resuelve `koma.local`: añadir `http://<IP del portátil>` a `ALLOWED_ORIGINS` en `docker-compose.yml` (`ALLOWED_ORIGINS: http://koma.local,http://localhost,http://192.168.1.40`) y recrear el contenedor con `docker compose up -d app` (`docker compose restart` no relee el archivo). Se entra por `http://192.168.1.40`, sin puerto. `APP_URL` no cambia, porque las redirecciones internas son relativas. Si la IP cambia, cambiar la entrada; quitarla al terminar y no versionarla.
- Puerto 80 ocupado (`address already in use` o `port is already allocated`): `sudo ss -ltnp 'sport = :80'` y `docker ps` para ver quién lo usa; pararlo (`sudo systemctl stop apache2`, nginx…). Si no se puede, publicar `"8080:3000"` y añadir el puerto a `APP_URL` y a `ALLOWED_ORIGINS` (`http://koma.local:8080`), sin versionar el cambio.

## Modelo de datos del MVP

Dieciséis tablas en nueve migraciones. La definición exacta (columnas, restricciones, índices, triggers y seeds por bloque) está en `docs/modelo_datos.md`; si difieren, manda ese documento. Claves: `INTEGER GENERATED ALWAYS AS IDENTITY`, salvo `audit_log` (`BIGINT`). Las tablas de relación (`comic_tags`) y las de clave natural (`settings`, `reading_credits`, `payment_events`, `schema_migrations`) no tienen `id`. Todas tienen `created_at` salvo `schema_migrations`; las editables, `updated_at`. Nombres en inglés y snake\_case.

| Tabla | Columnas clave | Restricciones |
| --- | --- | --- |
| `users` | `email`, `password_hash`, `display_name`, `role`, `is_author`, `status`, `token_version`, `premium_until`, `stripe_customer_id` | Único `lower(email)`; `role` ∈ user, admin; `status` ∈ active, suspended; `NOT (role = 'admin' AND is_author)` |
| `settings` | `key`, `value` (jsonb) | PK `key` |
| `audit_log` | Ver sección de auditoría | Triggers que impiden UPDATE, DELETE y TRUNCATE |
| `comics` | `slug`, `title`, `synopsis`, `author_id`, `author_credit`, `license`, `license_url`, `authorship_declared`, `is_adult`, `content_warning`, `cover_key`, `status`, `rejection_reason`, `deleted_at` | Único `slug`; `author_id` NULL = importada; `status` ∈ pending, approved, rejected |
| `tags` | `slug`, `name`, `type` | Único `slug`; `type` ∈ genre, theme |
| `comic_tags` | `comic_id`, `tag_id` | PK compuesta |
| `chapters` | `comic_id`, `number`, `title`, `status`, `rejection_reason`, `published_at`, `deleted_at` | `status` ∈ draft, pending, approved, rejected; único `(comic_id, number)` donde `deleted_at IS NULL AND status <> 'rejected'` |
| `panels` | `chapter_id`, `position`, `image_key`, `width`, `height` | Único `(chapter_id, position)` |
| `comments` | `panel_id`, `user_id`, `body`, `hidden_at`, `deleted_at` | `body` 1–500 |
| `chapter_reads` | `user_id`, `chapter_id`, `first_read_at`, `last_read_at`, `last_panel` | PK `(user_id, chapter_id)`; `last_panel` NULL en el MVP (fase 2) |
| `reading_credits` | `user_id`, `balance`, `period_started_at`, `reads_since_ad` | PK `user_id` |
| `chapter_read_counts` | `chapter_id`, `day`, `guest_reads`, `user_reads` | PK `(chapter_id, day)`; lecturas de invitados y registrados por separado |
| `ads` | `brand`, `body`, `image_key` (opcional), `active` | — |
| `subscriptions` | `user_id`, `provider` (`stripe` \| `fake`), `provider_subscription_id`, `status`, `current_period_end`, `cancel_at_period_end` | Único `provider_subscription_id` |
| `payment_events` | `id` (del proveedor), `type`, `received_at` | PK `id`: un evento repetido se ignora |
| `schema_migrations` | `version`, `applied_at` | PK `version` |

**Orden de migraciones:** `001_users` · `002_settings` · `003_audit_log` · `004_comics_tags` · `005_chapters_panels` · `006_comments` · `007_reading` · `008_ads` · `009_billing`.

El token de anuncio del invitado y su progreso no usan tablas: van en cookies firmadas (RN-01). Releer un capítulo que reemplazó a otro (nuevo `chapter_id`) vuelve a consumir saldo: riesgo aceptado.

## Mapa de rutas HTML

Cada ruta sirve un HTML estático de `client/public/`; Express comprueba antes lo indicado y, si falla, responde la página de error con su código. El permiso de lectura de un capítulo no se resuelve aquí: la página carga y la API decide si muestra el capítulo, el anuncio, la invitación a registrarse o el muro de límite.

| Ruta | Página | Comprobación en servidor | Códigos |
| --- | --- | --- | --- |
| `/` | `home` | — | 200 |
| `/obra/:slug` | `comic` | Obra existe, aprobada y no retirada (autor dueño y admin ven `pending`) | 200, 404, 410 |
| `/leer/:slug` | — | Obra existe | 301 a `/leer/:slug/1` |
| `/leer/:slug/:numero` | `reader` | Obra aprobada y no retirada; capítulo `approved` y no retirado (autor dueño y admin ven `draft`/`pending`) | 200, 404, 410 |
| `/entrar`, `/registro` | `auth` | Si ya hay sesión, 303 a `next` validado con `safeNext` (si no vale, a `/`) | 200, 303 |
| `/perfil` | `profile` | Sesión | 200, 302 a `/entrar?next=` |
| `/premium` | `premium` | — | 200 |
| `/premium/gracias` | `premium` | Sesión; la página consulta `/api/me` hasta ver premium | 200, 302 |
| `/pago-simulado` | `fake-checkout` | Solo con `PAYMENTS_DRIVER=fake` (si no, 404); sesión | 200, 302 a `/entrar?next=/pago-simulado`, 404 |
| `/autor` | `author` | Sesión y `is_author` | 200, 302, 403 |
| `/crear` | `become-author` | Sesión; si es autor, 302 a `/autor` | 200, 302 |
| `/admin` | `admin` | Sesión y `role = admin` | 200, 302, 403 |
| `/files/:key` | — (imagen) | Solo con `STORAGE_DRIVER=local`; firma y caducidad válidas | 200, 403, 404 |
| Cualquier ruta con `/` final | — | — | 301 a la ruta sin `/` |
| Ruta inexistente | `errors/404` | — | 404 |

Open Graph (bloque 5): `/`, `/obra/:slug` y `/leer/:slug/:numero` llevan meta `og:*` y `twitter:card`, rellenadas por el servidor y escapadas. Las páginas de error no llevan.

## Contrato de la API del bloque 1

Los contratos de los bloques 2–4 se escriben aquí antes de empezar cada bloque. Rutas de la API en inglés; cuerpos en JSON camelCase; la sesión viaja en la cookie.

| Método y ruta | Entrada | Éxito | Errores |
| --- | --- | --- | --- |
| `POST /api/auth/register` | `email`, `password`, `displayName` | 201 `{ user }` + cookie | 400, 409 `EMAIL_TAKEN`, 429 |
| `POST /api/auth/login` | `email`, `password` | 200 `{ user }` + cookie | 400, 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_SUSPENDED`, 429 |
| `POST /api/auth/logout` | — | 204, borra la cookie | — |
| `GET /api/me` | — | 200 `{ user }` o `{ user: null }` si es invitado | — |
| `GET /api/health` | — | 200 `{ status: "ok", db: "ok" }` | 503 |
| `POST /api/stripe/webhook` | Cuerpo crudo del evento, firmado en `Stripe-Signature` | 200 `{ received: true }` | 400 `VALIDATION_ERROR` (firma ausente o no válida), 413 |

```ts
interface UserDto {
  id: number;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  isAuthor: boolean;
  isPremium: boolean;
  premiumUntil: string | null; // ISO 8601
}
```

`INVALID_CREDENTIALS` usa el mismo mensaje exista o no el correo.

Webhook de Stripe (prueba mínima del bloque 1): solo existe con `PAYMENTS_DRIVER=stripe`. Va después de `request-id` (sus dos líneas de log comparten `requestId`) y antes de `csrf` (exento: se valida la firma con `STRIPE_WEBHOOK_SECRET` y 5 min de tolerancia), `auth` y los `express.json`: lee el cuerpo crudo con `express.raw()` y el límite general de 100 kB. No toca la BD: `payment_events` y `syncSubscription` (RN-04) llegan en el bloque 4. En el log van solo `eventId`, `type`, `livemode` y `apiVersion` del evento; nunca la cabecera `Stripe-Signature` ni el cuerpo, tampoco en el `warn` de firma no válida, que lleva solo el motivo que da Stripe.

## Contrato de la API del bloque 2

Aprobado el 2-nov.

Catálogo, ficha y lector (CU-01 a CU-04, CU-12 y CU-24; RN-01 a RN-03 y RN-06 a RN-09). Solo se ven obras y capítulos `approved` y no retirados; el autor dueño y el admin verán también los suyos en `pending` o `draft` cuando lleguen en el bloque 3. Toda imagen va con URL firmada de `SIGNED_URL_TTL_SECONDS`.

| Método y ruta | Entrada | Éxito | Errores |
| --- | --- | --- | --- |
| `GET /api/tags` | — | 200 `{ tags: TagDto[] }` | — |
| `GET /api/comics` | Query: `q` (0–100 caracteres), `tags` (slugs separados por comas, hasta 10), `page` (≥ 1) | 200 `{ comics: ComicCardDto[], page, pageSize, total }`, de la más reciente a la más antigua | 400 |
| `GET /api/comics/:slug` | — | 200 `{ comic: ComicDto }` | 404 `NOT_FOUND`, 410 `GONE` |
| `GET /api/comics/:slug/ad` | — | 200 `{ ad: AdDto \| null, adToken, minSeconds }` | 404, 410 |
| `POST /api/comics/:slug/chapters/:number/read` | Cabecera `X-Ad-Token` (solo invitado en el cap. 3) | 200 `{ reading: ReadingDto }` | 401 `UNAUTHENTICATED`, 403 `AD_NOT_COMPLETED`, 403 `READING_LIMIT` (+ `retryAt`), 404, 410 |
| `GET /files/:key?exp=&sig=` | Solo con `STORAGE_DRIVER=local` | 200 imagen, en caché privada hasta `exp` | 403 (firma o caducidad), 404 (clave no válida o inexistente) |

```ts
interface TagDto {
  slug: string;
  name: string;
  type: 'genre' | 'theme';
}

interface ComicCardDto {
  slug: string;
  title: string;
  authorCredit: string;
  coverUrl: string | null; // firmada; null si no tiene portada
  tags: TagDto[];
}

interface ComicDto extends ComicCardDto {
  synopsis: string;
  publishedBy: string | null; // nombre visible del autor; null = "la plataforma" (obra importada, RN-07)
  license: string;
  licenseUrl: string | null;
  contentWarning: string | null; // RN-08
  chapters: ChapterSummaryDto[]; // por número
}

interface ChapterSummaryDto {
  number: number;
  title: string;
  publishedAt: string; // ISO 8601
  access: 'free' | 'ad' | 'account' | 'balance'; // qué exige leerlo a quien consulta (RN-01, RN-02)
  read: boolean; // ya leído por este usuario (chapter_reads); false para el invitado
}

interface AdDto {
  brand: string;
  body: string;
  imageUrl: string | null; // firmada; null = tarjeta de texto
}

interface ReadingDto {
  comic: { slug: string; title: string; contentWarning: string | null };
  chapter: { number: number; title: string; prev: number | null; next: number | null };
  panels: { position: number; url: string; width: number; height: number }[]; // la viñeta n es #v-n (RN-09); px, para reservar su hueco
  ads: { interstitial: AdDto | null; end: AdDto | null }; // RN-03; los dos null para invitado, premium y admin
  balance: { balance: number; max: number; retryAt: string | null } | null; // solo registrado sin premium
}
```

- **Catálogo (CU-01):** `q` busca en el título y en el autor (`author_credit`) con `ILIKE`, escapando `%` y `_`. `tags` combina con Y (consulta de `modelo_datos.md`); un slug que no existe deja la lista vacía. Página de 24 obras (constante). Sin orden por tendencias: el de la maqueta queda sin función.
- **Ficha (CU-02):** 404 si la obra no existe o no está aprobada; 410 si está retirada (RN-06). `access` vale `free` (caps. 1–2, ya leído, premium o admin), `ad` (invitado, cap. 3), `account` (invitado, cap. 4 en adelante) o `balance` (registrado, gasta 1 de saldo).
- **Lectura (CU-03, CU-04, CU-12, CU-24):** es `POST` porque registra la lectura (ningún GET modifica datos; pasa el control CSRF). Se decide en este orden:
  1. Obra y capítulo existen y están aprobados (404) y no retirados (410).
  2. Admin y premium leen siempre, sin anuncios ni saldo.
  3. Caps. 1–2: libres para todos y sin consumo.
  4. Invitado: el cap. 3 exige un `X-Ad-Token` válido (misma obra, emitido hace al menos `AD_MIN_SECONDS` y como mucho 30 min); si no, 403 `AD_NOT_COMPLETED`. Del cap. 4 en adelante, 401 `UNAUTHENTICATED`: el lector muestra la invitación a registrarse y no redirige.
  5. Registrado: si ya lo leyó, no consume; si no, gasta 1 del saldo recalculado (RN-02, fila con `SELECT … FOR UPDATE`). Sin saldo, 403 `READING_LIMIT` con `retryAt`.
- **Efectos de la lectura,** en una transacción: `chapter_reads` (primera lectura o `last_read_at`), `reading_credits` (saldo y `reads_since_ad`) y `chapter_read_counts` (`user_reads` en la primera lectura; `guest_reads` si el capítulo no está en la cookie firmada del invitado, con sus últimos 50 ids). No cuentan el autor dueño ni el admin. "Recargar" (CU-03) repite la petición: URLs firmadas nuevas, sin volver a consumir.
- **Anuncios (RN-03):** el registrado recibe `ads.end` en cada capítulo y `ads.interstitial` cuando `reads_since_ad` llega a 5 primeras lecturas, que lo pone a 0. Se eligen al azar entre los activos. El intersticial va al final del bloque (recortable).
- **Token de anuncio (RN-01):** lo da `GET /api/comics/:slug/ad`, que no guarda nada. Sin anuncios activos (solo si no se ejecutó el seed), `ad` es `null` y el token se emite igual: el lector muestra la cuenta atrás sin tarjeta y el cap. 3 no queda bloqueado (aprobado el 2-nov). Es `comicId.startedAt` en base64url más su HMAC-SHA256, con una clave derivada de `COOKIE_SECRET` (etiqueta `ad-token`), sin variable nueva. Viaja en la cabecera `X-Ad-Token`, nunca en la URL, para que no quede en los logs: `api.ts` acepta cabeceras opcionales por petición, y las llamadas que no las pasan no cambian.
- **`/files/:key` (driver local):** la firma es un HMAC-SHA256 de `key` y `exp` (segundos Unix) con una clave derivada de `COOKIE_SECRET` (etiqueta `files`). La clave se valida con la regex del plan antes de tocar el disco. Con `r2`, las URLs son prefirmadas de R2.
- **Páginas:** `/obra/:slug` y `/leer/:slug/:numero` hacen las comprobaciones del mapa de rutas (404, 410) y piden los datos a la API; `/leer/:slug` → 301 a `/leer/:slug/1`.
- **Importación (RN-18):** en `comic.json`, `licenseUrl` y `contentWarning` admiten `null` y el título de capítulo es opcional. El ancho y el alto de cada viñeta se leen de la cabecera del archivo (JPEG, PNG o WebP, sin dependencias) y se guardan en `panels`; el lector los pone en `<img width height>` para que la página no salte mientras cargan.

## Contrato de la API del bloque 3

Aprobado el 4-nov. (Dn) remite a la decisión aprobada del informe de arranque del bloque (bitácora).

Comunidad y autor (CU-05, CU-06, CU-13, CU-23, CU-28 a CU-31; RN-05 a RN-07, RN-09 a RN-13, RN-15, RN-17 y RN-19). Migración 006. Sin variables de entorno nuevas ni cambios en el seed. La aprobación y la moderación (ocultar y eliminar comentarios ajenos) son del bloque 4: en este bloque una obra o un capítulo enviados se quedan en `pending` (los tests los aprueban con SQL).

**Comunes a todo el bloque:**

- Textos: sin espacios al principio ni al final y con la longitud contada en puntos de código (como RN-12 y el `char_length` de la BD), no en unidades UTF-16. Sin caracteres de control, salvo el salto de línea en la sinopsis y en los comentarios (`\r\n` se guarda como `\n`). Límites en `config/limits.ts`, duplicados en el cliente (D5).
- Propiedad: se comprueba en el servicio con `permissions.ts`. Una obra que no existe da 404; una ajena, 403 `FORBIDDEN` (CU-29: "la obra no le pertenece"); una retirada, 410.
- Capítulo vivo: el de ese número con `deleted_at IS NULL` y `status <> 'rejected'` (único por `chapters_comic_number_uq`). Las rutas del autor con `:number` actúan siempre sobre él.
- Toda acción auditada escribe en `audit_log` con el mismo `client` de su `withTransaction`. `before` y `after`, solo con los campos cambiados.

### Comentarios por viñeta (CU-05, CU-13; RN-11, RN-13)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/comics/:slug/chapters/:number/panels/:position/comments` | Público (D1) | Query: `page` (≥ 1) | 200 `{ comments: CommentDto[], page, pageSize, total }` | 400, 404, 410 | — |
| `POST /api/comics/:slug/chapters/:number/panels/:position/comments` | `requireAuth` y poder leer el capítulo sin gastar saldo (D2) | `body` | 201 `{ comment: CommentDto }` | 400, 401, 403 `FORBIDDEN`, 404, 410, 429 | — (la tabla no tiene `comment.create`) |
| `DELETE /api/comments/:id` | `requireAuth`; solo quien lo escribió (servicio) | — | 204 | 401, 403 `FORBIDDEN`, 404, 409 `CONFLICT`, 410 `GONE` | `comment.delete_own` |

```ts
interface CommentDto {
  id: number;
  body: string;       // texto plano; el cliente lo pinta con textContent
  authorName: string; // nombre visible de quien lo escribió (también si está suspendido: RN-15)
  createdAt: string;  // ISO 8601
  mine: boolean;      // lo escribió quien consulta (puede borrarlo); false para el invitado
}

// Ampliación del ReadingDto del bloque 2 (D3): cada viñeta lleva su contador.
interface ReadingPanelDto {
  position: number;
  url: string;
  width: number;
  height: number;
  comments: number; // sin ocultos ni eliminados (consulta de modelo_datos.md); 0 en la vista previa
}
```

- **Viñeta:** la obra y el capítulo deben ser públicos (404 y 410, como la lectura) y `:position`, una viñeta existente (404). Los comentarios cuelgan de la viñeta: un capítulo de reemplazo empieza sin comentarios (riesgo aceptado).
- **Lista (CU-05):** sin ocultos ni eliminados (un oculto no lo ve nadie, tampoco su autor), del más antiguo al más reciente (`created_at, id`), 50 por página (D4).
- **Publicar (CU-13):** `body` de 1 a 500 caracteres (RN-11). Quien comenta debe poder leer el capítulo sin gastar nada: `chapterAccess(...)` = `free` (caps. 1–2, ya leído, premium, admin o su obra); si no, 403 `FORBIDDEN` (D2). Limitador de 5 / min por usuario después de `validate` y `requireAuth` (RN-13); cuenta cada intento validado.
- **Borrar el propio:** el orden de comprobación es 404 (no existe u oculto, D15), 403 (ajeno: no revela si se retiró), 410 (su obra o su capítulo se retiraron, RN-06, como el resto de lo retirado; sin cambios ni auditoría) y 409 (ya eliminado, RN-11). Pone `deleted_at = now()`; la auditoría lleva `before { deletedAt: null }` y `after { deletedAt }`, sin el texto.
- **Moderación** (`comment.hide`, `comment.delete`): bloque 4.

### Compartir viñeta e iconos (CU-06; sin API)

- Enlace absoluto `location.origin` + `/leer/:slug/:numero#v-:n` (RN-09).
- Orden: Web Share (`navigator.share`, que solo existe en contexto seguro) → si no existe o falla, un `<input readonly>` con el enlace ya seleccionado y "Copiar enlace" (solo si existe `navigator.clipboard`). Si el usuario cancela el menú nativo (`AbortError`), no se muestra nada. En `http://koma.local` solo queda el `<input>`.
- "Ocultar iconos de comentarios": preferencia en `localStorage` con `try/catch` (idea 4).

### Perfil (CU-23; RN-12, RN-13, RN-15)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `PATCH /api/me` | `requireAuth` | `displayName` | 200 `{ user: UserDto }` | 400, 401 | `user.update_profile` (`displayName` antes y después; sin cambio, sin entrada) |
| `POST /api/auth/password` (D12) | `requireAuth` | `currentPassword`, `newPassword` | 200 `{ user: UserDto }` + cookie nueva | 400 (también la contraseña actual incorrecta, en `fields.currentPassword`), 401, 429 (D11) | `user.password_change` (sin `before` ni `after`) |

- `displayName`: la regla del registro (RN-12). El correo no se edita en el MVP.
- `newPassword`: RN-12 (`passwordProblem`); `currentPassword`: como en el login (obligatoria, ≤ 72 bytes).
- **Cambio de contraseña (RN-15):** el hash se calcula fuera de la transacción; dentro van el hash nuevo, `token_version + 1` y la auditoría. La respuesta trae un JWT nuevo en la cookie y las demás sesiones dejan de valer.
- **Límite (D11):** 5 contraseñas actuales incorrectas / 15 min por usuario; acertar pone el contador a cero. Va después de `validate`.

### Obras del autor (CU-28, CU-30; RN-05 a RN-07, RN-09, RN-17)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/author/comics` | `requireAuthor` | — | 200 `{ comics: AuthorComicDto[] }`, de la más reciente a la más antigua, sin las retiradas | 401, 403 | — |
| `POST /api/author/comics` | `requireAuthor` | `CreateComicInput` | 201 `{ comic: AuthorComicDto }` | 400, 401, 403 | `comic.create` |
| `PUT /api/author/comics/:slug/cover` | `requireAuthor` + dueño; limitador de subidas | `multipart/form-data`, campo `image` | 200 `{ comic: AuthorComicDto }` | 400, 401, 403, 404, 409 (rechazada, D8), 410, 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_FILE`, 429 | `comic.update` (`coverKey`) |
| `PATCH /api/author/comics/:slug` (recortable) | `requireAuthor` + dueño | Los campos de `CreateComicInput`, todos opcionales, salvo `authorshipDeclared` | 200 `{ comic: AuthorComicDto }` | 400, 401, 403, 404, 409 (rechazada, D8), 410 | `comic.update` |
| `POST /api/comics/:slug/withdraw` (D13) | `requireAuth`; autor dueño o admin (servicio) | — | 204 | 401, 403, 404, 409 `CONFLICT` (ya retirada) | `comic.withdraw` |

```ts
// D6: lista cerrada y sin licencias NC; la URL la pone el servidor.
type LicenseCode = 'all-rights-reserved' | 'cc-by-4.0' | 'cc-by-sa-4.0' | 'cc0-1.0';

interface CreateComicInput {
  title: string;                 // 1–100 (D5)
  synopsis: string;              // 1–1000, admite saltos de línea
  authorCredit: string;          // 1–100: el creador original (RN-07); el formulario propone el nombre visible
  license: LicenseCode;
  tags: string[];                // 1–10 slugs existentes, al menos uno de tipo genre (D5)
  contentWarning: string | null; // 1–200 o null (RN-08)
  isAdult: boolean;              // RN-17
  authorshipDeclared: true;      // obligatoria (RN-07, CU-28); false o ausente → 400
}

interface AuthorComicDto {
  slug: string;
  title: string;
  synopsis: string;
  authorCredit: string;
  license: LicenseCode;
  licenseUrl: string | null;
  tags: TagDto[];
  contentWarning: string | null;
  isAdult: boolean;
  coverUrl: string | null; // firmada
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null; // CU-28: se muestra el motivo
  createdAt: string; // ISO 8601
  chapters: AuthorChapterSummaryDto[]; // por número, sin los retirados; los rechazados, con su motivo
}

interface AuthorChapterSummaryDto {
  number: number;
  title: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  panelCount: number;
  publishedAt: string | null; // ISO 8601; null si nunca se aprobó
}
```

- **Licencias (D6):** `all-rights-reserved` → "Todos los derechos reservados" (sin URL); `cc-by-4.0` → "CC BY 4.0"; `cc-by-sa-4.0` → "CC BY-SA 4.0"; `cc0-1.0` → "CC0 1.0". Las tres CC, con su URL `…/deed.es` de creativecommons.org. En `comics.license` se guarda el texto visible, el mismo formato que las obras importadas.
- **Alta (CU-28):** nace `pending`, con `author_id` = el usuario y `authorship_declared = true` (RN-05, RN-07). Un slug de etiqueta inexistente o ninguna de tipo `genre` → 400 en `fields.tags`. `isAdult: true` se guarda, pero la obra no se podrá aprobar (RN-17): el formulario lo avisa. La auditoría guarda en `after` el slug, el título, el estado, `isAdult`, la licencia y las etiquetas.
- **Slug (RN-09):** sale del título: minúsculas, sin acentos (NFD sin marcas diacríticas), cada tramo que no sea `[a-z0-9]` se convierte en un guion, sin guiones en los extremos y con 80 caracteres como mucho; si queda vacío, `obra`. Si ya existe (también una retirada), se añade `-2`, `-3`… Si dos altas chocan a la vez (23505), se reintenta. No cambia nunca, aunque cambie el título. Es una función pura (`comics.rules.ts`).
- **Portada (D7):** opcional. Pasa las mismas comprobaciones que una viñeta (RN-10). La clave es nueva y la anterior se borra del almacenamiento después del `COMMIT`; si ese borrado falla, queda un aviso en el log.
- **Editar (CU-30, recortable; nivel 2 de la contingencia):** sin reaprobación. El slug no cambia. `isAdult` solo cambia mientras la obra no está aprobada (si lo está, 400, D14).
- **Retirar (CU-30, RN-06):** `deleted_at = now()`. La ficha, el lector y la API pública responden 410, y los comentarios quedan ocultos con la obra. El admin puede retirar cualquiera (su botón llega en el bloque 4).

### Capítulos y viñetas (CU-29, CU-30; RN-05, RN-09, RN-10, RN-13)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `POST /api/author/comics/:slug/chapters` | `requireAuthor` + dueño | `number`, `title?` | 201 `{ chapter: AuthorChapterDto }` | 400, 401, 403, 404, 409 `CONFLICT` (número en uso u obra rechazada), 410 | `chapter.create` |
| `GET /api/author/comics/:slug/chapters/:number` | `requireAuthor` + dueño | — | 200 `{ chapter: AuthorChapterDto }` | 401, 403, 404, 410 | — |
| `POST /api/author/comics/:slug/chapters/:number/panels` | `requireAuthor` + dueño; limitador de subidas | `multipart/form-data`, campo `image` | 201 `{ panel: AuthorPanelDto }` | 400 (sin archivo; la imagen 61), 401, 403, 404, 409 (no es borrador), 410, 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_FILE`, 429 | — |
| `DELETE /api/author/comics/:slug/chapters/:number/panels/:position` | `requireAuthor` + dueño | — | 204 | 401, 403, 404, 409 (no es borrador), 410 | — |
| `PATCH /api/author/comics/:slug/chapters/:number/panels/:position` | `requireAuthor` + dueño | `position` (nueva) | 200 `{ chapter: AuthorChapterDto }` | 400 (posición fuera de 1…n), 401, 403, 404, 409 (no es borrador), 410 | — |
| `POST /api/author/comics/:slug/chapters/:number/submit` | `requireAuthor` + dueño | — | 200 `{ chapter: AuthorChapterDto }` | 400 `VALIDATION_ERROR` sin `fields` (sin viñetas), 401, 403, 404, 409 (no es borrador), 410 | `chapter.submit` |
| `POST /api/author/comics/:slug/chapters/:number/withdraw` | `requireAuthor` + dueño | — | 204 | 401, 403, 404, 410 | `chapter.withdraw` |

```ts
interface AuthorChapterDto extends AuthorChapterSummaryDto {
  panels: AuthorPanelDto[]; // por posición
}

interface AuthorPanelDto {
  position: number;
  url: string; // firmada
  width: number; // px, leídos de la cabecera del archivo
  height: number;
}
```

- **Crear (CU-29):** `number`, entero de 1 a 2³¹ − 1 (el formulario propone el siguiente libre, D22); `title`, de 1 a 100 o, si falta, "Capítulo N" (solo al crearlo, D21). Nace `draft`. Se admite en una obra `pending` o `approved`; en una `rejected`, 409 (D8). Un número ocupado por un capítulo vivo da 409 "El número de capítulo ya está en uso" (23505 en `chapters_comic_number_uq`). El de un retirado o rechazado se reutiliza y hereda su URL (RN-09).
- **Subir una viñeta (RN-10, RN-13):**
  - Middlewares en orden: `validate` (params) → `requireAuthor` → limitador de subidas (100 / h por usuario; cuenta cada intento validado, portada incluida, D19) → `upload` → servicio.
  - `upload`: multer en disco (`os.tmpdir()`), un solo archivo en el campo `image`, sin campos de texto y 5 MB como mucho (si no, 413 `FILE_TOO_LARGE`).
  - Servicio: la firma de la cabecera debe ser JPEG, PNG o WebP (`utils/image.ts`; si no, 415 `UNSUPPORTED_FILE`), y de ella salen el ancho y el alto. Clave `UUID.ext` del servidor y `storage.put` desde el temporal, que se borra siempre (`finally`).
  - Con el capítulo bloqueado (`FOR UPDATE`): con 60 viñetas ya, 400; la posición nueva es `max + 1`. Si la transacción falla después de `put`, la imagen queda huérfana (riesgo aceptado de los borradores).
- **Eliminar una viñeta (RN-05):** solo en `draft`. Borrado físico y recompactación con la restricción diferida (`modelo_datos.md`). La imagen se borra del almacenamiento después del `COMMIT`, con un método nuevo del driver, `remove(key)` (local: `unlink`; R2: `DeleteObject`). No hay acción de auditoría para las viñetas: el borrador nunca fue público.
- **Enviar a revisión (RN-05):** de `draft`, con al menos una viñeta, a `pending`. Sin viñetas, 400 `VALIDATION_ERROR` sin `fields`: el error es del capítulo, no de un campo del cuerpo (no lleva cuerpo). Desde `pending` ya no se edita: se retira y se sube otro.
- **Retirar (CU-30):** desde `draft`, `pending` o `approved`, `deleted_at = now()`. Si estaba aprobado, el lector responde 410 y deja de salir en la ficha. El número queda libre.
- **Reordenar viñetas (RN-05, D9):** solo en `draft`. Mueve la viñeta de `position` a la posición nueva y desplaza las intermedias, en una transacción con el capítulo bloqueado (`FOR UPDATE`) y la restricción diferida (`modelo_datos.md`). La misma posición responde 200 sin cambios. Sin auditoría, como el resto de operaciones del borrador. En `/autor`, los botones ↑↓ de la maqueta mueven una posición; el primero no sube y el último no baja (`disabled`), y el cambio se anuncia en una región `aria-live`.

### Vista previa del dueño y del admin (mapa de rutas; D10, recortable)

- `GET /api/comics/:slug` y `/obra/:slug`: el autor dueño y el admin también ven la obra en `pending`. `ComicDto` gana `status`, y cada `ChapterSummaryDto` gana `status` y pasa a `publishedAt: string | null`. Para ellos, `chapters` incluye los capítulos vivos en `draft` y `pending` (con `access: 'free'`). Para los demás, nada cambia: todo es `approved`.
- `POST /api/comics/:slug/chapters/:number/read` y `/leer/:slug/:numero`: el autor dueño y el admin leen también un capítulo `draft` o `pending` de una obra no retirada. No se escribe en `chapter_reads`, `reading_credits` ni en las estadísticas; `ads` y `balance` van a `null`, cada `comments` vale 0 y no se abre el panel de comentarios (solo se comenta en un capítulo `approved`). `prev` y `next` recorren los capítulos que esa persona puede ver.
- `ReadingDto` gana `preview: boolean`: `true` solo en esa vista previa (capítulo `draft` o `pending`, u obra `pending`), y `false` en cualquier lectura normal, también la del admin o la del dueño en un capítulo aprobado. Con él, el cliente decide si avisa de la vista previa y si oculta los iconos de comentarios: `ads` y `balance` a `null` y los comentarios a 0 también salen para el admin en una lectura normal.

### Panel del autor (CU-31 recortado; RN-19)

Ampliación aprobada el 6-nov. El panel de `/autor` (resumen, lecturas y comentarios recientes) se carga con una sola petición. Sin tablas nuevas: lee `chapter_read_counts`, `comments` y `users.created_at`. Sin punto de abandono ni puntos recibidos (fase 2). Las donaciones son una tarjeta estática "Próximamente" en el HTML, sin datos ni API (fase 3).

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/author/dashboard` | `requireAuthor`; el SQL filtra por el `author_id` del usuario (sin `:slug`: no se puede pedir nada ajeno) | — | 200 `{ dashboard: AuthorDashboardDto }` | 401, 403 | — (solo lectura, sin limitador) |

```ts
interface ReadsDto {
  total: number;
  last7: number;  // de hoy − 6 a hoy
  last30: number; // de hoy − 29 a hoy
}

interface AuthorDashboardDto {
  displayName: string;
  authorSince: string; // users.created_at (ISO 8601): "En Koma desde"
  today: string;       // 'YYYY-MM-DD' en Europe/Madrid: el día de referencia de last7 y last30
  comics: { pending: number; approved: number; rejected: number };
  chapters: { draft: number; pending: number; approved: number; rejected: number };
  reads: ReadsDto;     // todas sus obras
  works: AuthorWorkReadsDto[];
  recentComments: AuthorRecentCommentDto[];
}

interface AuthorWorkReadsDto {
  slug: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  reads: ReadsDto; // = suma de sus capítulos
  chapters: { number: number; title: string; reads: ReadsDto }[]; // los approved vivos, por número
}

interface AuthorRecentCommentDto {
  id: number;
  body: string;       // texto plano; el cliente lo pinta con textContent
  authorName: string;
  createdAt: string;  // ISO 8601
  comic: { slug: string; title: string };
  chapterNumber: number;
  panelPosition: number; // el cliente enlaza a /leer/:slug/:numero#v-:posición
}
```

- **Lecturas (RN-19):** `guest_reads + user_reads` de `chapter_read_counts`. `user_reads` cuenta lectores registrados únicos por capítulo y `guest_reads` las lecturas de invitados (por su cookie): no son visitas. Las ventanas se cuentan con el día de `Europe/Madrid`, el mismo con el que se escriben las filas. Una obra o un capítulo sin lecturas dan ceros.
- **Qué entra:** solo las obras del usuario y sin retiradas, como `GET /api/author/comics`. En `works[].chapters` y en las sumas, solo capítulos `approved` sin retirar: así la suma de los capítulos coincide siempre con la de la obra. `works` va de la obra más reciente a la más antigua.
- **Recuentos:** obras por estado, sin retiradas. Capítulos por estado, sin retirados, de obras no retiradas; un capítulo rechazado sigue contando como rechazado aunque tenga sustituto vivo.
- **Comentarios recientes:** los 10 más nuevos (`created_at DESC, id DESC`) en sus obras, sin ocultos ni eliminados, solo de capítulos `approved` sin retirar de obras sin retirar. Incluye los del propio autor.
- **Motivos de rechazo:** ya los trae `GET /api/author/comics`; el panel no los repite.

### Páginas

Ya figuran en el mapa de rutas; se implementan en este bloque.

| Ruta | Página | Comprobación en servidor | Códigos |
| --- | --- | --- | --- |
| `/perfil` | `profile` | Sesión | 200, 302 a `/entrar?next=/perfil` |
| `/autor` | `author` | Sesión e `isAuthor` (un admin nunca lo es) | 200, 302 a `/entrar?next=/autor`, 403 |
| `/crear` | `become-author` | Sesión; si es autor, 302 a `/autor` | 200, 302 |
| `/obra/:slug`, `/leer/:slug/:numero` | `comic`, `reader` | Se añade la vista previa del dueño y del admin (D10) | Los de siempre |

- `/autor` es una sola página: la obra y el capítulo abiertos van en `?obra=<slug>&capitulo=<n>`, y la vista de nueva obra en `?vista=nueva-obra`; los lee el cliente (D18). La única ruta nueva del servidor es `/crear`.

### Errores de las subidas

- Sin códigos nuevos. `error-handler` traduce los de multer: `LIMIT_FILE_SIZE` → 413 `FILE_TOO_LARGE`; `LIMIT_FILE_COUNT`, `LIMIT_UNEXPECTED_FILE`, `LIMIT_FIELD_COUNT` y `LIMIT_PART_COUNT` → 400 `VALIDATION_ERROR`. Sin archivo (incluida una petición que no es `multipart/form-data`) → 400 en `fields.image`.
- Permiso y limitador van antes de multer: un 401, 403 o 429 no escribe nada en disco. Si multer corta la subida (413 o 400), no queda el archivo parcial en el temporal (lo comprueba un test).

## Contrato de la API del bloque 4

Aprobado el 8-nov. (Dn) remite a la decisión aprobada del informe de arranque del bloque (bitácora).

Admin y Stripe (CU-21, CU-27, CU-32, CU-33, CU-35, CU-36 y CU-40; RN-04, RN-05, RN-09, RN-11 y RN-14 a RN-17). Migración 009 y seed del bloque 4 (`modelo_datos.md`). Sin variables de entorno nuevas (`STRIPE_TEST_CLOCK_ID` ya existe), sin dependencias nuevas y sin códigos de error nuevos. Online, Stripe en modo prueba con el producto, el precio, el portal y el destino del webhook creados en el bloque 1; en local, el pago simulado (`env.ts` lo rechaza en producción).

**Comunes a todo el bloque:**

- Rutas del admin bajo `/api/admin/*`, con `requireAdmin` en su router (D1): sin sesión, 401; sin rol admin, 403 `FORBIDDEN`.
- Las reglas, en `permissions.ts` y en funciones puras (`*.rules.ts`). El estado se comprueba en el servicio con la fila bloqueada (`SELECT … FOR UPDATE`) dentro de su `withTransaction`: de dos admins que actúan a la vez sobre lo mismo, uno recibe 409.
- Toda acción auditada escribe en `audit_log` con el mismo `client`. `before` y `after`, solo con los campos cambiados y en camelCase. `entityId` = el id de nuestra tabla; nunca ids de Stripe (cliente, suscripción, evento), `token_version` ni datos de pago.
- Una acción ya hecha (aprobar lo que no está `pending`, ocultar un oculto, suspender a un suspendido…) → 409 `CONFLICT`, como en el bloque 3.
- Textos (motivo de rechazo, búsquedas): la regla común del bloque 3 (`utils/text.ts`); límites en `limits.ts`, duplicados en el cliente.
- Listas del admin: `page` (≥ 1), 50 por página (`ADMIN_PAGE_SIZE`) y respuesta `{ …, page, pageSize, total }`. `q` de 0 a 100 caracteres con `ILIKE`, escapando `%` y `_`.

### Aprobación de contenido (CU-32; RN-05, RN-09, RN-17)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/admin/review` | `requireAdmin` | — | 200 `{ items: ReviewItemDto[], counts: { comics, chapters } }`, del envío más antiguo al más reciente | 401, 403 | — |
| `POST /api/admin/comics/:slug/approve` | `requireAdmin` | — | 204 | 401, 403, 404, 409 `CONFLICT` (no está `pending`, o está marcada +18), 410 | `comic.approve` |
| `POST /api/admin/comics/:slug/reject` | `requireAdmin` | `reason` | 204 | 400, 401, 403, 404, 409 (no está `pending`), 410 | `comic.reject` |
| `POST /api/admin/comics/:slug/chapters/:number/approve` | `requireAdmin` | — | 204 | 401, 403, 404, 409 (no está `pending`, u obra rechazada), 410 (obra retirada) | `chapter.approve` |
| `POST /api/admin/comics/:slug/chapters/:number/reject` | `requireAdmin` | `reason` | 204 | 400, 401, 403, 404, 409 (no está `pending`, u obra rechazada), 410 | `chapter.reject` |

```ts
interface ReviewItemDto {
  kind: 'comic' | 'chapter';
  comic: {
    slug: string;
    title: string;
    status: 'pending' | 'approved';  // un capítulo puede llegar con su obra aún en revisión (D2)
    publishedBy: string;             // nombre visible del autor (las importadas nunca están pending)
    isAdult: boolean;                // RN-17
    contentWarning: string | null;   // RN-08
  };
  chapter: { number: number; title: string; panelCount: number } | null; // null si kind = 'comic'
  submittedAt: string; // ISO 8601. Obra: created_at; capítulo: updated_at (el envío es su último cambio, RN-05)
}
```

- **Cola:** obras `pending` y capítulos vivos `pending` (los `draft` no llegan: CU-32), sin obras ni capítulos retirados ni capítulos de obras rechazadas (D2). Hasta 100 de cada tipo (`REVIEW_QUEUE_MAX`); `counts` da el total real. El admin revisa con la vista previa del bloque 3 (`/obra/:slug` y `/leer/:slug/:numero`).
- **Aprobar una obra:** de `pending` a `approved`. Con `is_adult = true`, 409 "Las obras +18 no se pueden aprobar en el MVP" (RN-17); el admin la rechaza con motivo, igual que una +18 sin marcar. Auditoría: `before { status: 'pending' }`, `after { status: 'approved' }`.
- **Rechazar:** `reason` de 1 a 500 caracteres (`REJECTION_REASON_MAX`, D3). Se guarda en `rejection_reason` y el autor lo ve en `GET /api/author/comics`. Auditoría: `before { status: 'pending', rejectionReason: null }`, `after { status: 'rejected', rejectionReason }`. Un capítulo rechazado libera su número (RN-09).
- **Aprobar un capítulo:** de `pending` a `approved`, con `published_at = now()`. Auditoría: `before { status: 'pending', publishedAt: null }`, `after { status: 'approved', publishedAt }`, el mismo formato que `demo:data`. Se admite con la obra en `pending` (D2): el capítulo se hace público al aprobarse la obra. Con la obra `rejected`, 409.
- **Retirar cualquier obra:** el `POST /api/comics/:slug/withdraw` del bloque 3, sin cambios. El botón, en `/obra/:slug` y solo para el admin (D4, recortable).

### Moderación de comentarios (CU-33; RN-11)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/admin/comments` | `requireAdmin` | Query: `q`, `status` (`visible` \| `hidden`; sin él, los dos), `page` | 200 `{ comments: AdminCommentDto[], page, pageSize, total }`, del más reciente al más antiguo | 400, 401, 403 | — |
| `POST /api/admin/comments/:id/hide` | `requireAdmin` | — | 204 | 401, 403, 404, 409 (ya oculto o eliminado), 410 | `comment.hide` |
| `DELETE /api/admin/comments/:id` | `requireAdmin` | — | 204 | 401, 403, 404, 409 (ya eliminado), 410 | `comment.delete` |

```ts
interface AdminCommentDto {
  id: number;
  body: string;                                // texto plano; el cliente lo pinta con textContent
  author: { id: number; displayName: string }; // para buscarlo en Usuarios
  createdAt: string;                           // ISO 8601
  hiddenAt: string | null;
  comic: { slug: string; title: string };
  chapterNumber: number;
  panelPosition: number;                       // enlace a /leer/:slug/:numero#v-:posición
}
```

- **Lista (D5):** sin eliminados ni comentarios de obras o capítulos retirados. `q` busca en el texto y en el nombre del autor. Sin reportes ni prioridad: los reportes son de fase 2 (idea 22).
- **Ocultar:** `hidden_at = now()`. Deja de verse en la lista pública, en el contador de la viñeta y en el panel del autor, también para quien lo escribió (RN-11). En el MVP no se deshace (la restauración es de fase 2). Auditoría: `before { hiddenAt: null }`, `after { hiddenAt }`, sin el texto, como `comment.delete_own`.
- **Eliminar:** `deleted_at = now()`, también de uno oculto. Auditoría: `before { deletedAt: null }`, `after { deletedAt }`.
- **Orden de comprobación:** 404 (no existe), 410 (su obra o su capítulo se retiraron, RN-06) y 409.
- Solo desde `/admin`: el panel de comentarios del lector no gana botones de moderación (D5).

### Usuarios (CU-35; RN-14, RN-15)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/admin/users` | `requireAdmin` | Query: `q`, `role` (`user` \| `author` \| `admin`), `status` (`active` \| `suspended`), `page` | 200 `{ users: AdminUserDto[], page, pageSize, total }`, del más reciente al más antiguo | 400, 401, 403 | — |
| `PATCH /api/admin/users/:id` | `requireAdmin` | Exactamente uno de `role` (`user` \| `admin`), `isAuthor` o `status` (`active` \| `suspended`) (D6) | 200 `{ user: AdminUserDto }` | 400, 401, 403 (sobre sí mismo), 404, 409 | `user.role_change`, `user.author_grant`, `user.author_revoke`, `user.suspend` o `user.reactivate` |

```ts
interface AdminUserDto {
  id: number;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  isAuthor: boolean;
  status: 'active' | 'suspended';
  isPremium: boolean;
  premiumUntil: string | null; // ISO 8601
  createdAt: string;
  isSelf: boolean;             // el cliente desactiva sus botones de rol y estado
}
```

- **Búsqueda:** `q` en el correo y en el nombre visible; `role=author` filtra por `is_author`.
- **Reglas** (función pura en `permissions.ts`, con tests de RN-14):
  - Sobre sí mismo, el admin no cambia su rol ni su estado → 403 "No puedes cambiar tu propio rol ni suspenderte" (RN-14).
  - El mismo valor que ya tiene → 409.
  - `isAuthor: true` a un admin, o `role: 'admin'` a un autor → 409 "Un admin no puede ser autor; quita antes el rol de autor" (`users_admin_not_author`, D7).
  - Quitar el rol a un admin activo o suspenderlo cuando es el único admin activo → 409 (RN-14). Con la primera regla solo puede pasar con dos admins a la vez: se comprueba con las filas de los admins activos bloqueadas.
- **Sesiones (RN-15, D8):** cambiar `role` o `status` incrementa `token_version` y cierra las sesiones de esa cuenta; `isAuthor`, no, porque los permisos se leen de la BD en cada petición. Un suspendido no entra (403 `ACCOUNT_SUSPENDED`) y su contenido sigue visible.
- **Quitar el rol de autor:** sus obras siguen publicadas, pero ya no las gestiona (`canManageComic`).
- **Auditoría:** el campo cambiado en `before` y en `after` (`{ role }`, `{ isAuthor }` o `{ status }`).

### Parámetros de lectura (CU-36; RN-16)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/admin/settings` | `requireAdmin` | — | 200 `{ settings: ReadingSettingsDto }` | 401, 403 | — |
| `PUT /api/admin/settings` | `requireAdmin` | `ReadingSettingsDto` (los tres) | 200 `{ settings: ReadingSettingsDto }` | 400, 401, 403 | `settings.update` (sin cambios, sin entrada) |

```ts
interface ReadingSettingsDto {
  waitMinutes: number; // reading.wait_minutes: 1–1440
  maxBalance: number;  // reading.max_balance: 1–20
  refill: number;      // reading.refill: 1–10
}
```

- Enteros en el rango de RN-16; fuera → 400 con `fields`. Los rangos, en `limits.ts` y duplicados en el cliente.
- Una entrada `settings.update` por petición (`entityType 'settings'`, `entityId` null) con solo las claves que cambian; si no cambia nada, 200 sin entrada, como `PATCH /api/me`.
- Efecto inmediato: la lectura lee los parámetros en cada petición (RN-02, cálculo perezoso). Al bajar el máximo, el saldo guardado se queda en el nuevo máximo al recalcularse, y un saldo lleno (`period_started_at` NULL) sigue al máximo vigente (`modelo_datos.md`).
- Los capítulos libres (`FREE_CHAPTERS`, RN-01) y la espera del anuncio (`AD_MIN_SECONDS`) no se configuran desde el panel.

### Auditoría (CU-40)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/admin/audit` | `requireAdmin` | Query: `actor`, `action`, `entityType`, `entityId`, `from`, `to`, `page` | 200 `{ entries: AuditEntryDto[], page, pageSize, total }`, de la más reciente a la más antigua (`created_at DESC, id DESC`) | 400, 401, 403 | — |

```ts
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface AuditEntryDto {
  id: string;            // BIGINT, como texto
  createdAt: string;     // ISO 8601
  actor: { id: number; displayName: string; email: string } | null; // null = invitado o sistema
  action: string;        // uno de la tabla de auditoría
  entityType: string;
  entityId: string | null;
  before: JsonValue | null;
  after: JsonValue | null;
  ip: string | null;
  requestId: string;     // une la entrada con los logs
}
```

- **Filtros (D9),** combinables con Y:
  - `actor`: correo exacto, sin distinguir mayúsculas; un correo sin cuenta da la lista vacía.
  - `action`: uno de la tabla de auditoría; si no, 400.
  - `entityType`: una tabla auditada (`users`, `comics`, `chapters`, `comments`, `subscriptions`, `settings`, `tags`, `ads`); `entityId`, de 1 a 40 caracteres y solo junto a `entityType`.
  - `from` y `to`: `YYYY-MM-DD`, días de `Europe/Madrid` con los dos extremos incluidos; `from` posterior a `to` → 400.
- `before` y `after` se pintan con `textContent` (JSON con sangría). Solo lectura: la restauración es de fase 2.

### Premium: Checkout, portal y pago simulado (CU-21, CU-27; RN-04)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/payments/subscription` | `requireAuth` | — | 200 `{ subscription: SubscriptionDto \| null }` | 401 | — |
| `POST /api/payments/checkout` | `requireAuth`; no admin | — | 200 `{ url }` | 401, 403 (admin), 409 `CONFLICT` (ya es premium), 503 `SERVICE_UNAVAILABLE` | — (el alta llega por el webhook) |
| `POST /api/payments/portal` | `requireAuth` | — | 200 `{ url }` | 401, 409 (sin cliente de Stripe), 503 | — |
| `POST /api/payments/fake/pay` | Solo con `PAYMENTS_DRIVER=fake`; `requireAuth`; no admin | — | 200 `{ user: UserDto }` | 401, 403 (admin), 409 (ya es premium) | `subscription.start` |
| `POST /api/payments/fake/cancel` | Solo con `PAYMENTS_DRIVER=fake`; `requireAuth` | — | 200 `{ subscription: SubscriptionDto }` | 401, 409 (sin suscripción activa o ya cancelada) | `subscription.cancel` |

```ts
type SubscriptionStatus =
  | 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';

interface SubscriptionDto {
  provider: 'stripe' | 'fake';
  status: SubscriptionStatus;
  currentPeriodEnd: string;   // ISO 8601
  cancelAtPeriodEnd: boolean; // CU-27: sigue premium hasta currentPeriodEnd
}
```

- **Cuál devuelve `GET /api/payments/subscription`:** la `active` con el fin de periodo mayor; si no hay, la más reciente; si no tiene ninguna, `null`.
- **Driver (D10):** `integrations/payments/` con la misma interfaz para `stripe` y `fake`: `createCustomer({ userId, email })` (solo `stripe`; el servicio guarda el cliente antes del checkout, aprobado el 8-nov), `createCheckout({ userId, customerId })`, `createPortal(customerId)` y `retrieveSubscription(id)`. Es un objeto, para que los tests sustituyan sus métodos con `mock.method` sin red. Con `fake`, checkout y portal devuelven `{ url: '/pago-simulado' }`.
- **Checkout con Stripe:**
  - Cliente de Stripe con `apiVersion: '2026-10-28.endive'` en el constructor.
  - Si el usuario no tiene `stripe_customer_id`, se crea el cliente (correo y `metadata.userId`; con `STRIPE_TEST_CLOCK_ID`, asociado a ese reloj) y se guarda con `UPDATE … WHERE stripe_customer_id IS NULL`. Sin auditoría: no es una acción de la tabla.
  - Sesión con `mode: 'subscription'`, `STRIPE_PRICE_ID`, `client_reference_id` y `subscription_data.metadata.userId`, `locale: 'es'`, `success_url = APP_URL + '/premium/gracias'` y `cancel_url = APP_URL + '/premium'` (CU-21: cancelar el pago vuelve sin cambios). La tarjeta solo la ve Stripe.
  - Ya premium → 409 "Ya eres premium; gestiona tu suscripción desde tu perfil". Dos checkouts abiertos a la vez pueden crear dos suscripciones: riesgo aceptado (modo prueba; `premium_until` toma la mayor).
- **Envío desde el cliente (D11):** el botón va dentro de un `<form method="post">`, pero `premium.ts` lo envía por `api.ts` y navega a `url`; sin JavaScript no hay pago. La CSP `form-action` no cambia.
- **Portal:** `billingPortal.sessions.create` con el cliente guardado y `return_url = APP_URL + '/perfil'`. Cancelar y cambiar de tarjeta se hacen allí (CU-27). Sin cliente guardado, 409.
- **Stripe no responde:** 503 `SERVICE_UNAVAILABLE` "El proveedor de pagos no responde"; en el log, el tipo y el código del error de Stripe, nunca el cuerpo.
- **Sin limitador:** RN-13 no prevé uno para los pagos. Cada usuario tiene como mucho un cliente de Stripe.
- **Pago simulado:** `pay` crea una suscripción `provider 'fake'`, con `provider_subscription_id 'fake_<uuid>'`, `active` y `current_period_end = now + 30 días` (`FAKE_PREMIUM_DAYS`, que pasa a `limits.ts`), y la aplica con el mismo `applySubscription` que el webhook (RN-04). `cancel` pone `cancel_at_period_end = true`: sigue premium hasta el fin del periodo. No simula portal ni renovación; al vencer, reglas de registrado sin intervención y sin `subscription.expire` (no llega ningún evento).
- **Admin:** no se hace premium ("Modelo de permisos") → 403; lee sin límites igualmente.

### Webhook de Stripe y `syncSubscription` (RN-04)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `POST /api/stripe/webhook` (bloque 1) | Firma `Stripe-Signature`; sin CSRF ni sesión | Cuerpo crudo del evento | 200 `{ received: true }` | 400 (firma), 413, 503 (Stripe o la BD no responden: Stripe reintenta) | `subscription.start`, `subscription.renew`, `subscription.cancel`, `subscription.resume` o `subscription.expire` (actor `NULL`, D12) |

```ts
// Lo que se guarda de una suscripción, de Stripe o simulada. De Stripe.Subscription sale con una función pura.
interface SubscriptionSnapshot {
  providerSubscriptionId: string;
  customerId: string | null;   // Stripe; null en fake
  status: SubscriptionStatus;
  currentPeriodEnd: Date;      // items.data[0].current_period_end, no la suscripción
  cancelAtPeriodEnd: boolean;  // cancel_at_period_end, o cancel_at no nulo
}
```

Recorrido, después de la verificación de firma del bloque 1:

1. `livemode: true` → aviso en el log y 200, sin tocar nada (D20).
2. Solo se procesan los seis eventos del plan; el resto, 200 sin tocar nada.
3. Id de la suscripción: en `checkout.session.completed`, `session.subscription` (solo con `mode = 'subscription'`); en `customer.subscription.*`, el propio objeto; en `invoice.paid` e `invoice.payment_failed`, `invoice.parent.subscription_details.subscription` (versión fijada). Sin suscripción, 200 sin tocar nada.
4. Si el id del evento ya está en `payment_events`, 200 sin hacer nada (evento repetido).
5. `syncSubscription(subscriptionId)`: `retrieveSubscription` fuera de la transacción (estado actual, así el orden de llegada no importa; si falla, 503). El usuario sale de `users.stripe_customer_id`. Si no hay ninguno (p. ej. `stripe trigger`), aviso en el log, se registra el evento y 200 (D20).
6. En una transacción: usuario bloqueado (`FOR UPDATE`, que serializa sus eventos); `INSERT INTO payment_events … ON CONFLICT DO NOTHING` (si no inserta, otro proceso ya lo procesó: `COMMIT` y 200); `applySubscription`, que inserta o actualiza `subscriptions`, recalcula `users.premium_until` y audita las transiciones.
7. En el log, el `eventId`, el tipo, las acciones aplicadas y el `requestId`; nunca el cuerpo ni la cabecera.

**Transiciones** (función pura `subscriptionTransitions(antes, después)`, con tests de RN-04; una entrada por cada fila que aplique):

| Antes → después | Acción |
| --- | --- |
| Sin fila, o no `active` → `active` | `subscription.start` |
| `active` → `active` con `currentPeriodEnd` mayor | `subscription.renew` |
| `cancelAtPeriodEnd` de `false` a `true` | `subscription.cancel` |
| `active` → otro estado (`past_due`, `canceled`, `unpaid`…) | `subscription.expire` (D13) |
| `cancelAtPeriodEnd` de `true` a `false` (renovar en el portal), con la suscripción `active` | `subscription.resume` (D14) |
| Sin cambios en `status`, `currentPeriodEnd` ni `cancelAtPeriodEnd` | Sin entrada |

- `before` y `after`: `status`, `currentPeriodEnd` y `cancelAtPeriodEnd`, solo los que cambian; `after` de `subscription.start` lleva además `provider` y `userId`.
- `premium_until` = el `current_period_end` mayor entre las suscripciones `active` del usuario, o `NULL` (`modelo_datos.md`). Premium solo con `active` y fin de periodo futuro (RN-04): `past_due` ya no lo es.

### Seed del bloque 4

- `modelo_datos.md`, "Bloque 4": con `PAYMENTS_DRIVER=fake`, si `premium@demo.test` no tiene una suscripción `fake` activa con fin de periodo futuro (D15), se le crea una (`system.seed`, `entityType 'subscriptions'`, `after { id, userId }`) y `premium_until` se recalcula con `applySubscription`. El `INSERT` de las cuentas deja de escribir `premium_until`. Con `stripe`, nada: la cuenta premium paga con una tarjeta de prueba.
- No toca los datos de `demo:data`.

### Páginas

Ya figuran en el mapa de rutas; se implementan en este bloque.

| Ruta | Página | Comprobación en servidor | Códigos |
| --- | --- | --- | --- |
| `/premium` | `premium` | — | 200 |
| `/premium/gracias` | `premium` | Sesión | 200, 302 a `/entrar?next=/premium/gracias` |
| `/pago-simulado` | `fake-checkout` | Solo con `PAYMENTS_DRIVER=fake` (si no, 404); sesión | 200, 302, 404 |
| `/admin` | `admin` | Sesión y `role = admin` | 200, 302 a `/entrar?next=/admin`, 403 |

- **`/premium`:** según `GET /api/me` y la suscripción. Invitado: "Regístrate" y "Entrar" con `next=/premium`. Registrado: "Hacerse premium". Premium: fecha de fin (y "Se cancela el …") y "Gestionar suscripción". Admin: sin botón. El precio va fijo en el HTML: 5 € al mes, el del precio de Stripe (D16).
- **`/premium/gracias`** (misma página, otro estado): consulta `/api/me` cada 2 s hasta ver `isPremium`, como mucho 30 s (constantes). Al confirmarse, muestra la bienvenida de la maqueta (D17); si no, "El pago tarda más de lo normal", con enlace a `/perfil`. El estado se anuncia con `aria-live`.
- **`/pago-simulado`:** "Pagar" sin premium o "Cancelar suscripción" con una suscripción `fake` activa sin cancelar, y "Volver a Premium". Sin campos de tarjeta.
- **`/perfil`:** la tarjeta de premium gana "Hacerse premium" o "Gestionar suscripción" (portal o pago simulado) y "Se cancela el …" (D18).
- **`/admin`:** una sola página con las cinco secciones y anclas de la maqueta (Aprobaciones, Comentarios, Usuarios, Parámetros, Auditoría). Cada sección pide su lista al cargar; los filtros van a la API, no filtran en el cliente. Tablas con `<caption>` y `<th scope>`. Rechazar pide el motivo en un `<dialog>`; eliminar, suspender y quitar un rol piden confirmación. Los cambios se anuncian en una región `aria-live`. Respecto a la maqueta: la única métrica es «Revisión pendiente» (`counts`); la cola muestra solo lo `pending` (el historial está en la auditoría); «Comentarios recientes» con Ocultar y Eliminar, sin reportes; Usuarios con botones de rol, autor y estado en cada fila; Parámetros, solo los tres de RN-16; Auditoría con la columna «Actor» («Sistema» si es `NULL`) y los filtros de CU-40, con «Desde» y «Hasta»; sin «Ir al estudio del autor».
- **Cabecera:** enlace "Premium" (maqueta) para todos menos el admin, y "Admin" para el admin (D19).
- **Test Clocks** (D21): recortado el 9-nov (contingencia nivel 1). La demo muestra alta, portal, cancelación y renovación; `STRIPE_TEST_CLOCK_ID` sigue siendo opcional.

## Contrato de la API del bloque 5

Aprobado el 10-nov. (Dn) remite a la decisión aprobada de la propuesta del bloque 5 (bitácora del 10-nov).

Fase 2 seleccionada (CU-39 con su exportación, CU-31 resto, CU-06 Open Graph e idea 10; RN-20 y RN-21). Sin migraciones, sin dependencias, sin códigos de error nuevos y sin archivos generados en el servidor. Variable nueva: `DISCORD_INVITE_URL` (opcional). Orden: CU-39 con su vista de impresión → punto de abandono → Open Graph; el enlace de Discord, solo con los tres anteriores desplegados y auditados (la vista de impresión pasó a CU-39 el 10-nov).

**Comunes a todo el bloque:**

- Solo lectura salvo el progreso (RN-21). Ningún GET modifica datos.
- **Ventanas (RN-20):** «N días» son días naturales de `Europe/Madrid` con hoy incluido, como RN-19: lecturas por `chapter_read_counts.day`, y fechas (`created_at`, `last_read_at`) convertidas con `AT TIME ZONE 'Europe/Madrid'` a su día. La única ventana móvil es «24 h» (`created_at > now() - interval '24 hours'`), y se llama así para distinguirla.
- Lecturas: la definición de RN-19, sin obras ni capítulos retirados. `ReadsDto` es el del bloque 3 (`total`, `last7`, `last30`).
- Sin datos personales en las estadísticas ni en la vista de impresión.

### Estadísticas globales (CU-39; RN-20)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/admin/stats` | `requireAdmin` (router del admin, D1 del bloque 4) | — | 200 `{ stats: AdminStatsDto }`, `Cache-Control: no-store` | 401, 403 | — (solo lectura, sin limitador) |

```ts
interface AdminStatsDto {
  today: string; // 'YYYY-MM-DD' en Europe/Madrid: el día de referencia de las ventanas
  users: {
    total: number;        // todas las cuentas = readers + authors + admins + suspended
    readers: number;      // activas, role 'user' sin is_author
    authors: number;      // activas, role 'user' con is_author
    admins: number;       // activas, role 'admin'
    suspended: number;    // suspendidas, de cualquier rol
    premium: number;      // activas, no admin, premium_until > now() (RN-04)
    activeLast30: number; // activas, no admin, con alguna lectura (chapter_reads.last_read_at) en los últimos 30 días (D2)
  };
  reads: ReadsDto & { guests: ReadsDto; users: ReadsDto }; // reads = guests + users, campo a campo
  catalog: { comics: number; chapters: number };           // obras approved sin retirar; capítulos approved sin retirar de esas obras
  topComics: { slug: string; title: string; reads: ReadsDto }[]; // hasta 5 (D4)
  comments: { last7: number; moderatedLast7: number };     // D1
  auditLast24h: number;                                    // entradas de audit_log en las últimas 24 h (D3)
}
```

- **Usuarios:** cada cuenta cuenta una sola vez: las activas, por su rol; las suspendidas, aparte. Por eso `readers + authors + admins + suspended = total`.
- **Lecturas:** suma de `guest_reads` y `user_reads` de `chapter_read_counts`, sin obras ni capítulos retirados (RN-19, para toda la plataforma). Ya excluyen al admin y al autor dueño, que no se cuentan al escribir.
- **`topComics`:** obras approved sin retirar con alguna lectura, ordenadas por `reads.last30` descendente, después `reads.total` descendente y por último `slug` ascendente (desempate determinista). Como mucho 5 (`ADMIN_TOP_COMICS`).
- **`comments.last7`:** comentarios creados en los últimos 7 días, en cualquier estado: mide actividad, también la que después se moderó.
- **`comments.moderatedLast7`:** comentarios distintos (`count(DISTINCT entity_id)`) con alguna entrada `comment.hide` o `comment.delete` en la auditoría en los últimos 7 días. Uno ocultado y después eliminado cuenta una vez. No cuenta `comment.delete_own`.
- **«Revisión pendiente»** sigue saliendo de `GET /api/admin/review` (`counts`): no se repite.
- **Página `/admin`:** la fila de métricas pasa a cuatro tarjetas, como la maqueta: «Revisión pendiente» (`counts`), «Comentarios · 7 días» con la nota «N moderados» (D1), «Usuarios activos · 30 días» (D2) y «Eventos recientes» con la nota «En las últimas 24 h» (D3). Debajo, la sección nueva «Estadísticas» (`#estadisticas`, primera ancla de la navegación de secciones, D5) con cuatro tablas con `<caption>` y `<th scope>`: cuentas, actividad y catálogo (indicador, periodo y valor: premium, usuarios activos, comentarios, moderados, eventos de 24 h, obras y capítulos publicados), lecturas (total, 7 días y 30 días; invitados, registrados y total) y obras más leídas. El botón «Imprimir o guardar como PDF» se activa al llegar los datos y se describe con el mensaje de la sección. Se pide al cargar la página, como las demás secciones; un error se muestra en la sección y no bloquea el resto.

### Exportación: vista de impresión (CU-39; RN-20)

Sin API ni archivos generados en el servidor. Solo el admin (D11: no en el panel del autor).

- Botón «Imprimir o guardar como PDF» en la sección «Estadísticas», que llama a `window.print()`. Sin auditoría: no llega ninguna petición al servidor.
- `@media print` (solo la sección «Estadísticas» y las cuatro tarjetas de métricas, D10):
  - cabecera de informe «Koma · Informe de la plataforma» y la fecha (`today`); el logo, solo si se lee bien sobre blanco;
  - el periodo, visible junto a cada cifra («Total», «7 días», «30 días», «24 h»);
  - se ocultan la cabecera y el pie del sitio, la navegación móvil y la de secciones, el aviso flotante, los botones y el resto de secciones;
  - texto oscuro sobre blanco, con colores de impresión como tokens en `variables.css` (sin `prefers-color-scheme`: el test de tema oscuro sigue igual);
  - tablas y tarjetas con `break-inside: avoid`: no se parten entre páginas.

### Punto de abandono (CU-31 resto; RN-21)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `POST /api/comics/:slug/chapters/:number/progress` | `requireAuth`; limitador de progreso (D7) | `{ panel }`: entero ≥ 1 | 204 | 400 (`panel` mayor que el número de viñetas, en `fields.panel`), 401, 404, 410, 429 | — (como las lecturas) |

- Capítulo por `requirePublicChapter` (aprobado y sin retirar, RN-06).
- Repositorio: solo `UPDATE chapter_reads SET last_panel = GREATEST(COALESCE(last_panel, 0), $3) WHERE user_id = $1 AND chapter_id = $2`; nunca `INSERT`. Sin fila (nunca lo leyó), 204 sin escribir nada (D6): el endpoint no marca nada como leído.
- Limitador: 60 / min por usuario, después de `validate` (D7, RN-13).
- `GET /api/author/dashboard`: cada capítulo de `works[].chapters` gana `abandonment: AbandonmentDto`:

```ts
interface AbandonmentDto {
  panels: number;            // viñetas del capítulo
  readersWithData: number;   // lectores con last_panel, sin el admin ni el autor dueño
  reachedEnd: number;        // last_panel = panels
  reachedEndPct: number;     // 0–100, entero redondeado; 0 si readersWithData = 0
  dropPanel: number | null;  // moda de last_panel entre quienes no llegan al final (empate: la menor); null si nadie abandona
  dropReaders: number;       // lectores que se quedaron en dropPanel (0 si dropPanel es null)
}
```

- El panel muestra lectores en número y en porcentaje («12 de 20 llegan al final · 60 %»); sin datos, «Sin datos de abandono».
- **Cliente (`reader.ts`):** el observador solo se activa con sesión iniciada (`GET /api/me`); un invitado no envía nada. Tampoco en la vista previa. Un `IntersectionObserver` sobre las viñetas tras `renderReading` guarda en el `store` la máxima vista; si `renderReading` se repite, se desconecta y se crea otro. Envía con `keepalive` al ocultarse la página (`visibilitychange` → `hidden` y `pagehide`) y al ver la última viñeta, solo si ha subido desde el último envío. Cualquier fallo (red, 401, 429, 5xx) se ignora en silencio: nunca muestra errores ni bloquea la lectura. `api.ts` gana la opción `keepalive`.
- **Riesgo aceptado:** un enlace `#v-n` lleva a la viñeta n y cuenta como alcanzada.
- **`demo:data`:** rellena `last_panel` solo donde es NULL, con un valor determinista (función del usuario y del capítulo), para que repetirlo no cambie nada.

### Open Graph (CU-06; idea 1) (D8, D9)

Sin API. `home.html`, `comic.html` y `reader.html` llevan en `<head>`:

```html
<meta property="og:site_name" content="Koma">
<meta property="og:locale" content="es_ES">
<meta property="og:type" content="website">
<meta property="og:title" content="{{ogTitle}}">
<meta property="og:description" content="{{ogDescription}}">
<meta property="og:url" content="{{ogUrl}}">
<meta property="og:image" content="{{ogImage}}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Koma, plataforma de cómics">
<meta name="twitter:card" content="summary_large_image">
```

| Página | `ogTitle` | `ogDescription` | `ogUrl` |
| --- | --- | --- | --- |
| `/` | `Koma` | Texto fijo de la portada | `APP_URL` + `/` |
| `/obra/:slug` | Título de la obra | Sinopsis con los saltos de línea convertidos en espacios, cortada a 200 puntos de código (regla común de textos) con «…» | `APP_URL` + `/obra/:slug` |
| `/leer/:slug/:numero` | `<obra> · Capítulo N` | `Lee el capítulo N de <obra> en Koma.` | `APP_URL` + `/leer/:slug/:numero` |

- `ogImage` = `APP_URL` + `/icons/koma-og.png`, PNG propio de 1200 × 630 (D8; si mide otra cosa, cambian `og:image:width` y `og:image:height`). URLs con `new URL(ruta, APP_URL)`, sin `?` ni `#`.
- Todo pasa por `fillTemplate` (escapado). Sin consultas nuevas: las páginas ya leen la obra y el capítulo para su comprobación.
- Test: un título y una sinopsis con `"`, `'`, `<`, `>` y `&` salen escapados en los atributos `og:*`.

### Enlace de Discord (idea 10) (D12, D13)

Sin API. `env.ts` valida `DISCORD_INVITE_URL` opcional: `https:` y host `discord.gg` o `discord.com` (D12); vacía = ausente; otro valor, la app no arranca.

- `layout.ts` no importa `env` (los tests unitarios no cargan `.env` y `env.ts` termina el proceso si falta una variable): la URL le llega como parámetro de `renderTemplate`, desde `page.ts` y `error-handler.ts`, que ya cargan `env`.
- Con URL, el pie de todas las páginas muestra `<a href="…" target="_blank" rel="noopener noreferrer">Únete a nuestro Discord<span class="visually-hidden"> (se abre en otra pestaña)</span></a>`, y el acceso rápido «Comunidad» de la portada enlaza a la invitación con los mismos atributos. Sin URL, el pie no muestra el enlace y «Comunidad» sigue en «Próximamente» (D13).
- La URL se escapa al inyectarse. Sin internet, el enlace no abre nada y la plataforma funciona igual.

### Decisiones aprobadas (10-nov)

| # | Decisión |
| --- | --- |
| D1 | «Comentarios · 7 días» con la nota «N moderados» en lugar de «Comentarios reportados» (los reportes están descartados) |
| D2 | «Usuarios activos · 30 días»: cuentas activas, no admin, con alguna lectura en los últimos 30 días |
| D3 | «Eventos recientes»: entradas de la auditoría de las últimas 24 h |
| D4 | Sección «Estadísticas» con las métricas que la maqueta no trae; obras más leídas: 5 |
| D5 | «Estadísticas», primera ancla de la navegación de secciones de `/admin` |
| D6 | Progreso sin fila en `chapter_reads`: 204 sin escribir nada |
| D7 | Limitador del progreso: 60 / min por usuario |
| D8 | Imagen OG: PNG propio en `/icons/koma-og.png` |
| D9 | Open Graph también en `/` |
| D10 | La vista de impresión solo saca la sección «Estadísticas» y las métricas |
| D11 | La vista de impresión es solo del admin |
| D12 | `DISCORD_INVITE_URL`: solo `https:` y host `discord.gg` o `discord.com` |
| D13 | Enlace de Discord en el pie y en «Comunidad» de la portada; sin URL, nada de eso cambia |


## Convenciones, tests y definición de terminado

### Convenciones

- Código, tablas, nombres de archivo y rutas de la API en inglés; textos de interfaz, URLs de páginas y mensajes de error en español.
- BD en snake\_case y JSON en camelCase; la conversión se hace en el repositorio.
- Acciones de auditoría con el formato `entidad.verbo` de la tabla de auditoría.
- Commits en español con prefijo y regla: `feat(reading): saldo global (RN-02)`.
- Ningún GET modifica datos. Todo dato de usuario se escapa al inyectarse en HTML (servidor) y se pinta con `textContent` (cliente).
- En búsquedas `ILIKE` se escapan `%` y `_`; el orden dinámico usa una lista blanca de columnas.
- Antes de redirigir al login, el cliente guarda el fragmento `#v-n` para volver a la viñeta.
- Las redirecciones internas son relativas (`Location: /ruta`); `APP_URL` solo se usa para URLs absolutas que salen de la app: retorno de Stripe y meta Open Graph (`og:url`, `og:image`).

### Tests

- `npm test` compila y ejecuta `node --test` sobre el JS de `dist/`.
- Ubicación: `server/src/tests/unit/` (funciones puras) y `server/src/tests/api/`, archivos `<tema>.test.ts`; el nombre de cada test empieza por su RN (`'RN-02: …'`) o, si no tiene, por `'Seguridad: …'`, para filtrar con `--test-name-pattern`.
- Funciones puras: saldo y recarga (RN-02), contador de anuncios (RN-03), token de anuncio (RN-01), permisos, vencimiento premium, generación de slug, validación de `next` y de claves de almacenamiento.
- `npm run test:api` (`node:test` + `fetch`): login, 403 sin permiso, límite de lectura y, en el bloque 4, webhook repetido.
  - BD propia: `koma_test`, en el mismo contenedor (la crea `docker/initdb/01-test-db.sql` al iniciar el volumen por primera vez; con un volumen ya existente, `docker compose down -v`). `.env.test` (versionado) solo sobrescribe `DATABASE_URL`; se carga después de `.env` (`--env-file=.env --env-file=.env.test`).
  - Antes de las pruebas, `scripts/reset-test-db.ts` ejecuta `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`, migraciones y seed. Se niega a actuar si el nombre de la BD no termina en `_test`.
  - Cada archivo usa `startTestServer()` de `tests/api/helpers.ts`: importa `app` de `app.ts` (sin `listen` ni migraciones), lo levanta con `listen(0)` en `before()` y cierra el servidor y el pool de la BD en `after()` (si no, las conexiones inactivas mantienen vivo el proceso unos 10 s). Datos únicos por ejecución (correos con `randomUUID()`).
- Cada regla RN con cálculo tiene sus ejemplos en el test antes de cerrar su bloque.

### Revisión del código generado

Antes de cada commit se revisa el diff con esta lista:

- [ ] Cada ruta nueva tiene el middleware de permisos que le corresponde.
- [ ] SQL parametrizado; nada concatenado.
- [ ] Datos de usuario escapados (servidor) o con `textContent` (cliente).
- [ ] Las acciones sensibles escriben en `audit_log` en la misma transacción.
- [ ] Sin dependencias, carpetas ni tablas fuera del plan.

### Definición de terminado (por bloque)

- [ ] `npm run typecheck` sin errores.
- [ ] Funciona en local y online.
- [ ] Tests de sus RN y pruebas de API en verde.
- [ ] Diff revisado con la lista anterior.
- [ ] Revisado en móvil (360 px) y escritorio, con teclado.
- [ ] Sin errores en la consola del navegador ni en los logs.
- [ ] Sus acciones sensibles aparecen en la auditoría.
- [ ] Variables nuevas añadidas a `.env.example` y al README.
- [ ] Entrada del bloque en `docs/bitacora.md`.

## Errores: códigos, páginas y depuración

Todo error tiene un código HTTP correcto, un `code` estable para el cliente y un `requestId` que lo une a los logs. Las rutas `/api/*` responden JSON; el resto responde una página HTML conservando el código (nunca un 200 con mensaje de error).

### Códigos de estado

| HTTP | `code` | Cuándo en esta app |
| --- | --- | --- |
| 200 / 201 / 204 | — | Lectura correcta / recurso creado / borrado o acción sin cuerpo |
| 301 | — | Ruta con `/` final; `/leer/:slug` sin número → capítulo 1 |
| 302 / 303 | — | Página privada sin sesión → login; tras enviar un formulario o volver de Stripe |
| 400 | `VALIDATION_ERROR` | zod rechaza los datos (incluye contraseña actual incorrecta y más de 60 imágenes); incluye `fields`. También cuerpo JSON mal formado o incompleto y firma del webhook de Stripe ausente o no válida (sin `fields`) |
| 401 | `UNAUTHENTICATED` | Sin sesión en la API. Páginas privadas: redirige a `/entrar?next=…`. Lector: muestra la invitación de RN-01 |
| 401 | `INVALID_CREDENTIALS` | Correo o contraseña incorrectos |
| 403 | `FORBIDDEN` | Sin permiso para la acción |
| 403 | `ACCOUNT_SUSPENDED` | Cuenta suspendida al iniciar sesión |
| 403 | `READING_LIMIT` | Saldo agotado; incluye `retryAt` |
| 403 | `AD_NOT_COMPLETED` | Token de anuncio ausente, de otra obra o con menos de `AD_MIN_SECONDS` |
| 403 | `CSRF` | `Origin` ausente o fuera de `ALLOWED_ORIGINS` |
| 404 | `NOT_FOUND` | Obra, capítulo o usuario inexistente |
| 409 | `EMAIL_TAKEN` | Correo ya registrado |
| 409 | `CONFLICT` | Acción ya realizada (p. ej. comentario ya eliminado) |
| 410 | `GONE` | Obra o capítulo retirado (RN-06) |
| 413 | `FILE_TOO_LARGE` | Imagen de más de 5 MB |
| 413 | `PAYLOAD_TOO_LARGE` | Cuerpo de la petición de más de 100 kB (4 kB en `/api/auth/*`) |
| 415 | `UNSUPPORTED_FILE` | Firma de archivo no permitida |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Charset o codificación (`Content-Encoding`) del cuerpo no admitidos |
| 429 | `RATE_LIMITED` | Límite de peticiones; cabecera `Retry-After` y `retryAt` |
| 500 | `INTERNAL_ERROR` | Error no previsto; mensaje genérico, detalle solo en logs |
| 503 | `SERVICE_UNAVAILABLE` | Base de datos o proveedor de pagos inaccesible |

### Páginas de error

- `client/public/errors/`: `403.html`, `404.html`, `410.html`, `500.html`, `503.html` (+ `offline.html` en fase 2 con la PWA).
- Cada una: mensaje claro, enlace a inicio y al catálogo (en el contenido o en la navegación común: cabecera y navegación móvil), y "Código de referencia: `{{requestId}}`", que Express inyecta.
- 401 no tiene página: redirige al login y vuelve a la página original tras entrar.
- Comparten layout y CSS con el resto del sitio.

### Depuración

- **`AppError`:** clase única `new AppError(404, 'NOT_FOUND', 'La obra no existe')`; los servicios lanzan solo esto. Lo demás se trata como 500.
- **Express 5:** propaga al `error-handler` los errores de funciones `async` sin envoltorios.
- **`requestId`:** `crypto.randomUUID()` por petición, en la cabecera `X-Request-Id`, en cada log, en la auditoría y en la respuesta de error.
- **Logger propio** (`server/src/utils/logger.ts`): una línea JSON por evento con nivel, hora, `requestId`, método, ruta, estado, ms y `userId`. La traza de pila solo va al log.
- **`GET /api/health`:** ejecuta `SELECT 1`; responde 200 o 503.
- **Fallos del proceso:** `unhandledRejection` y `uncaughtException` se registran y el proceso termina; el hosting lo reinicia.
- **Cliente:** `api.ts` muestra `message` y el `requestId`; en desarrollo registra en consola los errores globales (`error`, `unhandledrejection`).

## Trampas conocidas (versiones actuales)

La IA tiende a escribir patrones antiguos. Estas reglas se copian a CLAUDE.md:

- **Express 5:** comodines con nombre (`/*splat`, no `*`); `req.query` es de solo lectura (lo validado va a `res.locals`); los errores `async` se propagan solos.
- **zod 4:** usar la API de la v4 (`z.email()`, `error` en lugar de `message`, `z.flattenError()`); no copiar ejemplos de zod 3.
- **ESM:** sin `__dirname` ni `require`; usar `import.meta.dirname` e imports con extensión `.js`.
- **Stripe:** `apiVersion` fijada en el constructor; en versiones recientes `current_period_end` está en `subscription.items.data[0]`, no en la suscripción; el webhook necesita `express.raw()` antes de `express.json()`.
- **R2 con AWS SDK v3:** `region: 'auto'`, endpoint `https://<account>.r2.cloudflarestorage.com` y `requestChecksumCalculation: 'WHEN_REQUIRED'` + `responseChecksumValidation: 'WHEN_REQUIRED'`.
- **`trust proxy`:** número de saltos, nunca `true` (RN-13).
- **bcrypt:** límite de 72 bytes, no caracteres (RN-12).
- **Neon:** SSL obligatorio con `sslmode=verify-full` (con `require`, `pg` 8 avisa de que cambiará en la v9); migrar por la conexión directa, no la agrupada (`-pooler`).
- **Render:** el build debe instalar `devDependencies` (`npm ci --include=dev`) o falta `typescript`.

## Calendario hasta el 25 de noviembre

Las funciones se congelan el 20 de noviembre para dejar 6 días a pruebas, documentación y ensayo. Con 6 h diarias hay 21 días hasta la congelación. Dentro de cada bloque, lo recortable por la contingencia va al final.

| Bloque | Fechas | Contenido |
| --- | --- | --- |
| 1 · Base y despliegue | 30 oct – 3 nov | Monorepo, Docker (BD), Render + Neon, migraciones 001–003, `AppError`, logger, páginas de error, API del bloque 1, roles, auditoría, prueba mínima de Stripe, verificación de `trust proxy` |
| 2 · Catálogo y lector | 4 – 9 nov | Migraciones 004–005 y 007–008, seed, importación de `content/` (RN-18), R2 y URLs firmadas, catálogo con etiquetas, ficha, lector, RN-01 a RN-03, RN-08, anuncios (al final: intersticial) |
| Control | 12 nov | Si el bloque 2 no estaba cerrado el 11, se activa la contingencia |
| 3 · Comunidad y autor | 10 – 14 nov | Migración 006, comentarios por viñeta, compartir viñeta, perfil (CU-23), crear obra, subir capítulo (borrador → revisión), retirar, panel del autor (CU-31 recortado, RN-19) (al final: editar obra) |
| 4 · Admin y Stripe | 15 – 19 nov | Aprobación con `is_adult`, moderación, usuarios, parámetros, vista de auditoría, migración 009, suscripción con webhooks, portal, pago simulado mínimo (al final: Test Clocks) |
| 5 · Fase 2 seleccionada | 10 – 15 nov | 10: cierre del bloque 4, demo en contenedores y CU-39 con su vista de impresión. 11–12: punto de abandono. 13: Open Graph. Con los tres desplegados y auditados: 14, enlace de Discord |
| Pulido | 15 – 19 nov | Pasada de diseño (estudio del autor, `/admin` con estadísticas, conjunto), contenido real, demo en Docker con la red apagada, prueba completa de roles |
| 6 · Pruebas y demo | 20 – 25 nov | Congelación. Revisión móvil y accesibilidad, README, guion de la demo, ensayo en ambos entornos (local con la red apagada) |

Cada bloque se da por cerrado solo cuando funciona desplegado, no solo en local.

### Contingencia del 12 de noviembre

Se activa por niveles, en orden, hasta recuperar el retraso:

1. Sin Test Clocks: la demo muestra alta, portal y cancelación.
2. Sin edición de obra (CU-30 queda en retirar) y sin anuncio intersticial.
3. App sin contenedor, en el host y en el puerto 3000: `HOST=0.0.0.0 APP_URL=http://koma.local:3000 ALLOWED_ORIGINS=http://koma.local:3000 node --env-file=.env server/dist/server.js` (`npm start` no carga `.env`; las variables de la línea de comandos tienen prioridad sobre `.env`). La demo en la LAN pasa a `http://koma.local:3000`. Cortafuegos, solo la red local: `sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp`.

### Contingencia del 14 de noviembre

Si la noche del 14 lo empezado no está desplegado y auditado, se recorta en este orden: enlace de Discord, Open Graph. CU-39 y el punto de abandono no se dejan a medias: si el 13 no están cerrados, el bloque 5 se queda ahí.

## Decisiones

Aprobadas el 30 de octubre tras las dos auditorías (la demo en la LAN de confianza, el 1 de noviembre); pasan a `ideas_base.md` y a CLAUDE.md.

| Tema | Decisión |
| --- | --- |
| Método | Vibecoding con Claude Code; bitácora en `docs/bitacora.md` |
| Dedicación | 6 h o más al día, fines de semana incluidos |
| Alcance | Recorte B + demo local en la LAN de confianza + pago simulado mínimo; contingencia por niveles el 12-nov |
| CLAUDE.md | Corto (≤ 150 líneas) con enlaces a `docs/`; generado con `/init` y revisado |
| Trabajo local | BD en Docker y app en el host; app en contenedor solo como respaldo |
| Calidad del código generado | `typecheck` + revisión del diff + pruebas de API mínimas |
| Páginas | HTML estático + API; Express comprueba la ruta e inyecta `requestId` |
| Premium | Suscripción mensual; `syncSubscription` único; portal de Stripe para cancelar; Test Clocks solo si hay tiempo |
| Stripe | Prueba mínima en el bloque 1 |
| Migraciones online | Al arrancar; seed e importación a mano desde local |
| URLs | Slug fijo + número de capítulo; el reemplazo hereda número y URL |
| Lectura | Saldo global por usuario; caps. 1–2 sin consumo; tabla `chapter_reads` desde el MVP |
| Imágenes | Todas firmadas, TTL 2 h; fallo de carga → mensaje y "Recargar" |
| Subida de capítulos | Estado `draft` → "Enviar a revisión" → `pending`; rechazo libera el número |
| Autoría | `author_credit` + `license_url`; "Autor" y "Publicado por" en la ficha |
| Contenido inicial | Importado desde `content/` por el desarrollador; sin obras con licencia NC |
| Moderación | El admin oculta y elimina comentarios (borrado lógico); un oculto no lo ve nadie |
| Rol autor | Lo activa el admin; un admin no es autor |
| Admin | Lee sin límites ni anuncios; puede retirar cualquier obra |
| Edición de obra | Sin reaprobación; queda en auditoría |
| Referidos | Fase 3, solo con enlace |
| +18 | Campo `is_adult` desde el MVP; obras +18 no aprobables ni importables en el MVP |
| Etiquetas | Combinación Y; el género es una etiqueta |
| Despliegue | Doble: local (sin internet; desarrollo en `localhost`, demo en la LAN de confianza en `http://koma.local`, sin HTTPS) y online Render + Neon + R2 |
| CSRF | `Origin` incluido en `ALLOWED_ORIGINS` (por defecto, el origen de `APP_URL`) |
| Entorno técnico | ESM, Node 24 LTS, Express 5, jsonwebtoken, `node:test` sobre JS compilado, un solo `package.json` |
| Cuentas demo | Contraseñas por variables de entorno, anotadas en `docs/credenciales.local.md` (ignorado por git) |
| Idioma | Código y API en inglés; interfaz, URLs de páginas y mensajes en español |
| Riesgos aceptados | `EMAIL_TAKEN` revela cuentas; releer un capítulo reemplazado consume saldo; sin caché de imágenes entre tramos de firma; los comentarios no pasan al capítulo de reemplazo; imágenes huérfanas de borradores, rechazos y obras cuya importación falla dentro de la transacción (RN-18); un invitado que borra cookies vuelve a contar; logout sin revocación del JWT (vale hasta caducar o hasta que cambie `token_version`); el login no tiene tope global por IP: cada correo válido distinto crea una entrada en memoria (de 0,4 a 0,5 kB con la clave y su contador) durante su ventana de 15 min (RN-13); los 5xx gastan intentos: con la BD caída, un 503 cuenta en el registro como uno de los 3 por hora y en el login como uno de los 5 fallos (el contador solo se pone a cero al acertar); un evento de Stripe de más de 100 kB recibe 413 y Stripe lo reintenta: se revisa en el bloque 4 si Workbench muestra entregas fallidas; en el punto de abandono (RN-21), un enlace `#v-n` cuenta como viñeta alcanzada |
| Estado en el navegador | Lo que es preferencia o comodidad (advertencias aceptadas, ocultar iconos) vive en `localStorage`; permisos, saldo y límites, siempre en el servidor |
| Estadísticas | Lecturas de invitados y de registrados por separado (`chapter_read_counts`) desde el MVP; las vistas, en fase 2 |
| Valores | Los de RN-10, RN-13 y RN-16 y `AD_MIN_SECONDS=5` |
| Fase 2 | Bloque 5 (10-nov): CU-39 con vista de impresión, punto de abandono, Open Graph con imagen propia y enlace de Discord. Siguen en fase 2, fuera de la entrega: avatar, PWA y webhook de Discord. Descartados: los reportes (idea 22) |

## Guía para CLAUDE.md

Instrucciones para `/init` y para revisar el resultado. Los documentos viven en `docs/`: `plan_mvp.md` (este), `ideas_base.md` y `casos_de_uso.md`.

**Objetivo:** un CLAUDE.md de 150 líneas como máximo, en español, con reglas y no con justificaciones. Lo que ya está en `docs/` se enlaza, no se copia.

**Secciones, en este orden:**

1. **Proyecto:** una frase del objetivo del MVP, fecha de congelación (20-nov) y bloque actual.
2. **Comandos:** la tabla de "Proyecto y comandos".
3. **Estructura:** árbol de carpetas del MVP (sin las de fases 2–3) y el flujo routes → schema → controller → service → repository.
4. **No haremos:** la columna "No haremos" completa, más "no crear nada de fases 2 y 3".
5. **Convenciones:** las de este plan, incluidos idiomas, commits con RN y escape de datos.
6. **Trampas conocidas:** la sección completa.
7. **Seguridad obligatoria:** permisos desde la BD en cada petición, SQL parametrizado, auditoría en la misma transacción, CSRF por `Origin`, sin datos sensibles en la auditoría.
8. **Cuándo leer `docs/`:** antes de tocar una regla, leer su RN en `plan_mvp.md`; antes de una tabla, el modelo de datos; antes de una ruta, el mapa de rutas y el contrato del bloque; antes de un CU, `casos_de_uso.md`. Si algo no está especificado, preguntar antes de implementarlo.
9. **Definición de terminado:** las listas de revisión del diff y de terminado.
