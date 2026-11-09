// Interpreta transcripciones: "[indicativo] [orden]". Tolerante a errores pero estricto en el orden.

export type Command = 'tocado' | 'estado' | 'pausa' | 'seguir' | 'anular' | 'mia';

const COMMANDS: Record<Command, string[]> = {
  tocado: ['tocado', 'tocada', 'tocados', 'tocao', 'toca do', 'me han dado', 'me dieron', 'me dio', 'me han tocado', 'me han dao', 'herido'],
  estado: ['estado', 'estados', 'como vamos', 'como va', 'como voy', 'estatus', 'status', 'marcador'],
  pausa: ['pausa', 'pausar', 'pausas', 'pausa partida', 'stop'],
  seguir: ['seguir', 'sigue', 'seguimos', 'siga', 'continuar', 'continua', 'continuamos', 'reanudar', 'reanuda'],
  anular: ['anular', 'anula', 'anulado', 'anulo', 'cancelar', 'cancela', 'deshacer', 'deshaz'],
  mia: ['mia', 'mio', 'mias', 'es mia', 'mi a'],
};

// Palabras de relleno que se pueden colar entre indicativo y orden
const FILLERS = new Set(['ya', 'eh', 'oye', 'he', 'a', 'que', 'pues', 'vale', 'ah', 'y']);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zñ0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length,
    n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const d = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[n];
}

/** ¿Coincide la palabra con un objetivo? Distancia 1 solo si la palabra es larga. */
function wordMatch(word: string, target: string): boolean {
  if (word === target) return true;
  if (target.length >= 5 && word.length >= 4) return lev(word, target) <= 1;
  return false;
}

/** Un indicativo = el nombre del jugador y las variantes aprendidas. */
export type Callsign = string[];

function callsignWords(cs: Callsign): string[][] {
  return cs.map(normalize).filter(Boolean).map((s) => s.split(' '));
}

/** Longitud del indicativo que empieza en tokens[i], o 0 si no coincide. */
function matchCallsign(tokens: string[], i: number, me: Callsign, others: Callsign[]): number {
  for (const words of callsignWords(me)) {
    if (words.every((w, k) => tokens[i + k] !== undefined && wordMatch(tokens[i + k], w))) {
      // Si la palabra es exactamente el nombre del rival, no es nuestra
      const exactOther = others.some((o) =>
        callsignWords(o).some((ow) => ow.join(' ') === tokens.slice(i, i + ow.length).join(' ')),
      );
      if (exactOther) return 0;
      return words.length;
    }
  }
  return 0;
}

function matchCommand(tokens: string[], i: number, allowed: Command[]): { cmd: Command; len: number } | null {
  let best: { cmd: Command; len: number; exact: boolean } | null = null;
  for (const cmd of allowed) {
    for (const phrase of COMMANDS[cmd]) {
      const words = phrase.split(' ');
      if (words.length === 1) {
        const tok = tokens[i];
        if (tok === undefined) continue;
        if (tok === words[0]) return { cmd, len: 1 };
        if (!best && wordMatch(tok, words[0])) best = { cmd, len: 1, exact: false };
      } else if (words.every((w, k) => tokens[i + k] === w)) {
        return { cmd, len: words.length };
      }
    }
  }
  return best ? { cmd: best.cmd, len: best.len } : null;
}

/**
 * Devuelve las órdenes dirigidas a mí en el orden en que aparecen.
 * Ejemplo: "pablo tocado" → ['tocado'];  "ana tocado" → [] si yo soy Pablo.
 */
export function parseCommands(text: string, me: Callsign, allowed: Command[], others: Callsign[] = []): Command[] {
  const tokens = normalize(text).split(' ').filter(Boolean);
  const out: Command[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const cl = matchCallsign(tokens, i, me, others);
    if (!cl) continue;
    let j = i + cl;
    if (tokens[j] && FILLERS.has(tokens[j]) && !matchCommand(tokens, j, allowed)) j++;
    const m = matchCommand(tokens, j, allowed);
    if (m) {
      out.push(m.cmd);
      i = j + m.len - 1;
    }
  }
  return out;
}

export const ALL_COMMANDS: Command[] = ['tocado', 'estado', 'pausa', 'seguir', 'anular'];

/** Palabras sueltas de las órdenes (para que ningún nombre se les parezca). */
export const COMMAND_WORDS = Array.from(
  new Set(Object.values(COMMANDS).flat().filter((p) => !p.includes(' ') && p.length >= 4)),
);

/**
 * Calibración: si se oye "<algo> estado", devuelve <algo> (cómo transcribe
 * el móvil el nombre del jugador). Devuelve null si no hay patrón claro.
 */
export function learnAlias(text: string): string | null {
  const tokens = normalize(text).split(' ').filter(Boolean);
  for (let i = 1; i < tokens.length; i++) {
    if (!wordMatch(tokens[i], 'estado')) continue;
    let j = i - 1;
    if (FILLERS.has(tokens[j]) && j > 0) j--;
    const w = tokens[j];
    if (w && w.length >= 2 && !FILLERS.has(w)) return w;
  }
  return null;
}
