# T13 · Comprobaciones de Stripe online (bloque 4)

Las haces tú, en Render + Neon con Stripe en **modo prueba** (sandbox). Yo no ejecuto nada contra Neon, R2 ni Stripe. Apunta en cada paso la hora, el `requestId` (cabecera `X-Request-Id` o el «código de referencia» de la página) y el id del evento (`evt_…`): con eso se cruzan Workbench, el log de Render y la auditoría.

## 0. Antes de empezar

1. **Despliegue.** `main` subido y Render desplegado con el último commit. En el log del arranque, la migración `009_billing` aplicada (solo la primera vez) y sin errores. Después, `GET https://<servicio>.onrender.com/api/health` → 200.
2. **Variables en Render:**
   - `PAYMENTS_DRIVER=stripe`;
   - `STRIPE_SECRET_KEY` empieza por `sk_test_`;
   - `STRIPE_PRICE_ID` es el precio mensual de «Koma Premium» en EUR, **5 €** (D16, el que pone el HTML);
   - `STRIPE_WEBHOOK_SECRET` es el `whsec_…` **del destino de Workbench**, no el de `stripe listen`;
   - `APP_URL` es la URL HTTPS de Render (de ahí salen `success_url` y `cancel_url`).
3. **Workbench → Webhooks → el destino del bloque 1:**
   - la URL termina en `/api/stripe/webhook`;
   - versión `2026-10-28.endive`, formato *snapshot*;
   - los seis eventos: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`.
4. **Portal de clientes (modo prueba):** activado, con cancelación **al final del periodo** y cambio de método de pago (bloque 1).
5. **Cuenta para pagar:** `premium@demo.test` (con `stripe`, el seed no le da premium) o una cuenta nueva registrada online. Nunca el admin: `/premium` no le ofrece pagar y la API le responde 403.
6. **Sin la página de pago simulado:** `/pago-simulado` online → **404** (el driver `fake` solo existe en local).

## 1. Pago con la tarjeta de prueba (CU-21)

1. Entra con la cuenta del paso 0.5 y abre `/premium`: «Hacerse premium», 5 € al mes y el distintivo «Modo de prueba».
2. Pulsa «Hacerse premium». Debe abrirse el Checkout de Stripe, en español y con el aviso de sandbox. Si en lugar de eso sale un error en la página, mira la tabla del apartado 7.
3. Prueba primero «volver» (la flecha o el enlace de Stripe): vuelves a `/premium` sin cambios (`cancel_url`).
4. Vuelve a pulsar y paga con:
   - tarjeta `4242 4242 4242 4242`;
   - cualquier fecha futura (p. ej. `12/34`), cualquier CVC (`123`) y cualquier código postal.

   Es una tarjeta de prueba: no hay cobro real.
5. **Opcional:** con la tarjeta rechazada `4000 0000 0000 0002`, Stripe muestra el error en su página y en Koma no cambia nada (ninguna entrada `subscription.*`).

## 2. Bienvenida en `/premium/gracias`

1. Tras pagar, Stripe te lleva a `/premium/gracias`. Primero ves «Estamos confirmando tu pago…» con el indicador. La página pregunta a `/api/me` cada 2 s, como mucho 30 s.
2. En unos segundos debe cambiar a la bienvenida: «Bienvenido a Koma Premium», «¡Gracias por pasarte a Premium!», las tres ventajas y la insignia. Con lector de pantalla, el cambio se anuncia.
3. Si pasan 30 s sin confirmarse, verás «El pago tarda más de lo normal» con el enlace a `/perfil`. **No es un fallo del pago**, sino que el webhook no ha llegado o ha fallado: mira Workbench (apartado 5).
4. Después:
   - en `/perfil`, «Tu suscripción Premium está activa hasta el …» (un mes desde hoy) y «Gestionar suscripción»;
   - en `/premium`, la fecha de fin y «Gestionar suscripción»;
   - abre un capítulo de pago: sin anuncio ni límite (RN-04).

## 3. Cancelar en el portal (CU-27)

1. En `/perfil` (o en `/premium`), «Gestionar suscripción» abre el portal de Stripe, del cliente de esa cuenta.
2. «Cancelar suscripción» → confirma. Vuelve a Koma con «Volver a …» del portal.
3. En `/perfil` debe salir **«Se cancela el …»**, con la misma fecha de fin. **Sigues siendo premium** hasta esa fecha: cancelar no corta el acceso.
4. Si la página no cambia, recarga una vez: el webhook (`customer.subscription.updated`) llega en paralelo a tu vuelta.

## 4. Renovar en el portal

1. Vuelve a «Gestionar suscripción». En el portal, «Renovar suscripción» (o «No cancelar»).
2. En `/perfil`, desaparece «Se cancela el …» y la fecha de fin sigue igual.

## 5. Workbench: entregas en 200 y el riesgo de los 413

En Workbench → Webhooks → el destino → **Entregas de eventos** (*Event deliveries*):

1. **Todas las entregas de los apartados 1–4, en 200**, con el cuerpo `{"received":true}`. Lo esperable:
   - **al pagar:** `checkout.session.completed`, `customer.subscription.created`, `invoice.paid` y, a veces, `customer.subscription.updated`;
   - **al cancelar:** `customer.subscription.updated`;
   - **al renovar:** `customer.subscription.updated`.

   Pueden llegar otros eventos si el destino los tuviera seleccionados; responden 200 sin hacer nada.
2. **El riesgo de los 413:** el webhook admite cuerpos de hasta **100 kB** (`JSON_BODY_LIMIT`). Un evento mayor recibe **413 `PAYLOAD_TOO_LARGE`** y Stripe lo reintenta; es un riesgo aceptado del plan, a revisar en este bloque.
   - Busca una entrega con estado **413**. Si no hay ninguna, el riesgo queda cerrado: anota el tamaño aproximado del evento más grande (abre el más pesado, normalmente `invoice.paid` o `checkout.session.completed`, y mira el cuerpo).
   - Si hay alguna 413, **no lo arregles a mano**: apunta el `evt_…`, su tipo y el tamaño, y dímelo. La corrección sería un límite propio solo para el webhook, que es un cambio de código y de plan que hay que aprobar.
3. **Idempotencia:** en una entrega ya en 200, pulsa **«Reenviar»** (*Resend*). Debe dar **200** otra vez. En el log de Render sale «Webhook de Stripe repetido: se ignora», y **no aparece ninguna entrada nueva** en la auditoría.
4. **En el log de Render, por cada entrega:**
   - «Webhook de Stripe verificado», con `eventId`, `type`, `livemode: false` y `apiVersion: 2026-10-28.endive`;
   - después, «Suscripción sincronizada» con sus `actions` (o «repetido» o «cliente desconocido»).

   Nunca debe aparecer el cuerpo del evento, ni correos ni la cabecera de firma.

## 6. Qué debe aparecer en la auditoría de Neon

Lo más cómodo es entrar como `admin@demo.test` online, ir a `/admin` → **Auditoría** y filtrar por **Entidad: Suscripciones**. Todas tienen el actor **«Sistema»** (actor `NULL`, D12) y la `entityId` de la fila de `subscriptions`.

| Momento | Acción | `before` → `after` |
| --- | --- | --- |
| Pago | `subscription.start` (una sola, aunque lleguen 3–4 eventos) | `after` con `status: active`, `currentPeriodEnd`, `cancelAtPeriodEnd: false`, `provider: stripe` y `userId` |
| Cancelar | `subscription.cancel` | `cancelAtPeriodEnd: false` → `true` |
| Renovar | `subscription.resume` | `cancelAtPeriodEnd: true` → `false` |
| Reenviar un evento | ninguna | — |

Nunca `subscription.renew` ni `subscription.expire` en esta prueba: el periodo no avanza (eso sería con Test Clocks, T14). Tampoco debe haber datos de tarjeta en `before`/`after`.

**Comprobación de respaldo** en el editor SQL de Neon, **solo con `SELECT`**: no edites ni borres nada; `audit_log` rechaza UPDATE y DELETE.

```sql
SELECT id, created_at, action, actor_id, entity_id, before, after, request_id
FROM audit_log WHERE entity_type = 'subscriptions' ORDER BY id DESC LIMIT 20;

SELECT id, type, received_at FROM payment_events ORDER BY received_at DESC LIMIT 20;

SELECT s.id, s.provider, s.status, s.current_period_end, s.cancel_at_period_end, u.email, u.premium_until
FROM subscriptions s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT 5;
```

Lo esperado:
- un `payment_events` por cada entrega de los seis tipos, sin duplicados aunque reenvíes;
- una fila en `subscriptions`, `provider = stripe`, `active`, con `cancel_at_period_end = false` al terminar;
- `users.premium_until` igual a `current_period_end`.

## 7. Si algo falla

Primero apunta el `requestId` y, si lo hay, el `evt_…`. Después busca en el log de Render por ese `requestId`. No toques la BD a mano.

| Síntoma | Dónde mirar | Causa probable |
| --- | --- | --- |
| «Hacerse premium» da error 503 | Log: el tipo y el código del error de Stripe | `STRIPE_SECRET_KEY` o `STRIPE_PRICE_ID` mal (precio de otra cuenta o archivado) |
| «Hacerse premium» da 409 | — | La cuenta ya es premium: usa otra o prueba el portal |
| `/premium/gracias` acaba en «El pago tarda más de lo normal» | Workbench: entregas del destino | Ninguna entrega: URL o eventos del destino mal. 400: firma (la siguiente fila). 503: la siguiente después. 413: apartado 5.2 |
| Entregas en **400** `VALIDATION_ERROR` | Log: «firma» | `STRIPE_WEBHOOK_SECRET` no es el `whsec_` de este destino (o falta volver a desplegar tras cambiarlo) |
| Entregas en **503** | Log de esa entrega | Neon o la API de Stripe no respondían: Stripe reintenta solo. Si persiste, la clave o la versión de API |
| Entregas en 200 pero sin premium; en el log, «cliente desconocido» | `SELECT stripe_customer_id FROM users WHERE email = '…'` y el cliente del pago en Stripe | El pago se hizo con otro cliente de Stripe que no es el guardado en la cuenta: dímelo con los dos `cus_…` |
| «Gestionar suscripción» da 409 | — | La cuenta no tiene cliente de Stripe (nunca pasó por el Checkout) |
| «Gestionar suscripción» da 503 | Log | El portal no está activado o configurado en modo prueba |
| No sale «Se cancela el …» | Workbench: `customer.subscription.updated` | Ese evento no está seleccionado en el destino, o su entrega falló |
| En el log, «Webhook de Stripe en modo real: se ignora» | — | No debería pasar con `sk_test_`: para y dímelo |
| Entradas `subscription.*` duplicadas | Auditoría y `payment_events` | No debería pasar (idempotencia): dímelo con los `evt_…` |

Si algo de esto falla, para la prueba y pásame: el apartado, el síntoma, el `requestId`, el `evt_…` y las líneas del log de Render, sin claves ni `whsec_`. Lo corrijo en local con tests y vuelves a desplegar.

## 8. Al terminar

- Consola del navegador sin errores en `/premium`, `/premium/gracias`, `/perfil` y `/admin`.
- 360 px y teclado en `/premium/gracias` y en el botón «Gestionar suscripción».
- Deja la suscripción **activa y sin cancelar** si `premium@demo.test` va a ser la cuenta premium de la demo.
- Dime el resultado de cada apartado para la entrada de bitácora de T13.
