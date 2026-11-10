import { api } from './api.js';

// Panel del admin (contrato del bloque 4). Todas las peticiones pasan por api.ts. Duplicado explícito de los DTO
// del servidor (admin.service.ts, comments.service.ts y users.service.ts).

export interface ReviewItemDto {
  kind: 'comic' | 'chapter';
  comic: { slug: string; title: string; status: 'pending' | 'approved'; publishedBy: string; isAdult: boolean; contentWarning: string | null };
  chapter: { number: number; title: string; panelCount: number } | null;
  submittedAt: string;
}

export interface ReviewQueueDto {
  items: ReviewItemDto[];
  counts: { comics: number; chapters: number };
}

export interface AdminCommentDto {
  id: number;
  body: string;
  author: { id: number; displayName: string };
  createdAt: string;
  hiddenAt: string | null;
  comic: { slug: string; title: string };
  chapterNumber: number;
  panelPosition: number;
}

export interface AdminUserDto {
  id: number;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  isAuthor: boolean;
  status: 'active' | 'suspended';
  isPremium: boolean;
  premiumUntil: string | null;
  createdAt: string;
  isSelf: boolean;
}

export type AdminUserChange = { role: 'user' | 'admin' } | { isAuthor: boolean } | { status: 'active' | 'suspended' };

export interface ReadingSettingsDto {
  waitMinutes: number;
  maxBalance: number;
  refill: number;
}

export interface AuditEntryDto {
  id: string;
  createdAt: string;
  actor: { id: number; displayName: string; email: string } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string;
}

// Estadísticas globales (CU-39; RN-20; contrato del bloque 5). Duplicado de admin.rules.ts.
export interface ReadsDto {
  total: number;
  last7: number;
  last30: number;
}

export interface AdminStatsDto {
  today: string; // 'YYYY-MM-DD' en Europe/Madrid
  users: { total: number; readers: number; authors: number; admins: number; suspended: number; premium: number; activeLast30: number };
  reads: ReadsDto & { guests: ReadsDto; users: ReadsDto };
  catalog: { comics: number; chapters: number };
  topComics: { slug: string; title: string; reads: ReadsDto }[];
  comments: { last7: number; moderatedLast7: number };
  auditLast24h: number;
}

export interface PageDto {
  page: number;
  pageSize: number;
  total: number;
}

// Query de una lista: solo los filtros con valor.
const query = (params: Readonly<Record<string, string | number>>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

const slugPath = (slug: string) => encodeURIComponent(slug);

export const getReviewQueue = () => api.get<ReviewQueueDto>('/api/admin/review');
export const getStats = () => api.get<{ stats: AdminStatsDto }>('/api/admin/stats');
export const reviewComic = (slug: string, decision: 'approve' | 'reject', reason?: string) =>
  api.post<void>(`/api/admin/comics/${slugPath(slug)}/${decision}`, decision === 'reject' ? { reason } : undefined);
export const reviewChapter = (slug: string, number: number, decision: 'approve' | 'reject', reason?: string) =>
  api.post<void>(`/api/admin/comics/${slugPath(slug)}/chapters/${number}/${decision}`, decision === 'reject' ? { reason } : undefined);

export const listComments = (params: Readonly<Record<string, string | number>>) =>
  api.get<PageDto & { comments: AdminCommentDto[] }>(`/api/admin/comments${query(params)}`);
export const hideComment = (id: number) => api.post<void>(`/api/admin/comments/${id}/hide`);
export const deleteComment = (id: number) => api.delete<void>(`/api/admin/comments/${id}`);

export const listUsers = (params: Readonly<Record<string, string | number>>) =>
  api.get<PageDto & { users: AdminUserDto[] }>(`/api/admin/users${query(params)}`);
export const changeUser = (id: number, change: AdminUserChange) => api.patch<{ user: AdminUserDto }>(`/api/admin/users/${id}`, change);

export const getSettings = () => api.get<{ settings: ReadingSettingsDto }>('/api/admin/settings');
export const saveSettings = (settings: ReadingSettingsDto) => api.put<{ settings: ReadingSettingsDto }>('/api/admin/settings', settings);

export const searchAudit = (params: Readonly<Record<string, string | number>>) =>
  api.get<PageDto & { entries: AuditEntryDto[] }>(`/api/admin/audit${query(params)}`);
