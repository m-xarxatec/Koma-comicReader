import type { Request, Response } from 'express';
import { sendPage } from '../../utils/page.js';
import { toUserDto } from '../users/users.service.js';
import * as paymentsService from './payments.service.js';

// Traduce HTTP ↔ servicio; sin lógica de negocio. requireAuth va antes en cada ruta con sesión.

const context = (req: Request, res: Response) => ({ ip: req.ip ?? null, requestId: res.locals.requestId });

// Stripe solo mira el código: cualquier 2xx da la entrega por buena; el resto la reintenta.
export async function stripeWebhook(req: Request, res: Response): Promise<void> {
  await paymentsService.handleStripeWebhook(req.body, req.get('stripe-signature'), { requestId: res.locals.requestId });
  res.json({ received: true });
}

export async function getSubscription(_req: Request, res: Response): Promise<void> {
  res.json({ subscription: await paymentsService.getSubscription(res.locals.user!) });
}

export async function checkout(_req: Request, res: Response): Promise<void> {
  res.json({ url: await paymentsService.startCheckout(res.locals.user!) });
}

export async function portal(_req: Request, res: Response): Promise<void> {
  res.json({ url: await paymentsService.openPortal(res.locals.user!) });
}

export async function fakePay(req: Request, res: Response): Promise<void> {
  const user = await paymentsService.fakePay(res.locals.user!, context(req, res));
  res.locals.user = user;
  res.json({ user: toUserDto(user) });
}

export async function fakeCancel(req: Request, res: Response): Promise<void> {
  res.json({ subscription: await paymentsService.fakeCancel(res.locals.user!, context(req, res)) });
}

// /premium y /premium/gracias: la misma página (mapa de rutas); cambian la vista, el <title> y el <h1> (D17).
const PREMIUM_VIEWS = {
  offer: {
    view: 'offer',
    title: 'Premium',
    heading: 'Más historias.',
    headingAccent: 'Menos pausas.',
    lead: 'Lectura sin anuncios y sin límites de capítulos. Premium es opcional: también puedes seguir leyendo gratis.',
  },
  thanks: {
    view: 'thanks',
    title: 'Gracias',
    heading: 'Gracias por pasarte a',
    headingAccent: 'Premium',
    lead: 'En cuanto el proveedor de pagos lo confirme, tu cuenta será premium.',
  },
} as const;

export async function premiumPage(_req: Request, res: Response): Promise<void> {
  await sendPage(res, 'premium', PREMIUM_VIEWS.offer);
}

export async function premiumThanksPage(_req: Request, res: Response): Promise<void> {
  await sendPage(res, 'premium', PREMIUM_VIEWS.thanks);
}

export async function fakeCheckoutPage(_req: Request, res: Response): Promise<void> {
  await sendPage(res, 'fake-checkout');
}
