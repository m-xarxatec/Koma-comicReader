---
name: bitacora
description: Escribe la entrada de docs/bitacora.md de una tarea, sesión o bloque cerrado, con la plantilla del principio del archivo y solo con datos comprobados en la sesión. Usar al cerrar un bloque, un paso de un plan o una tarea relevante, o cuando el usuario pida la entrada de bitácora. Con el argumento «prueba», solo la muestra.
argument-hint: "[prueba] [Bloque N · Tarea]"
---

# Bitácora

Entrada: $ARGUMENTS

## Antes de escribir

1. De `docs/bitacora.md` lee solo el principio, hasta `## Entradas` (la plantilla), y la última entrada, para seguir el tono. Nunca el archivo entero: los títulos se buscan con `grep -n '^### ' docs/bitacora.md`.
2. Reúne los datos de la sesión: qué se pidió, qué cambió (`git diff --stat` y `git log` del tramo), los tests nuevos, las revisiones de los agentes, las decisiones del usuario y los comandos ejecutados con sus cifras.

## Cómo escribirla

- Título `### AAAA-MM-DD · Bloque N (o Pulido) · Tarea`, con la fecha de hoy, al final del archivo. Solo se añade: las entradas anteriores no se editan.
- Los campos de la plantilla, en su orden. Los marcados «si hubo» o «si hay» se omiten cuando no tienen contenido; no se escribe «ninguno».
- Solo hechos de esta sesión. Una cifra o un «pasa» solo si el comando se ejecutó aquí; si no, «sin verificar». Lo que comprueba el usuario (navegador, móvil, online, Windows) va en «Pendiente».
- Frases cortas, listas cuando son varias cosas, archivos y comandos entre comillas invertidas, y la RN, el CU o la decisión (D-xx, DL-xx) de cada cambio.
- Si un test existente cambió con permiso, la entrada dice qué aserción, por qué y que el usuario lo autorizó (`CLAUDE.md`, «Tests»).
- Nunca secretos, contraseñas, tokens, URLs de bases de datos reales ni datos personales.
- «Aprendizaje», solo si hay una regla nueva y útil para la próxima sesión. Si cambia una regla, propón también el cambio en `CLAUDE.md`, sin hacerlo hasta que el usuario dé el OK.

## Después

- Con «prueba» en el argumento: muestra la entrada y no toques el archivo.
- Si no: escríbela, muéstrala y entrega su commit con la skill `entregar-commit` (`docs(bitacora): …`), o inclúyela en el commit de la tarea si es la misma.
