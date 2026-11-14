---
name: actividad-simulada
description: Guía una pasada de la actividad simulada de la demo (idea 24), en local u online, y su retirada después de la demo, según «Pulido» de docs/plan_mvp.md. Claude solo lee y comprueba; las pasadas y la retirada las hace el usuario. Solo lo lanza el usuario.
argument-hint: "[local | online | retirada]"
disable-model-invocation: true
---

# Actividad simulada

Pedido: $ARGUMENTS

Fuentes (se leen, no se copian): en `docs/plan_mvp.md`, «Pulido» → «Actividad simulada para la demo» (cuentas, acciones, invitados, ritmo, obras, guarda, rastro y retirada) y las decisiones D14–D21 de la tabla de esa sección.

Claude no lanza ninguna pasada ni nada `:online`: lee, comprueba y entrega los comandos; las pasadas las lanza el usuario (D20). Un paso cada vez; si algo falla, para.

## 0. ¿Está construida?

Comprueba que existen `server/src/scripts/demo-activity.ts`, `server/src/scripts/demo-activity-guard.ts` con sus tests `Seguridad:`, y los scripts `demo:activity` y `demo:activity:online` en `package.json`. Si falta algo, para y dilo: se construye con `/constructor`, empezando por los tests de la guarda (`CLAUDE.md`, «Tests»), y después se añade a la tabla de comandos y al árbol de `CLAUDE.md`.

## 1. Comprobaciones (Claude, solo lectura)

- `npm run typecheck` y `npm test`, en verde, con los tests de la guarda.
- El entorno pedido cumple la guarda del plan: en local, `APP_URL` con `http` y un host local; online, `https` y el código desplegado. La contraseña de las cuentas no se lee: la carga el script.
- Las altas: si aún faltan cuentas, cada pasada registra como mucho las que permite RN-13, y la siguiente espera lo que dice «Cuentas» del plan. Dile al usuario cuántas faltan, si lo sabe por la pasada anterior.

## 2. Pasada (la lanza el usuario)

- **Local:** `npm run build` y `npm run demo:activity`, con la app arrancada.
- **Online:** `npm run build` y `npm run demo:activity:online -- --confirm <host de APP_URL>`; el host lo escribe el usuario.
- Una pasada al día los días previos a la demo, con el ritmo del plan (D20).

## 3. Después de cada pasada

El usuario mira en `/admin` → Estadísticas que se mueven las cifras de «Rastro» y, en Auditoría, los `user.register`, `auth.login_ok` y `auth.logout` de las cuentas `actividad*@demo.test`, sin errores en los logs. La primera pasada de cada entorno va a la bitácora con la skill `bitacora`.

## 4. Retirada (después de la demo, D21)

Desde `/admin`, el usuario suspende las seis cuentas y elimina sus comentarios; Claude no lo hace. Comprobación en Auditoría: seis `user.suspend` y un `comment.delete` por comentario. Las lecturas se quedan en los totales (riesgo aceptado del plan). Entrada de bitácora con la skill `bitacora`.

En la presentación y en el README, la actividad de las cuentas `@demo.test` se declara simulada.
