import type { ModeConfig, ModeId } from './types';

export interface OptChoice {
  key: string;
  label: string;
  choices: { v: number; l: string }[];
}
export interface OptToggle {
  key: string;
  label: string;
  hint: string;
}

export interface ModeInfo {
  id: ModeId;
  name: string;
  category: 'COMBATE' | 'MISIÓN' | 'PRÁCTICA';
  summary: string;
  details: string[];
  available: boolean;
  code: string; // etiqueta corta para el HUD
  tag: string; // 3-5 palabras para la ficha de selección
  icon: string; // path SVG (viewBox 0 0 48 48)
  color: string; // color propio del modo
  bars: { k: string; v: number }[]; // "estadísticas" del modo, 0..1
  defaults: ModeConfig;
  options: OptChoice[];
  toggles: OptToggle[];
  /** Datos clave a la vista en la pantalla del modo */
  facts: (c: ModeConfig) => { k: string; v: string; f: number }[];
}

const min = (s: number) => (s ? `${s / 60}′` : '∞');
const mins = (list: number[]) => list.map((v) => ({ v, l: min(v) }));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const LEVELS = [
  { n: 1, name: 'Normal', short: 'Normal' },
  { n: 2, name: 'Con la mano mala', short: 'Mano mala' },
  { n: 3, name: 'Agachado o de rodillas', short: 'Agachado' },
  { n: 4, name: 'Desde la cadera, sin apuntar', short: 'Cadera' },
  { n: 5, name: 'Sin moverte al disparar', short: 'Quieto' },
  { n: 6, name: 'Un único dardo', short: 'Final' },
];

export const MODES: ModeInfo[] = [
  {
    id: 'duelo',
    color: '#ff2e3a',
    name: 'Duelo',
    category: 'COMBATE',
    code: 'DUE',
    tag: '3 vidas. Último en pie.',
    icon: 'M37 24a13 13 0 1 1-26 0 13 13 0 1 1 26 0zM24 4v12M24 32v12M4 24h12M32 24h12M26 24a2 2 0 1 1-4 0 2 2 0 1 1 4 0z',
    summary: 'Vidas para cada uno; gana quien deje al otro sin ninguna.',
    details: [
      'Si te dan, di «[tu nombre], tocado».',
      'Se acaba el tiempo: gana quien tenga más vidas.',
      'Empate: muerte súbita, el siguiente acierto gana.',
      '«Anular» deshace tu tocado en 5 s.',
      'Recoge dardos cuando quieras (salvo variantes).',
      'Un solo dardo: empezáis con 1. Si fallas, ve a por él.',
      'Baja confirmada: solo vale si el tirador recoge su dardo. 10 s para anular.',
    ],
    available: true,
    bars: [
      { k: 'Ritmo', v: 0.75 },
      { k: 'Movimiento', v: 0.6 },
      { k: 'Estrategia', v: 0.4 },
    ],
    defaults: { lives: 3, timeLimitSec: 300, oneInChamber: false, confirmedKill: false },
    options: [
      { key: 'lives', label: 'Vidas', choices: [1, 3, 5].map((v) => ({ v, l: String(v) })) },
      { key: 'timeLimitSec', label: 'Tiempo', choices: mins([180, 300, 600, 0]) },
    ],
    toggles: [
      { key: 'oneInChamber', label: 'Un solo dardo', hint: 'Si fallas, ve a por él' },
      { key: 'confirmedKill', label: 'Baja confirmada', hint: 'Recoge tu dardo para que cuente' },
    ],
    facts: (c) => [
      { k: 'Vidas', v: String(c.lives), f: Number(c.lives) / 5 },
      { k: 'Tiempo', v: min(Number(c.timeLimitSec)), f: c.timeLimitSec ? Number(c.timeLimitSec) / 600 : 1 },
    ],
  },
  {
    id: 'armas',
    color: '#ffb020',
    name: 'Juego de armas',
    category: 'COMBATE',
    code: 'ARM',
    tag: 'Acierta y sube de nivel',
    icon: 'M6 40h8v-8h8v-8h8v-8h8V8h4M30 8h12v12',
    summary: 'Cada acierto te sube de nivel y te pone más difícil disparar; gana quien complete todos los niveles.',
    details: [
      'Niveles: 1 normal · 2 mano mala · 3 agachado · 4 desde la cadera · 5 sin moverte al disparar · 6 un único dardo.',
      'Si te dan, di «[tu nombre], tocado»: el rival sube de nivel.',
      'Humillación: si te dan estando en el nivel 6, bajas al 5.',
      'Gana el primero que acierta desde el nivel 6.',
    ],
    available: true,
    bars: [
      { k: 'Ritmo', v: 0.85 },
      { k: 'Movimiento', v: 0.5 },
      { k: 'Estrategia', v: 0.5 },
    ],
    defaults: { timeLimitSec: 0 },
    options: [{ key: 'timeLimitSec', label: 'Tiempo', choices: mins([300, 600, 0]) }],
    toggles: [],
    facts: (c) => [
      { k: 'Niveles', v: '6', f: 1 },
      { k: 'Tiempo', v: min(Number(c.timeLimitSec)), f: c.timeLimitSec ? Number(c.timeLimitSec) / 600 : 1 },
    ],
  },
  {
    id: 'bomba',
    color: '#ff5a1f',
    name: 'Bomba',
    category: 'COMBATE',
    code: 'BOM',
    tag: 'Pásala disparando',
    icon: 'M21 16a14 14 0 1 0 6 0M24 16V9h6M30 9l5-4M36 9h4M34 13l3 3',
    summary: 'Quien tiene la bomba solo se la quita de encima dándole al otro; pierde quien la tenga cuando explote.',
    details: [
      'La bomba empieza en un jugador al azar. Su cuenta atrás está oculta (45-90 s).',
      'Si el portador te da, di «tocado»: la bomba pasa a ti.',
      'Sin devolución: tras recibirla, no puedes pasarla durante 3 s.',
      'Si te dan sin llevar la bomba, no pasa nada.',
      'Pierde la ronda quien la tenga al explotar.',
    ],
    available: true,
    bars: [
      { k: 'Ritmo', v: 1 },
      { k: 'Movimiento', v: 0.8 },
      { k: 'Estrategia', v: 0.3 },
    ],
    defaults: { bestOf: 3 },
    options: [{ key: 'bestOf', label: 'Al mejor de', choices: [1, 3, 5].map((v) => ({ v, l: String(v) })) }],
    toggles: [],
    facts: (c) => [
      { k: 'Rondas', v: String(c.bestOf), f: Number(c.bestOf) / 5 },
      { k: 'Mecha', v: '45-90 s', f: 0.6 },
    ],
  },
  {
    id: 'cazador',
    color: '#1fd27c',
    name: 'Cazador y presa',
    category: 'MISIÓN',
    code: 'CAZ',
    tag: 'Escóndete y aguanta',
    icon: 'M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24zM24 30a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
    summary: 'Uno caza y el otro aguanta todo lo que pueda; luego cambiáis y gana quien sobreviva más.',
    details: [
      'La presa tiene unos segundos para esconderse mientras el cazador mira a la pared.',
      'Luego el móvil de la presa pita cada 20 s (en el último minuto, cada 10 s).',
      'El cazador solo tiene sus 8 dardos y no puede recoger ninguno.',
      'La ronda acaba cuando la presa dice «tocado» o se llega al tiempo máximo.',
      'Después cambiáis los papeles. Gana quien aguante más siendo presa.',
    ],
    available: true,
    bars: [
      { k: 'Ritmo', v: 0.4 },
      { k: 'Movimiento', v: 0.7 },
      { k: 'Estrategia', v: 0.9 },
    ],
    defaults: { hideSec: 30, maxSec: 180 },
    options: [
      { key: 'maxSec', label: 'Máximo', choices: mins([120, 180, 300]) },
      { key: 'hideSec', label: 'Esconderse', choices: [20, 30, 45].map((v) => ({ v, l: `${v}s` })) },
    ],
    toggles: [],
    facts: (c) => [
      { k: 'Esconderse', v: `${c.hideSec} s`, f: Number(c.hideSec) / 45 },
      { k: 'Máximo', v: min(Number(c.maxSec)), f: Number(c.maxSec) / 300 },
    ],
  },
  {
    id: 'buscar',
    color: '#19c6d8',
    name: 'Buscar y destruir',
    category: 'MISIÓN',
    code: 'BYD',
    tag: 'Planta y defiende',
    icon: 'M15 6h18v36H15zM20 36h8M24 14v10l6 4',
    summary: 'Uno esconde su móvil como bomba y lo defiende; el otro tiene que desactivarlo sin que le den.',
    details: [
      'Plantar: el atacante esconde su propio móvil; el otro mira a la pared.',
      'Bomba: el móvil escondido pita cada 10 s.',
      'Para desactivarla, mantén pulsado el botón del móvil-bomba 5 s. Si sueltas, se pierde el progreso.',
      'Si dan al desactivador, dice «tocado» y gana el atacante. Si la bomba llega a cero, también.',
      'Se cambian los papeles cada ronda. Con empate al final, muerte súbita.',
    ],
    available: true,
    bars: [
      { k: 'Ritmo', v: 0.6 },
      { k: 'Movimiento', v: 0.8 },
      { k: 'Estrategia', v: 1 },
    ],
    defaults: { plantSec: 45, bombSec: 120, rounds: 4 },
    options: [
      { key: 'bombSec', label: 'Bomba', choices: [90, 120, 180].map((v) => ({ v, l: mmss(v) })) },
      { key: 'rounds', label: 'Rondas', choices: [2, 4, 6].map((v) => ({ v, l: String(v) })) },
    ],
    toggles: [],
    facts: (c) => [
      { k: 'Plantar', v: `${c.plantSec} s`, f: Number(c.plantSec) / 60 },
      { k: 'Bomba', v: mmss(Number(c.bombSec)), f: Number(c.bombSec) / 180 },
    ],
  },
  {
    id: 'blanco',
    color: '#9b6bff',
    name: 'Tiro al blanco',
    category: 'PRÁCTICA',
    code: 'TAB',
    tag: 'Tumba la lata cantada',
    icon: 'M8 18h10v24H8zM30 18h10v24H30zM19 6h10v24H19z',
    summary: 'La app canta un número y gana quien tumbe esa lata primero.',
    details: [
      'Preparad 6 latas o vasos numerados del 1 al 6.',
      'Al empezar se anuncia la lata bomba: tumbarla resta un punto (di «[tu nombre], bomba»).',
      'La app espera un rato y canta un número. Quien la tumbe primero dice «[tu nombre], mía».',
      'Si los dos lo decís casi a la vez (menos de 0,7 s), empate y no puntúa.',
      'Cada vez más rápido.',
    ],
    available: true,
    bars: [
      { k: 'Ritmo', v: 0.9 },
      { k: 'Movimiento', v: 0.2 },
      { k: 'Estrategia', v: 0.2 },
    ],
    defaults: { rounds: 10 },
    options: [{ key: 'rounds', label: 'Rondas', choices: [5, 10, 15].map((v) => ({ v, l: String(v) })) }],
    toggles: [],
    facts: (c) => [
      { k: 'Rondas', v: String(c.rounds), f: Number(c.rounds) / 15 },
      { k: 'Latas', v: '6', f: 0.6 },
    ],
  },
];

export const modeInfo = (id: ModeId) => MODES.find((m) => m.id === id)!;

export function defaultConfig(mode: ModeId): ModeConfig {
  return { ...modeInfo(mode).defaults };
}

/** Órdenes de voz extra según el modo */
export function extraCommands(mode: ModeId): ('mia' | 'bomba')[] {
  return mode === 'blanco' ? ['mia', 'bomba'] : [];
}
