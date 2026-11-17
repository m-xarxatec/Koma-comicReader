import { api } from './api.js';
import { boardQueryString, type BoardState } from '../utils/illustrations.js';

// Ilustraciones de la comunidad (contrato del bloque 6, «Comunidad»; RN-22). Duplicado explícito de los DTO del
// servidor (modules/illustrations/illustrations.service.ts).

export interface IllustrationDto {
  id: number;
  title: string;
  description: string | null;
  url: string; // firmada
  width: number; // px, para reservar el hueco en el tablero
  height: number;
  tags: string[]; // slugs; se pintan como «#slug»
  author: { displayName: string };
  publishedAt: string; // ISO 8601
}

export interface OwnIllustrationDto extends Omit<IllustrationDto, 'publishedAt'> {
  status: 'pending' | 'approved' | 'rejected';
  rejectionReason: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface TagCountDto {
  tag: string;
  count: number;
}

interface Page {
  page: number;
  pageSize: number;
  total: number;
}

export type BoardDto = Page & { illustrations: IllustrationDto[]; tags: TagCountDto[] };
export type OwnIllustrationsDto = Page & { illustrations: OwnIllustrationDto[] };

export const getBoard = (state: BoardState) => api.get<BoardDto>(`/api/illustrations${boardQueryString(state)}`);
export const getOwnIllustrations = (page: number) => api.get<OwnIllustrationsDto>(`/api/me/illustrations${page > 1 ? `?page=${page}` : ''}`);

export interface IllustrationInput {
  image: File;
  title: string;
  description: string;
  tags: string; // un solo texto, separadas por comas (D3)
}

// multipart/form-data: los campos de texto van antes que la imagen.
export function publishIllustration(input: IllustrationInput) {
  const form = new FormData();
  form.append('title', input.title);
  if (input.description.trim() !== '') form.append('description', input.description);
  form.append('tags', input.tags);
  form.append('image', input.image);
  return api.post<{ illustration: OwnIllustrationDto }>('/api/illustrations', form);
}

export const withdrawIllustration = (id: number) => api.post<void>(`/api/illustrations/${id}/withdraw`);
