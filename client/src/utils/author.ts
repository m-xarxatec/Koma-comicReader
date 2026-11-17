// Reglas del estudio del autor (/autor; CU-28 a CU-30, D18) sin DOM, para probarlas con su JS compilado.

export interface StudioView {
  creating: boolean;
  slug: string | null;
  showChapter: boolean;
}
export type StudioHeading = 'crear-obra-title' | 'capitulo-title' | 'obra-title' | 'mis-obras-title';

// La vista la decide la consulta (?obra=&capitulo=&vista=). Un enlace a una sección de la página (#resumen,
// #nuevo-capitulo…) también lanza popstate, pero con la misma consulta: no hay ruta nueva y no se vuelve a pintar
// (eso vaciaría el aviso, pisaría lo escrito y volvería a pedir el capítulo abierto). null: aún no se pintó nada.
export function isNewRoute(routed: string | null, search: string): boolean {
  return routed !== search;
}

// El título de la vista visible: a él va el foco cuando la sección que lo tenía se oculta.
export function viewHeading(view: StudioView): StudioHeading {
  if (view.creating) return 'crear-obra-title';
  if (view.showChapter) return 'capitulo-title';
  return view.slug !== null ? 'obra-title' : 'mis-obras-title';
}

// Una acción que no se lanza dos veces a la vez: mientras dura, otra llamada no hace nada (doble clic, o el mismo
// «Retirar» desde la tabla y desde el editor).
export function oneAtATime<A extends unknown[]>(task: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  let running = false;
  return async (...args: A) => {
    if (running) return;
    running = true;
    try {
      await task(...args);
    } finally {
      running = false;
    }
  };
}

// Un 400 de una subida trae el motivo en `fields` (no hay formulario donde pintarlo): se añade al mensaje.
export function withFieldDetails(message: string, fields?: Readonly<Record<string, string>>): string {
  const details = Object.values(fields ?? {});
  return details.length === 0 ? message : `${message} ${details.join(' ')}`;
}
