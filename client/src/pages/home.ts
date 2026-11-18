import { comicCard, type ComicCardDto, type TagDto } from '../components/comic-card.js';
import { api } from '../services/api.js';
import {
  CATALOG_PAGE_SIZE,
  catalogQueryString,
  queryProblem,
  readCatalogState,
  tagsProblem,
} from '../utils/catalog.js';

interface CatalogPageDto {
  comics: ComicCardDto[];
  page: number;
  pageSize: number;
  total: number;
}

// Tendencias: las 5 primeras de la petición del catálogo; solo las 2 primeras portadas sin loading="lazy"
// (decisión del desarrollador, 4-nov).
const TRENDING_SIZE = 5;
const TRENDING_EAGER_COVERS = 2;

const search = new URLSearchParams(location.search);
const store = { state: readCatalogState(search), loading: false };
const catalog = document.querySelector<HTMLElement>('#catalogo');
const message = document.querySelector<HTMLElement>('#catalog-message');
// Lo único que anuncian los lectores de pantalla (role="status"): una frase, no las 24 tarjetas.
const status = document.querySelector<HTMLElement>('#catalog-status');
const grid = document.querySelector<HTMLElement>('#catalog-grid');
const trending = document.querySelector<HTMLElement>('#tendencias');
const trendingGrid = document.querySelector<HTMLElement>('#trending-grid');
const genres = document.querySelector<HTMLElement>('#generos');
const genreGrid = document.querySelector<HTMLElement>('#genre-grid');
const genreFilters = document.querySelector<HTMLElement>('#genre-filters');
const pagination = document.querySelector<HTMLElement>('#catalog-pagination');
const filters = document.querySelector<HTMLDetailsElement>('#catalog-filters');
const queryInput = document.querySelector<HTMLInputElement>('#filtro-titulo');

function catalogLink(page: number): string {
  return `/${catalogQueryString({ ...store.state, page })}#catalogo`;
}

function scrollToCatalog(): void {
  if (location.hash === '#catalogo') requestAnimationFrame(() => catalog?.scrollIntoView());
}

function announce(value: string): void {
  if (status) status.textContent = value;
}

function showMessage(value: string, action: 'retry' | 'all' | null = null): void {
  announce(value);
  if (!message) return;
  message.textContent = value;
  message.hidden = false;
  if (action === 'all') {
    const link = document.createElement('a');
    link.className = 'text-link';
    link.href = '/#catalogo';
    link.textContent = 'Ver todo el catálogo';
    message.append(document.createElement('br'), link);
  } else if (action === 'retry') {
    const button = document.createElement('button');
    button.className = 'button button--outline';
    button.type = 'button';
    button.textContent = 'Reintentar';
    button.addEventListener('click', () => { void loadCatalog(); });
    message.append(document.createElement('br'), button);
  }
}

function makeChoice(tag: TagDto): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'catalog-filters__choice';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.name = 'tags';
  input.value = tag.slug;
  input.checked = store.state.tags.includes(tag.slug);
  const name = document.createElement('span');
  name.textContent = tag.name;
  label.append(input, name);
  return label;
}

// "Explorar por género" y el filtro empiezan ocultos en el HTML: sin JS, sin géneros o si /api/tags falla,
// no se ven vacíos.
function renderTags(tags: TagDto[]): void {
  if (!genres || !genreGrid || !filters || !genreFilters) return;
  genreGrid.replaceChildren();
  genreFilters.replaceChildren();
  // Solo géneros: para quien lee, género y temática se confunden (decisión del 3-nov). Las temáticas siguen
  // en las tarjetas y en la API.
  const genreTags = tags.filter((tag) => tag.type === 'genre');
  genres.hidden = genreTags.length === 0;
  filters.hidden = genreTags.length === 0;
  for (const tag of genreTags) {
    const link = document.createElement('a');
    link.className = 'genre-tile';
    link.href = `/${catalogQueryString({ q: '', tags: [tag.slug], page: 1 })}#catalogo`;
    link.textContent = tag.name;
    genreGrid.append(link);
    genreFilters.append(makeChoice(tag));
  }
}

function pageControl(label: string, page: number, available: boolean): HTMLElement {
  if (available) {
    const link = document.createElement('a');
    link.className = 'button button--outline';
    link.href = catalogLink(page);
    link.textContent = label;
    return link;
  }
  const disabled = document.createElement('span');
  disabled.className = 'button button--outline catalog-pagination__disabled';
  disabled.textContent = label;
  return disabled;
}

function renderPagination(total: number): void {
  if (!pagination) return;
  pagination.replaceChildren();
  const pages = Math.ceil(total / CATALOG_PAGE_SIZE);
  pagination.hidden = pages === 0;
  if (pages === 0) return;
  if (store.state.page > pages) {
    pagination.append(pageControl('Anterior', pages, true));
    return;
  }
  const current = document.createElement('span');
  current.className = 'catalog-pagination__current';
  current.textContent = `Página ${store.state.page} de ${pages}`;
  pagination.append(
    pageControl('Anterior', store.state.page - 1, store.state.page > 1),
    current,
    pageControl('Siguiente', store.state.page + 1, store.state.page < pages),
  );
}

// La letra queda detrás de la imagen si la portada falta o su URL ya no responde.
function prepareCover(cover: HTMLElement, title: string): void {
  cover.classList.add('home-cover');
  cover.dataset['letter'] = Array.from(title.trim())[0] ?? 'K';
  cover.setAttribute('aria-hidden', 'true');
  const image = cover.querySelector('img');
  if (image) {
    image.addEventListener('error', () => image.remove(), { once: true });
    if (image.complete && image.naturalWidth === 0) image.remove();
  }
}

function homeCard(comic: ComicCardDto, index: number, eager = false): HTMLElement {
  const card = comicCard(comic, index, eager);
  const cover = card.querySelector<HTMLElement>('.comic-card__cover');
  if (cover) prepareCover(cover, comic.title);
  return card;
}

function featureComic(comic: ComicCardDto): void {
  const title = document.getElementById('hero-title');
  const label = document.getElementById('hero-label');
  const byline = document.getElementById('hero-byline');
  const action = document.getElementById('hero-action');
  const link = document.querySelector<HTMLAnchorElement>('#hero-link');
  const cover = document.querySelector<HTMLElement>('.hero__art');
  if (!title || !label || !byline || !action || !link || !cover) return;
  title.textContent = comic.title;
  label.textContent = comic.tags.find(tag => tag.type === 'genre')?.name ?? 'Cómic';
  byline.textContent = comic.authorCredit;
  link.href = `/obra/${encodeURIComponent(comic.slug)}`;
  action.textContent = 'Ver obra';
  cover.replaceChildren();
  if (comic.coverUrl) {
    const image = new Image();
    image.alt = '';
    image.className = 'home-cover__image';
    image.src = comic.coverUrl;
    cover.append(image);
  }
  prepareCover(cover, comic.title);
}

function renderComics(data: CatalogPageDto): void {
  if (!grid || !trending || !trendingGrid || !message) return;
  grid.replaceChildren(...data.comics.map((comic, index) => homeCard(comic, index)));
  const isFirstUnfiltered = !store.state.q && store.state.tags.length === 0 && store.state.page === 1;
  const [featured, ...others] = data.comics;
  if (isFirstUnfiltered && featured) featureComic(featured);
  trending.hidden = !isFirstUnfiltered || others.length === 0;
  trendingGrid.replaceChildren(...(trending.hidden ? [] : others.slice(0, TRENDING_SIZE - 1).map((comic, index) => homeCard(comic, index + 1, index + 1 < TRENDING_EAGER_COVERS))));
  if (data.comics.length === 0) {
    const pages = Math.ceil(data.total / CATALOG_PAGE_SIZE);
    showMessage(data.total > 0
      ? store.state.page > pages
        ? `Esa página no existe: el catálogo tiene ${pages} ${pages === 1 ? 'página' : 'páginas'}`
        : 'No hay obras en esta página'
      : store.state.q || store.state.tags.length > 0
        ? 'No hay obras que coincidan con tu búsqueda'
        : 'Todavía no hay obras publicadas', 'all');
  } else {
    message.hidden = true;
    message.textContent = '';
    const pages = Math.ceil(data.total / CATALOG_PAGE_SIZE);
    announce(`${data.total} ${data.total === 1 ? 'obra' : 'obras'}; página ${store.state.page} de ${pages}`);
  }
  renderPagination(data.total);
}

async function loadCatalog(): Promise<void> {
  if (store.loading || !catalog) return;
  store.loading = true;
  catalog.setAttribute('aria-busy', 'true');
  if (pagination) pagination.hidden = true;
  if (trending) trending.hidden = true;
  grid?.replaceChildren();
  showMessage('Cargando catálogo...');
  if (queryInput) queryInput.value = store.state.q;
  if (filters) filters.open = Boolean(store.state.q || store.state.tags.length);

  const problem = search.getAll('q').length > 1
    ? 'La búsqueda debe ser un único texto'
    : queryProblem(store.state.q) ?? tagsProblem(search.getAll('tags').join(','));
  const tagsRequest = api.get<{ tags: TagDto[] }>('/api/tags');
  const comicsRequest = problem ? null : api.get<CatalogPageDto>(`/api/comics${catalogQueryString(store.state)}`);
  const tagsResult = await tagsRequest;
  const comicsResult = comicsRequest ? await comicsRequest : null;
  if (tagsResult.ok) renderTags(tagsResult.data.tags);

  if (problem) {
    showMessage(problem, 'all');
  } else if (!tagsResult.ok) {
    showMessage(tagsResult.error.message, 'retry');
  } else if (comicsResult && !comicsResult.ok) {
    showMessage(comicsResult.error.message, 'retry');
  } else if (comicsResult?.ok) {
    renderComics(comicsResult.data);
  }
  catalog.setAttribute('aria-busy', 'false');
  store.loading = false;
  scrollToCatalog();
}

void loadCatalog();
