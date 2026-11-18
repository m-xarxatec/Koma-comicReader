// Portada con la inicial de reserva (home-cover.css): la letra queda detrás de la imagen y se ve si la obra no
// tiene portada o su URL firmada ya no responde. Solo presentación: el contenedor es decorativo.
export function prepareCover(cover: HTMLElement, title: string): void {
  cover.classList.add('home-cover');
  cover.dataset['letter'] = Array.from(title.trim())[0] ?? 'K';
  cover.setAttribute('aria-hidden', 'true');
  const image = cover.querySelector('img');
  if (image) {
    image.addEventListener('error', () => image.remove(), { once: true });
    if (image.complete && image.naturalWidth === 0) image.remove();
  }
}
