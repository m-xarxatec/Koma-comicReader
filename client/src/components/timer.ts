// Cuenta atrás del anuncio (RN-01) y espera hasta la recarga del saldo (RN-02). Las funciones puras se prueban
// en los tests unitarios; startCountdown solo las llama cada segundo.

// Segundos que faltan hasta `endsAt` (ms), redondeados hacia arriba y nunca negativos.
export function secondsLeft(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

// Hora de la recarga en español: "a las 18:05" si es hoy; si no, "el 5 de noviembre a las 18:05".
export function retryAtText(retryAt: Date, now: Date): string {
  const time = retryAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const sameDay = retryAt.toDateString() === now.toDateString();
  return sameDay ? `a las ${time}` : `el ${retryAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} a las ${time}`;
}

// Llama a onTick con los segundos que faltan (también al empezar) y a onDone una sola vez al llegar a 0.
// Devuelve una función para pararla (p. ej. si la pantalla cambia antes de terminar).
export function startCountdown(seconds: number, onTick: (left: number) => void, onDone: () => void): () => void {
  const endsAt = Date.now() + seconds * 1000;
  let timer: ReturnType<typeof setInterval> | undefined;
  const tick = () => {
    const left = secondsLeft(endsAt, Date.now());
    onTick(left);
    if (left === 0) {
      clearInterval(timer);
      onDone();
    }
  };
  timer = setInterval(tick, 250);
  tick();
  return () => clearInterval(timer);
}
