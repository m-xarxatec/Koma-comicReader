// Tarjeta de anuncio de texto (RN-01, RN-03): "Publicidad", la marca y el texto; imagen solo si la trae.
// Marcas inventadas (CLAUDE.md, "No haremos"): todo con textContent.

export interface AdDto {
  brand: string;
  body: string;
  imageUrl: string | null;
}

// eager: el anuncio ocupa la primera pantalla (el que desbloquea el cap. 3); el del final va con lazy.
export function adCard(ad: AdDto, eager = false): HTMLElement {
  const card = document.createElement('aside');
  card.className = 'ad-card';
  card.setAttribute('aria-label', 'Publicidad');
  const label = document.createElement('p');
  label.className = 'eyebrow ad-card__label';
  label.textContent = 'Publicidad';
  card.append(label);
  if (ad.imageUrl) {
    const image = document.createElement('img');
    image.className = 'ad-card__image';
    image.src = ad.imageUrl;
    image.alt = '';
    if (!eager) image.loading = 'lazy';
    card.append(image);
  }
  const brand = document.createElement('p');
  brand.className = 'ad-card__brand';
  const strong = document.createElement('strong');
  strong.textContent = ad.brand;
  brand.append(strong);
  const body = document.createElement('p');
  body.className = 'ad-card__body';
  body.textContent = ad.body;
  card.append(brand, body);
  return card;
}
