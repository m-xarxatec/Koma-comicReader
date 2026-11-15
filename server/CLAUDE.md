# server/CLAUDE.md · Koma — reglas del servidor

Se suman a las del `CLAUDE.md` de la raíz, que siguen valiendo aquí.

## Recorrido de una petición

Archivos `<módulo>.<capa>.ts`: `comics.routes.ts`, `comics.schema.ts`… `comics.repository.ts`.
1. `routes`: método, ruta y middlewares (`auth`, `requireAuth`/`requireAdmin`/`requireAuthor`, `rateLimit`, `upload`).
2. `schema`: zod valida `body`, `params` y `query` → 400; lo validado va a `res.locals`.
3. `controller`: traduce HTTP ↔ servicio; sin lógica.
4. `service`: reglas RN y propiedad; lanza solo `AppError`. Si hay auditoría, `withTransaction(async (client) => …)` (`BEGIN`/`COMMIT`; `ROLLBACK` y relanza si falla; `release()` en `finally`) y el mismo `client` para el cambio y para `audit`.
5. `repository`: único lugar con SQL (parametrizado); recibe como primer parámetro un `Queryable` (`Pool | PoolClient`: `pool` o el `client` de la transacción); convierte snake_case ↔ camelCase.
6. `error-handler`: decide código y formato de cualquier error.

- Local y online son el mismo código; solo cambian `STORAGE_DRIVER` y `PAYMENTS_DRIVER`. `env.ts` rechaza `PAYMENTS_DRIVER=fake` con `NODE_ENV=production`.
- Toda novedad de premium pasa por `syncSubscription(subscriptionId)` (RN-04); el driver `fake` llama al mismo servicio.

## Convenciones

- BD en snake_case, JSON en camelCase. Claves `INTEGER GENERATED ALWAYS AS IDENTITY` (`audit_log`: `BIGINT`). Borrado siempre lógico (`deleted_at`, `hidden_at`), salvo viñetas de un capítulo en `draft`.
- Acciones de auditoría `entidad.verbo`, solo con los nombres exactos de la tabla de auditoría del plan.
- Errores: los servicios lanzan solo `new AppError(404, 'NOT_FOUND', 'La obra no existe')`, con los `code` de la tabla del plan. `/api/*` responde JSON `{ code, message, fields?, retryAt?, requestId }`; las páginas responden HTML con el mismo código, nunca 200 con un error.
- `requestId` (`crypto.randomUUID()`) va en `X-Request-Id`, en cada log, en la auditoría y en la respuesta de error; los scripts generan el suyo.
- `ILIKE` escapa `%` y `_`; el orden dinámico usa lista blanca de columnas.
- Las redirecciones internas son relativas (`Location: /ruta`); `APP_URL` solo se usa para URLs absolutas que salen de la app: retorno de Stripe y meta Open Graph (`og:url`, `og:image`).

## Trampas conocidas

- **Express 5:** comodines con nombre (`/*splat`, no `*`); `req.query` es de solo lectura (lo validado va a `res.locals`); los errores `async` se propagan solos.
- **zod 4:** API de la v4 (`z.email()`, `error` en lugar de `message`, `z.flattenError()`); no copiar ejemplos de zod 3.
- **Stripe:** `apiVersion` fijada en el constructor; `current_period_end` está en `subscription.items.data[0]`, no en la suscripción; el webhook usa `express.raw()` registrado antes de `express.json()`.
- **R2 con AWS SDK v3:** `region: 'auto'`, endpoint `https://<account>.r2.cloudflarestorage.com`, `requestChecksumCalculation: 'WHEN_REQUIRED'` y `responseChecksumValidation: 'WHEN_REQUIRED'`.
- **`trust proxy`:** número de saltos (`TRUST_PROXY`), nunca `true` (RN-13).
- **bcrypt:** límite de 72 bytes (`Buffer.byteLength`), no caracteres (RN-12).
- **Neon:** SSL obligatorio con `sslmode=verify-full` (con `require`, `pg` 8 avisa de que cambiará en la v9); migrar por la conexión directa, no la agrupada (`-pooler`).
- **Render:** build con `npm ci --include=dev` o falta `typescript`; disco efímero (imágenes en R2); sin *pre-deploy*: las migraciones corren al arrancar.
