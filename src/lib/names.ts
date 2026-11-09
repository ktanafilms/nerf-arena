// Nombres de jugador: limpieza y comprobaciones para que la voz no se confunda.

import { lev, normalize, COMMAND_WORDS } from './voice/matcher';

export function cleanName(raw: string): string {
  const only = raw.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '').slice(0, 12);
  return only ? only[0].toUpperCase() + only.slice(1).toLowerCase() : '';
}

export type NameIssue = { level: 'error' | 'warn'; msg: string } | null;

/** ¿Sirve este nombre como indicativo de voz? */
export function nameIssue(name: string, rival?: string): NameIssue {
  const n = normalize(name);
  if (n.length < 2) return { level: 'error', msg: 'Escribe tu nombre (mínimo 2 letras).' };
  if (COMMAND_WORDS.some((c) => lev(n, c) <= 1))
    return { level: 'error', msg: 'Se parece demasiado a una orden de voz. Prueba otro.' };
  if (rival) {
    const r = normalize(rival);
    if (r === n) return { level: 'error', msg: 'Tu rival ya se llama así. Usad nombres distintos.' };
    if (lev(n, r) <= 2 || n.slice(0, 3) === r.slice(0, 3))
      return { level: 'warn', msg: `Suena parecido a «${rival}». La voz podría confundirse.` };
  }
  if (n.length <= 3) return { level: 'warn', msg: 'Los nombres muy cortos se reconocen peor por voz.' };
  return null;
}
