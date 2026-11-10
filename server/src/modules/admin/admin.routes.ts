import { Router } from 'express';
import { requireAdmin, requirePageAdmin } from '../../middlewares/roles.js';
import { validate } from '../../middlewares/validate.js';
import { comicParams } from '../comics/comics.schema.js';
import { commentParams } from '../comments/comments.schema.js';
import { chapterParams } from '../reading/reading.schema.js';
import * as controller from './admin.controller.js';
import { adminCommentsQuery, adminUserBody, adminUsersQuery, auditQuery, readingSettingsBody, rejectBody, userParams } from './admin.schema.js';

// Contratos de la API de los bloques 4 y 5 (docs/plan_mvp.md). Se monta en /api/admin, después de `auth`. requireAdmin va en
// el router (D1): toda ruta de /api/admin/* exige sesión (401) y rol admin (403) antes de mirar nada más.
export const adminRouter = Router();

adminRouter.use(requireAdmin);

const notFound = { notFound: ['params'] } as const;

// Aprobación de contenido (CU-32; RN-05, RN-09, RN-17)
adminRouter.get('/review', controller.getReviewQueue);
adminRouter.post('/comics/:slug/approve', validate({ params: comicParams }, notFound), controller.approveComic);
adminRouter.post('/comics/:slug/reject', validate({ params: comicParams }, notFound), validate({ body: rejectBody }), controller.rejectComic);
adminRouter.post('/comics/:slug/chapters/:number/approve', validate({ params: chapterParams }, notFound), controller.approveChapter);
adminRouter.post(
  '/comics/:slug/chapters/:number/reject',
  validate({ params: chapterParams }, notFound),
  validate({ body: rejectBody }),
  controller.rejectChapter,
);

// Moderación de comentarios (CU-33; RN-11)
adminRouter.get('/comments', validate({ query: adminCommentsQuery }), controller.listComments);
adminRouter.post('/comments/:id/hide', validate({ params: commentParams }, notFound), controller.hideComment);
adminRouter.delete('/comments/:id', validate({ params: commentParams }, notFound), controller.deleteComment);

// Usuarios (CU-35; RN-14, RN-15)
adminRouter.get('/users', validate({ query: adminUsersQuery }), controller.listUsers);
adminRouter.patch('/users/:id', validate({ params: userParams }, notFound), validate({ body: adminUserBody }), controller.changeUser);

// Parámetros de lectura (CU-36; RN-16)
adminRouter.get('/settings', controller.getSettings);
adminRouter.put('/settings', validate({ body: readingSettingsBody }), controller.updateSettings);

// Auditoría (CU-40): solo lectura
adminRouter.get('/audit', validate({ query: auditQuery }), controller.searchAudit);

// Estadísticas globales (CU-39; RN-20): solo lectura
adminRouter.get('/stats', controller.getStats);

// Página del mapa de rutas HTML. Se monta en la raíz, después de `auth`.
export const adminPagesRouter = Router();

adminPagesRouter.get('/admin', requirePageAdmin, controller.adminPage);
