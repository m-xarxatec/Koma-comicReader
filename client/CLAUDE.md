# client/CLAUDE.md · Koma — reglas del cliente

Se suman a las del `CLAUDE.md` de la raíz, que siguen valiendo aquí.

## Convenciones

- Peticiones solo por `services/api.ts` (`ApiResult<T>`, nunca lanza por errores HTTP); formularios con `bindForm(form, rules, onSubmit)`; un `store` mínimo por página; sesión desde `GET /api/me`; preferencias de interfaz (advertencias aceptadas, ocultar iconos) en `localStorage` con `try/catch`, nunca permisos ni límites.
- HTML semántico que se entiende sin JS: `<title>` `Koma` o `<página> · Koma`, un solo `<h1>`, `header`/`nav`/`main`/`footer`, enlace "Saltar al contenido", `lang="es"`, `loading="lazy"` salvo en las imágenes de la primera pantalla, `<link rel="icon" href="/icons/favicon.svg">`.
- CSS mobile-first (`min-width: 40rem` y `64rem`), BEM, un archivo por componente, todo valor visual en `variables.css` (el diseño lo sustituye sin tocar HTML, TS ni componentes; única excepción: el `<meta name="theme-color">` de `layout.ts`, que repite `--color-bg` y un test lo compara) y `z-index` en `layers.css`, solo tema oscuro (`color-scheme: dark`, sin tema claro: es una plataforma de lectura), fuentes del sistema, `:focus-visible` y áreas táctiles de 44 px.
- Antes de redirigir al login, el cliente guarda el fragmento `#v-n`.

## Trampas conocidas

- **Sin bundler:** nada de `node_modules` (zod incluido) llega al cliente; `tsc` no copia CSS ni HTML (viven ya en `client/public/`).
