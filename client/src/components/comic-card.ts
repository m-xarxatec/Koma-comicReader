export interface TagDto {
  slug: string;
  name: string;
  type: 'genre' | 'theme';
}

export interface ComicCardDto {
  slug: string;
  title: string;
  authorCredit: string;
  coverUrl: string | null;
  tags: TagDto[];
}

const COVER_VARIANTS = ['violet', 'rose', 'blue', 'amber', 'indigo'] as const;

// width y height del <img> salen de --home-cover-ratio (variables.css, "ancho / alto"): el diseño cambia la
// proporción sin tocar este archivo. Si el token no tiene esa forma, el hueco lo reserva igual el aspect-ratio
// de .comic-card__cover.
let coverSize: { width: number; height: number } | null | undefined;

function readCoverSize(): { width: number; height: number } | null {
  if (coverSize !== undefined) return coverSize;
  const value = getComputedStyle(document.documentElement).getPropertyValue('--home-cover-ratio');
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(value);
  coverSize = match ? { width: Number(match[1]), height: Number(match[2]) } : null;
  return coverSize;
}

export function comicCard(comic: ComicCardDto, index: number, eager = false): HTMLElement {
  const article = document.createElement('article');
  article.className = 'comic-card';

  const link = document.createElement('a');
  link.className = 'comic-card__link';
  link.href = `/obra/${encodeURIComponent(comic.slug)}`;

  const cover = document.createElement('div');
  cover.className = `comic-card__cover comic-card__cover--${COVER_VARIANTS[index % COVER_VARIANTS.length]}`;
  if (comic.coverUrl) {
    const image = document.createElement('img');
    image.className = 'comic-card__image';
    image.src = comic.coverUrl;
    image.alt = ''; // el título, dentro del mismo enlace, ya le da nombre
    const size = readCoverSize();
    if (size) {
      image.width = size.width;
      image.height = size.height;
    }
    if (!eager) image.loading = 'lazy';
    cover.append(image);
  } else {
    cover.classList.add('comic-card__cover--empty');
    cover.setAttribute('aria-hidden', 'true');
  }

  const body = document.createElement('div');
  body.className = 'comic-card__body';
  const title = document.createElement('h3');
  title.className = 'comic-card__title';
  title.textContent = comic.title;
  const meta = document.createElement('p');
  meta.className = 'comic-card__meta';
  meta.textContent = [
    ...comic.tags.filter((tag) => tag.type === 'genre'),
    ...comic.tags.filter((tag) => tag.type === 'theme'),
  ].map((tag) => tag.name).join(' · ');
  const author = document.createElement('p');
  author.className = 'comic-card__author';
  author.textContent = comic.authorCredit;
  body.append(title, meta, author);
  link.append(cover, body);
  article.append(link);
  return article;
}
