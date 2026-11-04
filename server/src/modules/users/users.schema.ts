import { z } from 'zod';
import { displayName } from '../auth/auth.schema.js';

// PATCH /api/me (CU-23): solo el nombre visible, con la regla del registro (RN-12). El correo no se edita en el MVP.
export const profileBody = z.object({ displayName });
export type ProfileInput = z.infer<typeof profileBody>;
