# Bloque 5 · Propuesta de documentación y contrato (borrador para aprobar)

10-nov. Nada de esto está aplicado: es el texto que se pegaría en `docs/` y en `CLAUDE.md` tras tu aprobación.
Las decisiones abiertas están en la sección 3 (D1–D13). Las respuestas a las preguntas técnicas, en la sección 4.

---

## 1. Cambios de documentación (texto exacto)

### 1.1 `CLAUDE.md` (149 líneas: solo sustituciones, ninguna línea nueva)

**Línea 7** — sustituir por:
> - Bloque actual: **5 · Fase 2 seleccionada (10 – 15 nov)**: CU-39 con exportación, punto de abandono, Open Graph y enlace de Discord. Actualizar esta línea al cambiar de bloque (calendario en `docs/plan_mvp.md`).

**Línea 75** — sustituir por:
> - **Nada de las fases 2 y 3**, salvo lo aprobado para el bloque 5 (lista cerrada en `docs/plan_mvp.md`, "Fase 2 · bloque 5"): ni carpetas, ni tablas, ni rutas, ni dependencias.

**Línea 90** — sustituir por:
> - Las redirecciones internas son relativas (`Location: /ruta`); `APP_URL` solo se usa para URLs absolutas que salen de la app: retorno de Stripe y meta Open Graph (`og:url`, `og:image`).

### 1.2 `docs/plan_mvp.md`

**a) "Priorización por fases"**, nueva subsección entre "Fase 1" y "Fase 2":

> ### Fase 2 · bloque 5 (aprobada el 10-nov)
>
> Tras cerrar el MVP, entra una selección cerrada de la fase 2. El resto de la fase 2 y toda la fase 3 siguen fuera.
>
> | CU / idea | Funcionalidad | Recorte |
> | --- | --- | --- |
> | 39 | Estadísticas globales del admin (RN-20) y su exportación | Solo lectura; sin gráficos; exportación = vista de impresión (`@media print`) para guardar como PDF, sin archivos generados en el servidor |
> | 31 (resto) | Punto de abandono en el panel del autor (RN-21) | Solo lectores registrados; sin puntos recibidos |
> | Idea 1 (CU-06) | Open Graph en `/obra/:slug` y `/leer/:slug/:numero` (y `/` si se aprueba D9) | Imagen propia de Koma (`/icons`), nunca la portada ni una viñeta |
> | Idea 10 | Enlace «Únete a nuestro Discord» | Sin webhook ni lógica de servidor; sin `DISCORD_INVITE_URL`, no se muestra |

**b) Tabla "Fase 2"**: quitar de sus filas lo que pasa al bloque 5:
- fila `31 (resto), 39`: queda `| 31 (resto) | Puntos recibidos del autor |`
- fila «Punto de abandono: endpoint de progreso…»: se borra.
- fila `Ideas 1, 6, 10, 22`: queda `| Ideas 6, 10, 22 | PWA instalable, webhook de Discord, reportes |`

**c) "Regla para la IA"** — sustituir por:
> **Regla para la IA:** no se crean carpetas, tablas, rutas ni dependencias de las fases 2 y 3, salvo las de "Fase 2 · bloque 5".

**d) "Reglas de negocio" → "Lectura"**, añadir al final:
> - **RN-20 Estadísticas globales:** solo el admin. Lecturas = `guest_reads` + `user_reads` de `chapter_read_counts`, con las ventanas de RN-19 (total, 7 y 30 días, hoy incluido, día de `Europe/Madrid`) y sin obras ni capítulos retirados. Premium activo = `premium_until` futuro, como RN-04. Solo agregados: ningún correo ni nombre de usuario. La exportación es la misma pantalla en vista de impresión: mismos números.
> - **RN-21 Punto de abandono:** por lector registrado y capítulo, la viñeta máxima alcanzada (`chapter_reads.last_panel`). Solo se actualiza una fila que ya existe (la crea la lectura, RN-02) y el valor solo sube; se valida contra el número de viñetas del capítulo. No cuentan el admin ni el autor dueño. «Llega al final» = `last_panel` igual al número de viñetas; «viñeta donde más se abandona» = la moda de `last_panel` entre quienes no llegan al final (empate: la menor). Las filas con `last_panel` NULL no entran en el cálculo.

**e) RN-13** — añadir tras «comentarios 5 / min por usuario;»:
> progreso de lectura 60 / min por usuario (D7);

**f) "Variables de entorno (`.env.example`)"**, tras `APP_URL`/`ALLOWED_ORIGINS`:
```
APP_URL=http://localhost:3000 # URLs absolutas que salen de la app (retorno de Stripe y Open Graph)
DISCORD_INVITE_URL=           # opcional: invitación de Discord (https://discord.gg/…); vacía = sin enlace
```

**g) "Convenciones"** (línea 1165) — el mismo texto que CLAUDE.md línea 90.

**h) "Mapa de rutas HTML"**, añadir debajo de la tabla:
> Open Graph (bloque 5): `/obra/:slug` y `/leer/:slug/:numero` (y `/`, D9) llevan meta `og:*` y `twitter:card`, rellenadas por el servidor y escapadas. Las páginas de error no llevan.

**i) Calendario** — sustituir las dos últimas filas por:
> | 5 · Fase 2 seleccionada | 10 – 15 nov | 10: cierre del bloque 4 y demo en contenedores. 11: CU-39. 12: punto de abandono. 13: Open Graph. Con los tres desplegados y auditados: 14, enlace de Discord y exportación (vista de impresión) |
> | Pulido | 15 – 19 nov | Pasada de diseño (estudio del autor, `/admin` con estadísticas, conjunto), contenido real, demo en Docker con la red apagada, prueba completa de roles |
> | 6 · Pruebas y demo | 20 – 25 nov | Congelación. Revisión móvil y accesibilidad, README, guion de la demo, ensayo en ambos entornos (local con la red apagada) |

**j) Contingencia** — nueva subsección tras "Contingencia del 12 de noviembre":
> ### Contingencia del 14 de noviembre
>
> Si la noche del 14 lo empezado no está desplegado y auditado, se recorta en este orden: exportación (F), enlace de Discord (E), Open Graph (D). CU-39 y el punto de abandono no se empiezan a medias: si el 13 no están cerrados, se deja el bloque 5 ahí.

**k) Decisiones** — sustituir la fila «Fase 2» por:
> | Fase 2 | Bloque 5 (10-nov): CU-39 con exportación en vista de impresión, punto de abandono, Open Graph con imagen propia y enlace de Discord. Descartados: avatar, PWA, webhook de Discord, reportes y la fase 3 |

**l)** El contrato de la sección 2 de este documento va como "## Contrato de la API del bloque 5", tras el del bloque 4.

### 1.3 `docs/ideas_base.md`

Ya actualizado por el desarrollador el 10-nov: no se propone texto. Contraste en la sección 5.

### 1.4 `docs/casos_de_uso.md`

- CU-06: `**Fase:** MVP (Open Graph en el bloque 5)`
- CU-31: `**Fase:** MVP (punto de abandono en el bloque 5; sin puntos recibidos)`; excepción nueva: `- Ningún lector registrado ha enviado progreso: se muestra «Sin datos de abandono».`
- CU-39:
  > **Actor:** Admin · **Fase:** bloque 5
  > **Objetivo:** Consultar y exportar métricas agregadas de toda la plataforma: usuarios, premium, lecturas, obras más leídas, comentarios y actividad (RN-20).
  > **Excepciones:**
  > - La plataforma aún no tiene lecturas: se muestran ceros.

### 1.5 `docs/modelo_datos.md`

- Línea 233: `last_panel INTEGER, -- RN-21: viñeta máxima alcanzada (bloque 5); NULL = sin progreso`
- Tras «Estadísticas»: 
  > **Punto de abandono (RN-21):** el progreso solo hace `UPDATE` de una fila existente, nunca `INSERT`:
  > ```sql
  > UPDATE chapter_reads SET last_panel = GREATEST(COALESCE(last_panel, 0), $3)
  > WHERE user_id = $1 AND chapter_id = $2;
  > ```
  > Sin migración ni índice nuevo: el panel del autor agrupa por `chapter_id` (`chapter_reads_chapter_idx`).
- Línea 276: `… las demás vistas de estadísticas son de fase 2.` → `… y las estadísticas globales (bloque 5, RN-20) también.`
- "Consultas clave": las de RN-20 (las escribe el constructor con el contrato aprobado).
- Seeds: `demo:data` rellena `last_panel` en las lecturas que crea.

---

## 2. Contrato de la API del bloque 5 (borrador)

Fase 2 seleccionada (CU-39, CU-31 resto, CU-06 Open Graph e idea 10; RN-20 y RN-21). Sin migraciones, sin dependencias, sin códigos de error nuevos y sin generación de archivos en el servidor. Variable nueva: `DISCORD_INVITE_URL` (opcional). (Dn) remite a la sección 3.

**Comunes a todo el bloque:**
- Solo lectura salvo el progreso (RN-21). Ningún GET modifica datos.
- Lecturas: la definición de RN-19, ventanas con el día de `Europe/Madrid` y sin retirados. `ReadsDto` es el del bloque 3.
- Sin datos personales en las estadísticas ni en la exportación.

### Estadísticas globales (CU-39; RN-20)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `GET /api/admin/stats` | `requireAdmin` (router del admin) | — | 200 `{ stats: AdminStatsDto }` | 401, 403 | — |

```ts
interface AdminStatsDto {
  today: string; // 'YYYY-MM-DD' en Europe/Madrid
  users: {
    total: number;          // sin suspendidos
    readers: number;        // role user, sin is_author
    authors: number;        // is_author
    admins: number;
    suspended: number;
    premium: number;        // premium_until > now(), sin admins
    activeLast30: number;   // D2: «Usuarios activos» de la maqueta
  };
  reads: ReadsDto & { guests: ReadsDto; users: ReadsDto }; // reads = guests + users
  catalog: { comics: number; chapters: number };           // approved y sin retirar
  topComics: { slug: string; title: string; reads: ReadsDto }[]; // D4: 5, por last30 y después total
  comments: { last7: number; moderatedLast7: number };     // D1: visibles creados en 7 días · ocultados o eliminados por el admin en 7 días
  auditLast24h: number;                                    // «Eventos recientes» de la maqueta
}
```

- «Revisión pendiente» sigue saliendo de `GET /api/admin/review` (`counts`): no se repite.
- `/admin` gana la sección «Estadísticas» (ancla `#estadisticas`) y la fila de métricas de la maqueta pasa a cuatro: Revisión pendiente, (D1), Usuarios activos, Eventos recientes. La pasada de diseño la hace después.

### Exportación (CU-39; RN-20)

Sin API ni archivos generados en el servidor (decidido el 10-nov).

- Botón «Imprimir o guardar como PDF» en la sección «Estadísticas» de `/admin`, que llama a `window.print()`.
- `@media print` en el CSS de `/admin`: se imprimen el título de la sección, la fecha (`today`) y las tablas de estadísticas; se ocultan la cabecera, la navegación, el pie, el aviso flotante y el resto de secciones. Texto oscuro sobre blanco (los colores de impresión, como tokens en `variables.css`).
- Sin auditoría: es una acción del navegador y no llega ninguna petición al servidor.

### Punto de abandono (CU-31 resto; RN-21)

| Método y ruta | Permiso | Entrada | Éxito | Errores | Auditoría |
| --- | --- | --- | --- | --- | --- |
| `POST /api/comics/:slug/chapters/:number/progress` | `requireAuth`; limitador de progreso (D7) | `{ panel: number }` (entero ≥ 1) | 204 | 400 (`panel` mayor que el número de viñetas), 401, 404, 410, 429 | — (como las lecturas) |

- Capítulo por `requirePublicChapter` (aprobado y sin retirar). Validación de `panel` contra el número de viñetas del capítulo (400 con `fields.panel`).
- Repositorio: solo el `UPDATE … GREATEST` de `modelo_datos.md`. Si no hay fila (nunca lo leyó), 204 igualmente y no se escribe nada (D6): el endpoint no marca nada como leído.
- `GET /api/author/dashboard`: cada capítulo de `works[].chapters` gana:

```ts
interface AbandonmentDto {
  panels: number;          // viñetas del capítulo
  readersWithData: number; // lectores con last_panel, sin admin ni dueño
  reachedEnd: number;      // last_panel = panels
  reachedEndPct: number;   // 0–100, entero redondeado; 0 si readersWithData = 0
  dropPanel: number | null;   // viñeta donde más se abandona; null si nadie abandona
  dropReaders: number;        // lectores que se quedaron en dropPanel
}
```
- Cliente (`reader.ts`): un `IntersectionObserver` sobre las viñetas tras `renderReading` (no en vista previa); guarda en el `store` la máxima vista. Envía con `keepalive` al ocultarse la página (`visibilitychange` → `hidden` y `pagehide`) y al ver la última viñeta, solo si ha subido desde el último envío. Nunca muestra errores ni bloquea: un fallo se ignora. `api.ts` gana la opción `keepalive`.

### Open Graph (CU-06; idea 1) (D8, D9)

Sin API. `comic.html`, `reader.html` y `home.html` llevan en `<head>`:

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
| `/` | `Koma` | Texto fijo del hero | `APP_URL` + `/` |
| `/obra/:slug` | Título de la obra | Sinopsis, cortada a 200 caracteres con «…» | `APP_URL` + `/obra/:slug` |
| `/leer/:slug/:numero` | `<obra> · Capítulo N` | `Lee el capítulo N de <obra> en Koma.` | `APP_URL` + `/leer/:slug/:numero` |

- `ogImage` = `APP_URL` + `/icons/koma-og.png` (D8). URLs construidas con `new URL(ruta, APP_URL)`, sin `?` ni `#`. Todo pasa por `fillTemplate` (escapado).
- Sin consultas nuevas: las dos páginas ya leen la obra y el capítulo para su comprobación.

### Enlace de Discord (idea 10) (D12, D13)

Sin API. `env.ts` valida `DISCORD_INVITE_URL` opcional: `https:` y host `discord.gg` o `discord.com` (D12); vacía = ausente. `layout.ts` la lee y, si existe, pinta:

```html
<a class="site-footer__link" href="…" target="_blank" rel="noopener noreferrer">Únete a nuestro Discord<span class="visually-hidden"> (se abre en otra pestaña)</span></a>
```

---

## 3. Decisiones abiertas

| # | Tema | Propuesta |
| --- | --- | --- |
| **D1** | Maqueta: «Comentarios reportados · 14 · 6 prioritarios». Los reportes están descartados. | Sustituir por **«Comentarios · 7 días»**, con la nota «N moderados» (ocultados o eliminados por el admin en 7 días, de `audit_log`). Alternativa: quitar la tarjeta y dejar tres. |
| **D2** | Maqueta: «Usuarios activos · 1.284 · Dato ficticio», sin definición. | **Usuarios con alguna lectura en los últimos 30 días** (`chapter_reads.last_read_at`), sin admins. Alternativa: cuentas con `status = 'active'` (casi igual al total). |
| **D3** | Maqueta: «Eventos recientes · 62 · En las últimas 24 h». No estaba en mi lista. | Añadido: entradas de `audit_log` de las últimas 24 h. |
| **D4** | Métricas de mi lista que la maqueta no trae (usuarios por rol, premium, lecturas por ventana, invitados/registrados, obras más leídas, catálogo). | Una sección nueva «Estadísticas» en `/admin`, entre las métricas y la cola. Top 5 por lecturas de 30 días. |
| D5 | Dónde va «Estadísticas» en la navegación de secciones | Primera ancla: «Estadísticas · Aprobaciones · Comentarios · Usuarios · Parámetros · Auditoría». |
| D6 | Progreso sin fila en `chapter_reads` | 204 sin escribir nada (no revela si leyó; el observador es pasivo). Alternativa: 409. |
| D7 | Limitador del progreso | 60 / min por usuario, después de `validate`, como los demás (RN-13). |
| D8 | Imagen OG | Tu PNG en `client/public/icons/koma-og.png`, 1200 × 630 (si tiene otras medidas, se cambian `og:image:width/height`). Te pido la ruta al llegar a D. |
| D9 | `/` con OG | `ideas_base.md` dice solo `/obra` y `/leer`. Propongo añadir `/` con texto fijo (es lo que más se comparte); si no, se queda fuera y la tabla de OG pierde su fila. |
| D10 | Exportación: alcance de la impresión | Solo la sección «Estadísticas» (con las cuatro métricas de arriba). Alternativa: todo `/admin`, que imprimiría también la cola, los usuarios con correos y la auditoría (datos personales en papel). |
| D11 | ¿Vista de impresión también en el panel del autor? | **No** de momento: `ideas_base.md` solo cita la exportación del admin. Sería añadir el mismo botón y un `@media print` en `/autor` (poco esfuerzo); dímelo si lo quieres. |
| D12 | Validación de `DISCORD_INVITE_URL` | Solo `https:` y host `discord.gg` o `discord.com`; otro valor = la app no arranca (como el resto de `env.ts`). |
| D13 | Dónde va el enlace de Discord | **En el pie, en todas las páginas** (la maqueta tiene enlaces en el pie: «Ayuda · Premium»), y en la portada el acceso rápido «Comunidad · Próximamente» pasa a enlazar al Discord cuando hay URL. La maqueta no trae Discord. `rel="noopener noreferrer"` (pediste `noopener`; `noreferrer` además evita mandar la URL de origen). |

---

## 4. Respuestas a las preguntas técnicas

**`reader.ts`**
- `renderReading` pinta todas las viñetas de una vez, con `width` y `height` reservados (`<img loading="lazy">` desde la 3.ª): el `IntersectionObserver` ve posiciones estables y no salta con la carga.
- El enlace `#v-n` se resuelve a mano con `scrollIntoView()` tras pintar. **Consecuencia:** un enlace compartido a la viñeta 40 marca la 40 como alcanzada. Propuesta: riesgo aceptado (anotarlo en "Riesgos aceptados").
- «Recargar» (`refreshPanels`) cambia solo los `src`: el observador sigue. Si `renderReading` se vuelve a llamar, se desconecta y se crea otro.
- Pantalla completa: la tira es un contenedor con scroll dentro del elemento a pantalla completa; el observador con `root: null` sigue funcionando.
- `api.ts` no tiene `keepalive`: hay que añadir la opción (una línea en `RequestOptions` y en `fetch`). Con `fetch` el navegador manda `Origin` en el POST, así que el CSRF se cumple; `sendBeacon` no hace falta.

**`chapter_reads`**
- `readAsUser` hace `INSERT … ON CONFLICT DO NOTHING` en la misma transacción que el saldo para **toda** lectura de un registrado: caps. 1–2, premium, admin y autor dueño. No en la vista previa (D10 del bloque 3) ni para invitados.
- Así, cuando el lector envía progreso, la fila ya existe: el `UPDATE` sin `INSERT` funciona.
- El admin y el dueño tienen filas: se excluyen en la consulta (`users.role = 'admin'` y `comics.author_id = user_id`), igual que hace hoy `user_reads`.
- Un capítulo de reemplazo tiene otro `chapter_id`: su abandono empieza de cero (como sus comentarios).

**`page.ts` / `layout.ts`**
- `SITE_HEAD` es fijo; lo propio de cada página va con marcadores `{{…}}` que `fillTemplate` escapa (incluidas `"` y `'`, válido en atributos). Las meta OG van así, sin tocar `applyLayout`.
- `/obra/:slug` ya llama a `requireVisibleComic` (la fila trae `synopsis`) y `/leer` a `getReaderPage` (título de obra y capítulo): ninguna consulta nueva.
- El pie lo genera `siteFooter()` en `layout.ts`: el enlace de Discord se añade ahí (lee `env`). El pie actual no coincide con la maqueta («Proyecto final de XarxaTec Activa» en lugar de «Ayuda · Premium»); no lo toco salvo el enlace.

**Coste en Neon**
- `chapter_read_counts` crece como capítulos × días: cientos de filas en la demo. Las sumas globales recorren la tabla entera (no hay índice por `day`): despreciable con este volumen.
- `audit_log` de 24 h usa `audit_log_created_idx`. Comentarios de 7 días: sin índice por `created_at`, recorrido completo de una tabla pequeña.
- Abandono: agrupa `chapter_reads` por `chapter_id` con `chapter_reads_chapter_idx`.
- Ningún índice nuevo. El único coste real es el arranque en frío de Neon (la primera consulta tras la inactividad), que ya existe.

---

## 5. Otras observaciones

**Contraste con `ideas_base.md` (versión del 10-nov):**
- Coincide en: el orden 1–5, la exportación como vista de impresión, la imagen OG propia en PNG desde `/icons` con `APP_URL`, el abandono (viñeta máxima, solo registrados, solo `UPDATE`, solo sube, sin admin ni dueño, observador pasivo), el enlace de Discord sin webhook y los descartes.
- **Open Graph:** `ideas_base` dice `/obra` y `/leer`; yo añadía `/` → D9.
- **Métricas del admin:** `ideas_base` cita «usuarios por rol y estado, premium activos, lecturas…, obras más leídas y comentarios recientes» y «parten de las métricas de la maqueta», pero no nombra las tres de la maqueta que faltaban (D1 comentarios reportados → sustituto, D2 usuarios activos, D3 eventos recientes). Si apruebas D1–D3, convendría añadirlas a la idea 7.
- **«Comentarios recientes»:** en `ideas_base` puede leerse como una lista (como la del autor). Mi contrato da un número (`comments.last7`). ¿Número, o lista de los 10 últimos? La lista ya existe en «Comentarios» de `/admin`; propongo el número.
- **Idea 24 (actividad simulada):** choca con tres textos vigentes, que habrá que cambiar cuando se defina después del bloque 5: `plan_mvp.md` («Los datos de `npm run demo:data` … nunca van a producción», en "Entornos de despliegue"), `CLAUDE.md` (tabla de comandos: `demo:data` «aborta si no lo es») y `modelo_datos.md`/seeds. Además, cuentas que actúan como usuarios reales en producción dejarían entradas en la auditoría y lecturas en las estadísticas: habrá que decidir si se marcan. No lo toco en el bloque 5.
- «El MVP se cerró el 9 de noviembre»: los commits del cierre del bloque 4 son de hoy (10-nov). Detalle menor.

**Otras:**

- La importación escribe un `content.import` con `entity_type` `tags` cuando cambian las etiquetas; RN-18 solo habla de una entrada por obra. ¿Lo documentamos en RN-18 o lo quitamos? Propuesta: documentarlo.
- `README.md` → "Variables": añadir `DISCORD_INVITE_URL` (opcional) con su valor local (vacía) y online.
