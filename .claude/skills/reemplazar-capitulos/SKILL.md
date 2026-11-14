---
name: reemplazar-capitulos
description: Guía el reemplazo de capítulos de una obra importada con content:import --replace (RN-18), en local y online, según «Pulido» de docs/plan_mvp.md. Claude solo lee y comprueba; los comandos que escriben en una base de datos los ejecuta el usuario. Solo lo lanza el usuario.
argument-hint: "<slug>:<n>,<n>… [local | online]"
disable-model-invocation: true
---

# Reemplazar capítulos

Pedido: $ARGUMENTS

Fuentes (se leen, no se copian): en `docs/plan_mvp.md`, «Pulido» → «Reemplazo de capítulos importados» y RN-18; en `README.md`, «Cargar obras (`content/`)», pasos 3 y 4 y «Sustituir capítulos ya cargados».

Claude no ejecuta `content:import`, nada `:online` ni `psql`: lee, comprueba y entrega los comandos, y el usuario los ejecuta. Un paso cada vez; si algo falla, para.

## 1. Alcance

- La obra (`slug`), los números de capítulo y el entorno. Primero local; online, solo con el local comprobado.
- Antes de dar ningún comando, resume al usuario lo que deja de verse (lecturas, comentarios, punto de abandono y auditoría), con la lista «Qué pasa con los capítulos reemplazados» del plan.

## 2. Comprobaciones (Claude, solo lectura)

- `content/<slug>/` tiene una carpeta por capítulo (`002/`, `003/`…) con las páginas en el formato y las medidas del paso 3 del README (`ffprobe`), y `comic.json` es JSON válido, con el título nuevo si cambia.
- Cada número es un capítulo publicado de la obra: lo confirma el usuario en `/obra/<slug>`. Si no, la importación omite la obra sin cambiar nada (README).
- `npm run typecheck` y `npm test`, en verde.

## 3. Local (lo ejecuta el usuario)

Los comandos de «Sustituir capítulos ya cargados» del README, con la obra y los números pedidos. Después, el usuario mira la ficha, el lector (`/leer/<slug>/<n>`) y, en `/admin` → Auditoría, un `chapter.withdraw` por capítulo y el `content.import` con `replaced`. Anota la línea `Importación terminada`.

## 4. Online (lo ejecuta el usuario)

El paso 2 del plan («Online»), con el código desplegado:
1. La consulta de solo lectura del plan, para ver lo que dejará de contarse.
2. `content:import:online` con `--replace`. Si la primera línea no muestra Neon sin `-pooler` y `r2`, se para con Ctrl+C.
3. Las mismas comprobaciones que en local, en la web de Render.

## 5. Cierre

Entrada de bitácora con la skill `bitacora`: obra, capítulos, entorno, la línea `Importación terminada` y lo comprobado. No hay commit, porque `content/` no se versiona; si cambió algo versionado, se entrega con la skill `entregar-commit`.
