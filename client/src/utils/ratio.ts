// Medidas width/height de un <img> sacadas de un token de proporción de variables.css ("ancho / alto"):
// reservan el hueco con la proporción del diseño sin repetir el valor en TypeScript, así el diseño la cambia
// sin tocar el código. Si el token no tiene esa forma, devuelve null y el hueco lo reserva el aspect-ratio
// del contenedor.
export interface ImageSize {
  width: number;
  height: number;
}

const cache = new Map<string, ImageSize | null>();

export function sizeFromRatioToken(token: `--${string}`): ImageSize | null {
  const cached = cache.get(token);
  if (cached !== undefined) return cached;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token);
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(value);
  const size = match ? { width: Number(match[1]), height: Number(match[2]) } : null;
  cache.set(token, size);
  return size;
}
