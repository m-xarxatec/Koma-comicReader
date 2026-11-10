# Casos de uso · Koma — plataforma de cómics

Herencia de permisos: Invitado → Registrado → Premium. Autor = Registrado con permisos extra. Admin = conjunto propio (un admin no es autor).
Cada CU indica su fase (MVP, 2 o 3) según `plan_mvp.md`. Las reglas RN citadas están en ese documento.

## Invitado

### CU-01 Explorar catálogo
**Actor:** Invitado · **Fase:** MVP
**Objetivo:** Buscar obras por nombre o combinando etiquetas (géneros y temáticas); se muestran las que tienen todas.
**Excepciones:**
- No hay resultados para la búsqueda.

### CU-02 Ver ficha de obra
**Actor:** Invitado · **Fase:** MVP
**Objetivo:** Consultar los datos de una obra: sinopsis, autor original, publicado por, licencia con enlace, etiquetas y advertencias (RN-07).
**Excepciones:**
- La obra no existe (404) o fue retirada (410).

### CU-03 Leer capítulos libres
**Actor:** Invitado · **Fase:** MVP
**Objetivo:** Leer los capítulos 1 y 2 de cualquier obra (RN-01).
**Excepciones:**
- El capítulo solicitado supera el límite del invitado: se muestra la invitación a registrarse.
- Las imágenes del capítulo no cargan: mensaje en la viñeta y botón "Recargar".

### CU-04 Desbloquear capítulo con anuncio
**Actor:** Invitado · **Fase:** MVP
**Objetivo:** Ver un anuncio para desbloquear el capítulo 3 de esa obra (RN-01).
**Excepciones:**
- El usuario cierra el anuncio antes de terminar.
- El token de anuncio es de otra obra o no cumple el tiempo mínimo.

### CU-05 Leer comentarios de viñeta
**Actor:** Invitado · **Fase:** MVP
**Objetivo:** Ver el contador y los comentarios de la comunidad sobre una viñeta.
**Excepciones:**
- La viñeta no tiene comentarios.

### CU-06 Compartir viñeta
**Actor:** Invitado · **Fase:** MVP (Open Graph en el bloque 5)
**Objetivo:** Compartir un enlace que abre la viñeta exacta (RN-09).
**Excepciones:**
- El dispositivo no soporta el menú nativo de compartir (se ofrece copiar enlace).
- Contexto no seguro: se muestra el enlace para copiarlo a mano.

### CU-07 Registrarse
**Actor:** Invitado · **Fase:** MVP (referido en fase 3)
**Objetivo:** Crear una cuenta (RN-12).
**Excepciones:**
- El correo ya está registrado.
- Los datos no son válidos.
- Se supera el límite de intentos.
- (Fase 3) El enlace de referido no existe.

## Registrado

### CU-08 Iniciar sesión
**Actor:** Registrado · **Fase:** MVP (2FA en fase 2)
**Objetivo:** Acceder a su cuenta.
**Excepciones:**
- Credenciales incorrectas (mismo mensaje exista o no el correo).
- Cuenta suspendida.
- Se supera el límite de intentos.
- (Fase 2) Dispositivo nuevo: se solicita código 2FA.
- (Fase 2) Código 2FA incorrecto o caducado.

### CU-09 Recuperar contraseña
**Actor:** Registrado · **Fase:** 2
**Objetivo:** Restablecer la contraseña mediante un enlace enviado al correo.
**Excepciones:**
- El correo no está registrado (se muestra el mismo mensaje para no revelarlo).
- El enlace caducó.

### CU-10 Gestionar seguridad de la cuenta
**Actor:** Registrado · **Fase:** 2 (TOTP en fase 3)
**Objetivo:** Revisar y eliminar dispositivos de confianza; activar o desactivar TOTP.
**Excepciones:**
- Código TOTP incorrecto al activarlo.

### CU-11 Elegir gustos
**Actor:** Registrado · **Fase:** 2
**Objetivo:** Seleccionar géneros favoritos para recibir recomendaciones.
**Excepciones:**
- El usuario omite el paso (se muestran obras populares).

### CU-12 Leer con límite
**Actor:** Registrado · **Fase:** MVP
**Objetivo:** Leer con saldo global de capítulos: máximo 5, recarga de 2 por periodo de espera; releer y los caps. 1–2 no consumen. Incluye anuncios (RN-02, RN-03).
**Excepciones:**
- Saldo agotado: se muestra el temporizador hasta la próxima recarga y la opción premium.

### CU-13 Comentar viñeta
**Actor:** Registrado · **Fase:** MVP
**Objetivo:** Publicar un comentario sobre una viñeta y borrar los propios (RN-11).
**Excepciones:**
- Comentario vacío o demasiado largo.
- Se supera el límite de comentarios por minuto.
- El comentario ya fue eliminado.

### CU-14 Seguir serie
**Actor:** Registrado · **Fase:** 2
**Objetivo:** Seguir una obra y recibir notificaciones de capítulos nuevos por correo o en la bandeja de entrada de su perfil.
**Excepciones:**
- El usuario desactivó las notificaciones por correo: solo las recibe en la bandeja de entrada.

### CU-15 Ganar puntos y logros
**Actor:** Registrado · **Fase:** 2
**Objetivo:** Acumular puntos al leer y comentar, y desbloquear logros.
**Excepciones:**
- Acción repetida que no suma puntos (evitar abuso).

### CU-16 Apoyar al autor
**Actor:** Registrado · **Fase:** 3
**Objetivo:** Enviar puntos al autor de un capítulo.
**Excepciones:**
- Puntos insuficientes.
- El usuario intenta enviarse puntos a sí mismo.

### CU-17 Usar pase anticipado con puntos
**Actor:** Registrado · **Fase:** 3
**Objetivo:** Leer un capítulo antes de su publicación general pagando con puntos.
**Excepciones:**
- Puntos insuficientes.

### CU-18 Publicar ilustración
**Actor:** Registrado · **Fase:** 3
**Objetivo:** Subir una ilustración a la comunidad, opcionalmente dentro del reto semanal.
**Excepciones:**
- Formato o tamaño de archivo no válido.
- El reto semanal ya cerró.

### CU-19 Solicitar verificación de edad
**Actor:** Registrado · **Fase:** 3
**Objetivo:** Enviar fecha de nacimiento y documento para acceder a la zona +18.
**Excepciones:**
- El usuario es menor de edad.
- Ya tiene una solicitud pendiente.

### CU-20 Acceder a zona +18
**Actor:** Registrado (verificado) · **Fase:** 3
**Objetivo:** Ver la pestaña de contenido +18.
**Excepciones:**
- Edad no verificada: se redirige a la verificación.

### CU-21 Hacerse premium
**Actor:** Registrado · **Fase:** MVP
**Objetivo:** Pagar la suscripción mensual con Stripe (modo prueba) y pasar a premium cuando el webhook lo confirme (RN-04). Sin internet, con el pago simulado.
**Excepciones:**
- Pago rechazado: sigue como registrado.
- El usuario cancela el pago: vuelve a `/premium` sin cambios.

### CU-22 Compartir enlace de referido
**Actor:** Registrado · **Fase:** 3
**Objetivo:** Obtener y compartir su enlace personal de referido.
**Excepciones:**
- Ninguna.

### CU-23 Editar perfil
**Actor:** Registrado · **Fase:** MVP (avatar en fase 2)
**Objetivo:** Modificar nombre y contraseña; al cambiar la contraseña se cierran las demás sesiones (RN-15).
**Excepciones:**
- Datos no válidos.
- Contraseña actual incorrecta.

## Premium

### CU-24 Leer sin límites
**Actor:** Premium · **Fase:** MVP
**Objetivo:** Leer sin anuncios ni espera.
**Excepciones:**
- La suscripción venció: vuelve a las reglas de registrado.

### CU-25 Pase anticipado incluido
**Actor:** Premium · **Fase:** 3
**Objetivo:** Leer capítulos antes de su publicación general sin gastar puntos.
**Excepciones:**
- El capítulo no tiene pase anticipado.

### CU-26 Descargar sin conexión
**Actor:** Premium · **Fase:** 3
**Objetivo:** Descargar capítulos para leerlos sin conexión.
**Excepciones:**
- Espacio insuficiente en el dispositivo.
- La suscripción venció: se bloquea el acceso a las descargas.

### CU-27 Cancelar suscripción
**Actor:** Premium · **Fase:** MVP
**Objetivo:** Cancelar premium desde el portal de Stripe (o el pago simulado); mantiene las ventajas hasta el fin del periodo pagado.
**Excepciones:**
- Ninguna.

## Autor

### CU-28 Crear obra
**Actor:** Autor · **Fase:** MVP
**Objetivo:** Registrar una obra con sus datos, autor original, licencia, etiquetas, advertencias, `is_adult` y declaración de autoría. Nace pendiente de aprobación (RN-05, RN-07).
**Excepciones:**
- Falta la declaración de autoría o la licencia.
- Datos no válidos.
- La obra es rechazada por el admin: se muestra el motivo.

### CU-29 Subir capítulo
**Actor:** Autor · **Fase:** MVP
**Objetivo:** Crear un capítulo en borrador, subir sus imágenes de una en una, eliminar las que sobren mientras siga en borrador y enviarlo a revisión (RN-05, RN-10).
**Excepciones:**
- Formato o tamaño de archivo no válido.
- Se supera el máximo de imágenes por capítulo.
- Se envía a revisión sin imágenes.
- La obra no le pertenece.
- El número de capítulo ya está en uso.

### CU-30 Editar o retirar obra
**Actor:** Autor (el admin puede retirar cualquiera) · **Fase:** MVP
**Objetivo:** Modificar los datos de una obra o retirarla, o retirar un capítulo (RN-05, RN-06).
**Excepciones:**
- La obra no le pertenece.

### CU-31 Ver estadísticas propias
**Actor:** Autor · **Fase:** MVP (punto de abandono en el bloque 5, RN-21; sin puntos recibidos)
**Objetivo:** Consultar lecturas por capítulo, punto de abandono y puntos recibidos.
**Excepciones:**
- La obra aún no tiene lecturas.
- Ningún lector registrado ha enviado progreso: se muestra «Sin datos de abandono».

## Admin

### CU-32 Aprobar contenido
**Actor:** Admin · **Fase:** MVP
**Objetivo:** Aprobar o rechazar con motivo obras y capítulos en `pending` (los borradores no le llegan) (RN-05, RN-17).
**Excepciones:**
- El contenido infringe derechos de autor.
- El contenido +18 no está clasificado como tal.
- La obra está marcada +18: no se puede aprobar en el MVP.
- Rechazo sin motivo.

### CU-33 Moderar comunidad
**Actor:** Admin · **Fase:** MVP (ilustraciones en fase 3)
**Objetivo:** Ocultar o eliminar comentarios inapropiados (RN-11).
**Excepciones:**
- El contenido ya fue eliminado.

### CU-34 Aprobar verificación de edad
**Actor:** Admin · **Fase:** 3
**Objetivo:** Revisar y aprobar o rechazar solicitudes de verificación.
**Excepciones:**
- El documento no es legible.

### CU-35 Gestionar usuarios
**Actor:** Admin · **Fase:** MVP
**Objetivo:** Cambiar roles, activar o quitar el rol autor y suspender o reactivar cuentas (RN-14, RN-15).
**Excepciones:**
- El admin intenta suspenderse o quitarse el rol a sí mismo.
- La acción dejaría la plataforma sin admins activos.

### CU-36 Configurar parámetros
**Actor:** Admin · **Fase:** MVP
**Objetivo:** Ajustar el periodo de espera, el saldo máximo y la recarga (RN-16).
**Excepciones:**
- Valor fuera de rango.

### CU-37 Crear reto semanal
**Actor:** Admin · **Fase:** 3
**Objetivo:** Publicar el reto de ilustración de la semana.
**Excepciones:**
- Ya hay un reto activo en esas fechas.

### CU-38 Gestionar anuncios
**Actor:** Admin · **Fase:** 2
**Objetivo:** Crear, editar y desactivar los anuncios falsos.
**Excepciones:**
- Formato de imagen no válido.

### CU-39 Ver estadísticas globales
**Actor:** Admin · **Fase:** 2 (bloque 5)
**Objetivo:** Consultar métricas agregadas de toda la plataforma (usuarios, premium, lecturas, obras más leídas, comentarios y actividad) y guardarlas como PDF desde la vista de impresión (RN-20).
**Excepciones:**
- La plataforma aún no tiene lecturas: se muestran ceros.

### CU-40 Consultar auditoría
**Actor:** Admin · **Fase:** MVP
**Objetivo:** Revisar con filtros (actor, acción, entidad, fechas) el registro de acciones sensibles.
**Excepciones:**
- Ninguna.

### CU-41 Importar obras desde directorio
**Actor:** Admin (por consola, sin interfaz) · **Fase:** MVP
**Objetivo:** Publicar obras copiando carpetas en `content/` y ejecutando `npm run content:import` (RN-18).
**Excepciones:**
- `comic.json` falta o no es válido: la obra se omite y se informa.
- Una etiqueta no existe en `tags.json`.
- La obra está marcada +18.
- Una imagen no cumple formato, tamaño o máximo por capítulo.
- El capítulo ya existe: se omite.
