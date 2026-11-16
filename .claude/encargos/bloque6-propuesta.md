# Bloque 6 · Comunidad y Tutoriales · Propuesta (aprobada)

16-nov. **Aprobada por el desarrollador el 16-nov:** todas las recomendaciones (D1–D16) y la excepción de tests de la sección 7. Se pasa a `docs/` y a `CLAUDE.md` (sección 6) y después se construye con `/constructor`.

---

## 0. Decidido el 16-nov (desarrollador)

- **Calendario (DL9):** entrega el 30-nov y congelación de funciones el 25-nov.
- **Bloque nuevo antes de la pasada de diseño:** Comunidad (tablero de ilustraciones de usuarios registrados, con etiquetas propias y el enlace de Discord dentro de la página) y Tutoriales.
- **Tutoriales:** vídeos de YouTube incrustados en la página. Los enlaces los da el desarrollador cuando `/constructor` los pida.
- **Excepción a «No haremos: alojar vídeos»:** en la demo local, Koma sirve vídeos guardados en el portátil, solo como contingencia sin internet.

## 1. Alcance

| Pieza | Entra | Fuera |
| --- | --- | --- |
| Comunidad (CU-18, sin reto) | Tablero público de ilustraciones aprobadas en columnas tipo Pinterest; filtro por una etiqueta; publicar (registrado); «Mis ilustraciones» con su estado; retirar las propias; tarjeta «Únete a nuestro Discord» dentro de la página | Retos semanales (CU-37), «me gusta», comentarios en ilustraciones, perfiles públicos, seguir a usuarios, +18 |
| Admin | Sección «Ilustraciones» en `/admin`: aprobar, rechazar con motivo y retirar | Editar ilustraciones ajenas |
| Tutoriales | Página pública con una lista fija de vídeos de YouTube incrustados; respaldo local con archivos de vídeo | Gestionarlos desde `/admin`, subir vídeos desde la interfaz |
| Navegación | «Comunidad» y «Tutoriales» en la cabecera y en la navegación móvil; los accesos rápidos de la portada llevan a las páginas nuevas | — |

Queda revocado el desvío D5 del pulido para «Comunidad» y «Tutoriales»; «Ayuda» sigue fuera.

## 2. Modelo de datos: migración `010_illustrations`

```sql
CREATE TABLE illustrations (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id),
  title            TEXT NOT NULL,
  description      TEXT,
  image_key        TEXT NOT NULL UNIQUE CHECK (image_key ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  width            INTEGER NOT NULL CHECK (width > 0),
  height           INTEGER NOT NULL CHECK (height > 0),
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  published_at     TIMESTAMPTZ,                           -- se fija al aprobar
  deleted_at       TIMESTAMPTZ,                           -- retirada (dueño o admin)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT illustrations_rejection_reason CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL),
  CONSTRAINT illustrations_published CHECK (status <> 'approved' OR published_at IS NOT NULL)
);
CREATE INDEX illustrations_public_idx ON illustrations (published_at DESC)
  WHERE status = 'approved' AND deleted_at IS NULL;
CREATE INDEX illustrations_user_idx ON illustrations (user_id, created_at DESC);
CREATE TRIGGER illustrations_set_updated_at BEFORE UPDATE ON illustrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE illustration_tags (
  illustration_id INTEGER NOT NULL REFERENCES illustrations(id),
  tag             TEXT NOT NULL CHECK (tag ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),  -- slug normalizado (D3)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (illustration_id, tag)
);
CREATE INDEX illustration_tags_tag_idx ON illustration_tags (tag);
```

- Las etiquetas de la comunidad van aparte de `tags`, que son de las obras (géneros y temáticas): no se mezclan en el catálogo.
- Tutoriales: sin tabla (D11).

## 3. Reglas de negocio nuevas

- **RN-22 Ilustraciones:** imagen con las reglas de RN-10 (JPEG, PNG o WebP por firma, 5 MB, multer en disco, clave `UUID.ext`). Título de 1 a 100 caracteres, descripción de 0 a 500 (regla común de textos) y de 0 a 5 etiquetas (D3). Nace `pending` y solo `approved` es pública (D2); rechazar exige motivo. La retiran su dueño o el admin (borrado lógico); una retirada no vuelve. Como mucho 5 pendientes por usuario (D5). La publica una cuenta registrada activa que no sea admin (D4). La ilustración de un suspendido sigue visible (RN-15). El contenido +18 no se admite: el admin lo rechaza con motivo (RN-17).
- **RN-13:** las ilustraciones cuentan en el limitador de subidas (100 imágenes / h por usuario), el mismo de portadas y viñetas.

## 4. Contrato de la API

**Comunes:** textos con `utils/text.ts`; límites en `limits.ts`, duplicados en el cliente; imágenes siempre con URL firmada; auditoría en la misma transacción, con `before`/`after` solo de los campos cambiados; una acción ya hecha → 409 `CONFLICT`. Sin códigos de error nuevos.

### Comunidad

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/illustrations` | — | Query: `tag?`, `page` | 200 `{ illustrations: IllustrationDto[], tags: TagCountDto[], page, pageSize, total }`, de la más reciente a la más antigua | 400 | — |
| `POST /api/illustrations` | `requireAuth`, no admin; limitador de subidas | `multipart/form-data`: `image`, `title`, `description?`, `tags` (texto, separadas por comas) | 201 `{ illustration: OwnIllustrationDto }` | 400, 401, 403, 409 (5 pendientes), 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_FILE`, 429 | `illustration.create` |
| `GET /api/me/illustrations` | `requireAuth` | Query: `page` | 200 `{ illustrations: OwnIllustrationDto[], page, pageSize, total }` (sin las retiradas) | 401 | — |
| `POST /api/illustrations/:id/withdraw` | `requireAuth` + dueño, o admin | — | 204 | 401, 403, 404, 409 (ya retirada) | `illustration.withdraw` |

```ts
interface IllustrationDto {
  id: number;
  title: string;
  description: string | null;
  url: string;              // firmada
  width: number;            // px, para reservar el hueco en el tablero
  height: number;
  tags: string[];           // slugs; el cliente pinta «#slug»
  author: { displayName: string };
  publishedAt: string;      // ISO 8601
}
interface OwnIllustrationDto extends Omit<IllustrationDto, 'publishedAt'> {
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  publishedAt: string | null;
  createdAt: string;
}
interface TagCountDto { tag: string; count: number } // de las públicas; las 30 más usadas
```

- **Página:** 24 por página (`ILLUSTRATIONS_PAGE_SIZE`). `tag` filtra por una sola etiqueta.
- **Subida con campos de texto:** a diferencia de las viñetas, multer admite aquí los tres campos de texto (`fields` acotado). El permiso, el tope de pendientes y el limitador van antes de multer; el texto se valida con zod después, y el temporal se borra siempre (`finally`).
- **Etiquetas (D3):** se normalizan con la regla del slug de RN-09 (minúsculas, sin acentos, guiones); vacías y repetidas fuera; de 2 a 30 caracteres cada una.

### Admin (D9)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/admin/illustrations` | `requireAdmin` | Query: `status` (`pending` \| `approved`), `page` | 200 `{ illustrations: AdminIllustrationDto[], page, pageSize, total }` (pendientes: de la más antigua a la más reciente) | 400, 401, 403 | — |
| `POST /api/admin/illustrations/:id/approve` | `requireAdmin` | — | 204 | 401, 403, 404, 409 (no está `pending`, o retirada) | `illustration.approve` |
| `POST /api/admin/illustrations/:id/reject` | `requireAdmin` | `reason` (1–500) | 204 | 400, 401, 403, 404, 409 | `illustration.reject` |

`AdminIllustrationDto` = `OwnIllustrationDto` + `author: { id, displayName }`. Retirar desde el admin usa el `withdraw` común. No se toca `GET /api/admin/review` ni sus tests.

### Tutoriales

| Método y ruta | Permiso | Entrada | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/tutorials` | — | — | 200 `{ tutorials: TutorialDto[] }` | — |

```ts
interface TutorialDto {
  id: string;          // id de YouTube, 11 caracteres (^[A-Za-z0-9_-]{11}$)
  title: string;
  description: string;
  local: boolean;      // true si hay archivo local (D13): la página usa <video> en lugar de YouTube
}
```

- **Lista (D11):** constante versionada en `server/src/config/tutorials.ts`; un test valida cada id. `/constructor` pide al desarrollador el título y el enlace de cada vídeo al llegar a este paso.
- **Reproductor (D12):** `<iframe src="https://www.youtube-nocookie.com/embed/<id>" loading="lazy" title="…">`, creado con la API del DOM. La CSP gana `frame-src https://www.youtube-nocookie.com`. La página manda `Referrer-Policy: same-origin`, y YouTube rechaza los incrustados sin `Referer`, así que el `iframe` lleva su propio `referrerpolicy="strict-origin-when-cross-origin"` (hay que comprobarlo en la documentación de YouTube al construirlo).
- **Respaldo local (D13):** `TUTORIAL_VIDEOS_DIR`, opcional; `env.ts` la rechaza con `APP_URL` en `https` (solo local, como el driver `fake`). `GET /videos/:file` existe solo con la variable, valida `^[A-Za-z0-9_-]{11}\.mp4$` antes de tocar el disco y sirve con `res.sendFile` (admite `Range`: 200 o 206; si no, 404). Sin firma: son vídeos públicos de la plataforma, no contenido de usuarios.

### Páginas (mapa de rutas)

| Ruta | Página | Comprobación en servidor | Códigos |
| --- | --- | --- | --- |
| `/comunidad` | `community` | — (el formulario y «Mis ilustraciones», según la sesión, en el cliente) | 200 |
| `/tutoriales` | `tutorials` | — | 200 |
| `/videos/:file` | — (vídeo) | Solo con `TUTORIAL_VIDEOS_DIR`; nombre válido y archivo existente | 200, 206, 404 |

- `/comunidad`: el tablero en columnas CSS, con `width` y `height` en cada `<img>`; el detalle, en un `<dialog>` (D8). Sin sesión, «Entra para compartir» con `next=/comunidad`. La tarjeta de Discord sale solo con `DISCORD_INVITE_URL`.
- `/admin`: una sección «Ilustraciones» nueva (pendientes y publicadas), con el aviso flotante y el `<dialog>` que ya existen.

### Permisos (filas nuevas)

| Acción | Invitado | Registrado | Premium | Autor | Admin |
| --- | --- | --- | --- | --- | --- |
| Ver Comunidad y Tutoriales | ✓ | ✓ | ✓ | ✓ | ✓ |
| Publicar ilustración, retirar las propias | — | ✓ | ✓ | ✓ | — |
| Aprobar, rechazar y retirar ilustraciones | — | — | — | — | ✓ |

### Auditoría (fila nueva)

| Entidad | Acciones |
| --- | --- |
| Ilustración | `illustration.create`, `illustration.approve`, `illustration.reject`, `illustration.withdraw` |

Mismo formato que obras y capítulos: `status`, `publishedAt`, `rejectionReason` y `deletedAt`. `create` lleva en `after` el título y las etiquetas, nunca la clave de la imagen.

## 5. Decisiones (aprobadas el 16-nov)

| # | Tema | Decisión | Alternativa descartada |
| --- | --- | --- | --- |
| **D1** | Nombre del bloque | «6 · Comunidad y Tutoriales»; «Pruebas y demo» pasa a 7 | Llamarlo «5b» y no renumerar |
| **D2** | Moderación | Aprobación previa del admin (como las obras): una imagen es más arriesgada que un comentario | Publicación inmediata; el admin retira después |
| **D3** | Etiquetas propias | Libres, de 0 a 5, normalizadas a slug; se revisan con la ilustración al aprobarla | Una lista fija del seed para elegir |
| **D4** | Quién publica | Registrado activo, autores y premium incluidos; el admin no (aprueba) | También el admin |
| **D5** | Tope de pendientes | 5 por usuario | Sin tope (la cola puede llenarse) |
| **D6** | Campos | Título obligatorio, descripción opcional | Solo título |
| **D7** | «Mis ilustraciones» | Sección dentro de `/comunidad`, con sesión | En `/perfil` |
| **D8** | Detalle | `<dialog>` en la misma página, sin ruta ni Open Graph | Página `/comunidad/:id` |
| **D9** | Admin | Sección «Ilustraciones» propia en `/admin`, con su endpoint; la cola de obras no cambia (ni sus tests) | Meterlas en la cola de aprobación (cambia tests existentes) |
| **D10** | Navegación y portada | Cabecera y navegación móvil con «Comunidad» y «Tutoriales»; los accesos rápidos llevan a `/comunidad` y `/tutoriales`; Discord pasa a una tarjeta dentro de `/comunidad` y sigue en el pie. Con la excepción de tests de la sección 7 | Solo en la cabecera, sin tocar la portada |
| **D11** | Lista de tutoriales | Constante versionada en `config/tutorials.ts` | Tabla y seed |
| **D12** | Reproductor | `youtube-nocookie.com`, `loading="lazy"`, CSP `frame-src` solo para ese host | `youtube.com` |
| **D13** | Respaldo local | `TUTORIAL_VIDEOS_DIR` (variable nueva, solo local), archivos `<id>.mp4`; si existe, `<video>` en lugar de YouTube | Que el desarrollador cambie a mano entre uno y otro |
| **D14** | Datos de la demo | Ninguna ilustración por script: el desarrollador sube las suyas por la interfaz, en local y online (deja el rastro real de la auditoría) | Que `demo:data` cree algunas en local |
| **D15** | Estadísticas (RN-20) | Sin cambios | Añadir «ilustraciones publicadas» |
| **D16** | Calendario | El de la sección 8 | — |

## 6. Cambios de documentación

- **`CLAUDE.md`:** «Bloque actual»; «No haremos» (bloque 6 junto al 5 en la excepción de fases 2–3, y la excepción de los vídeos locales); «Estructura» (módulo `illustrations`, páginas `community` y `tutorials`, `config/tutorials.ts`, migraciones hasta `010_illustrations`), solo cuando existan, porque `claude-tree.test.ts` lo comprueba; la tabla de comandos no cambia.
- **`docs/plan_mvp.md`:**
  - «Fase 2 · bloque 5», con su gemela «Bloque 6»;
  - fase 3: la fila 18 se queda solo con el reto (37);
  - RN-22 y RN-13;
  - permisos, auditoría, mapa de rutas y variables de entorno (`TUTORIAL_VIDEOS_DIR`);
  - «Contrato de la API del bloque 6»;
  - «Pulido» (D5 revocado para estas dos páginas; los encargos E2 y E4 incluyen las páginas nuevas);
  - calendario, contingencia y «Decisiones» (fila «Fase 2», riesgos aceptados: los vídeos de YouTube necesitan internet y las etiquetas libres pasan por la aprobación);
  - la regla para la IA.
- **`docs/modelo_datos.md`:** `010_illustrations`.
- **`docs/casos_de_uso.md`:** CU-18 pasa al bloque 6, sin reto; CU-32 incluye las ilustraciones; CU-42 «Ver tutoriales».
- **`docs/ideas_base.md`:** la actualiza el desarrollador (idea 3 y una idea nueva de Tutoriales).
- **`.env.example` y README:** `TUTORIAL_VIDEOS_DIR`, al construirla.
- **`plan_limpieza.md`:** DL9 resuelta.

## 7. Tests existentes que cambian (excepción de `CLAUDE.md`, «Tests»; aprobada el 16-nov)

Hoy fijan que «Comunidad» de la portada lleva a Discord (o dice «Próximamente») y que «Tutoriales» dice «Próximamente»:

| Archivo | Test | Qué cambia |
| --- | --- | --- |
| `server/src/tests/unit/discord.test.ts:69` | Sin URL, «Comunidad» sigue en «Próximamente» | «Comunidad» pasa a ser un enlace a `/comunidad`: `quick-link--soon` y «Próximamente» de 1 a 0 |
| `server/src/tests/unit/discord.test.ts:81` | Con URL, el pie y «Comunidad» enlazan a la invitación | El acceso rápido ya no enlaza a Discord: solo el pie (la nota oculta, de 2 a 1) |
| `server/src/tests/api/discord.test.ts:14` | Con URL, la portada enlaza «Comunidad» y el pie | Enlaces a la invitación, de 2 a 1 (el pie); «Próximamente», de 1 a 0 |
| `server/src/tests/api/pages.test.ts:85` | Sin URL, «Comunidad» en «Próximamente» | «Próximamente», de 2 a 0 |

Al construir, cada aserción se entrega con su antes y su después, el desarrollador lista los archivos en `.claude/permiso-tests.txt` y queda en la bitácora. Lo que estos tests protegen (el pie sin enlace sin URL, el escape y `noopener noreferrer`) se mantiene.

## 8. Calendario (D16)

| Fechas | Qué |
| --- | --- |
| 16-nov | Esta propuesta, aprobación y documentación |
| 17 – 20 nov | Bloque 6: migración, API, admin, `/comunidad`, `/tutoriales`, tests, `frontend` y `auditor`, despliegue online |
| Desde el 17 | E1 (premium) con Codex, en paralelo: no toca las páginas nuevas. E3 (estudio), tras D2 del pulido. E2 (`/admin`) y E4 (conjunto), después del bloque 6, porque incluyen sus páginas |
| 21 – 24 nov | Actividad simulada (idea 24, antes de congelar) y el resto de encargos |
| 25-nov | Congelación de funciones |
| 26 – 30 nov | Bloque 7 · Pruebas y demo: revisión móvil y accesibilidad, README, guion y ensayo (local con la red apagada) |

**Contingencia del 20-nov:** si esa noche el bloque 6 no está desplegado y auditado, se recorta en este orden: el respaldo local de vídeos (en la demo se ponen con un reproductor fuera de Koma), el filtro por etiqueta y la lista de etiquetas. Publicar, aprobar y retirar no se recortan.

## 9. Riesgos

- **Tamaño:** como el bloque 3 (subidas, moderación y una página nueva), en 4 días.
- **Internet:** sin red, los vídeos de YouTube no cargan; el respaldo local lo cubre solo si los archivos están en el portátil.
- **Imágenes de usuarios:** la aprobación previa (D2) frena lo inapropiado; las imágenes rechazadas se quedan en el almacenamiento, como las de los borradores (riesgo aceptado de RN-10).
- **El diseño se mueve:** E2 y E4 se escriben después del bloque 6.
