import type { DuelConfig, ModeConfig, ModeId } from './types';

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
  color: string; // color propio del modo en la ficha
  bars: { k: string; v: number }[]; // "estadísticas" del modo, 0..1
}

export const MODES: ModeInfo[] = [
  {
    id: 'duelo',
    bars: [{ k: 'Ritmo', v: 0.75 }, { k: 'Movimiento', v: 0.6 }, { k: 'Estrategia', v: 0.4 }],
    color: '#ff2e3a',
    name: 'Duelo',
    category: 'COMBATE',
    code: 'DUE',
    tag: '3 vidas. Último en pie.',
    icon: 'M37 24a13 13 0 1 1-26 0 13 13 0 1 1 26 0zM24 4v12M24 32v12M4 24h12M32 24h12M26 24a2 2 0 1 1-4 0 2 2 0 1 1 4 0z',
    summary: '3 vidas cada uno; gana quien deje al otro sin ninguna.',
    details: [
      'Si te dan, di «[tu nombre], tocado».',
      'Se acaba el tiempo: gana quien tenga más vidas.',
      'Empate: muerte súbita, el siguiente acierto gana.',
      '«Anular» deshace tu tocado en 5 s.',
      'Recoge dardos cuando quieras (salvo variantes).',
    ],
    available: true,
  },
  {
    id: 'armas',
    bars: [{ k: 'Ritmo', v: 0.85 }, { k: 'Movimiento', v: 0.5 }, { k: 'Estrategia', v: 0.5 }],
    color: '#ffb020',
    name: 'Juego de armas',
    category: 'COMBATE',
    code: 'ARM',
    tag: 'Acierta y sube de nivel',
    icon: 'M6 40h8v-8h8v-8h8v-8h8V8h4M30 8h12v12',
    summary: 'Cada acierto te sube de nivel y te pone más difícil disparar; gana quien complete todos los niveles.',
    details: [],
    available: false,
  },
  {
    id: 'bomba',
    bars: [{ k: 'Ritmo', v: 1 }, { k: 'Movimiento', v: 0.8 }, { k: 'Estrategia', v: 0.3 }],
    color: '#ff5a1f',
    name: 'Bomba',
    category: 'COMBATE',
    code: 'BOM',
    tag: 'Pásala disparando',
    icon: 'M21 16a14 14 0 1 0 6 0M24 16V9h6M30 9l5-4M36 9h4M34 13l3 3',
    summary: 'Quien tiene la bomba solo se la quita de encima dándole al otro; pierde quien la tenga cuando explote.',
    details: [],
    available: false,
  },
  {
    id: 'cazador',
    bars: [{ k: 'Ritmo', v: 0.4 }, { k: 'Movimiento', v: 0.7 }, { k: 'Estrategia', v: 0.9 }],
    color: '#1fd27c',
    name: 'Cazador y presa',
    category: 'MISIÓN',
    code: 'CAZ',
    tag: 'Escóndete y aguanta',
    icon: 'M4 24s7-12 20-12 20 12 20 12-7 12-20 12S4 24 4 24zM24 30a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
    summary: 'Uno caza y el otro aguanta todo lo que pueda; luego cambiáis y gana quien sobreviva más.',
    details: [],
    available: false,
  },
  {
    id: 'buscar',
    bars: [{ k: 'Ritmo', v: 0.6 }, { k: 'Movimiento', v: 0.8 }, { k: 'Estrategia', v: 1 }],
    color: '#19c6d8',
    name: 'Buscar y destruir',
    category: 'MISIÓN',
    code: 'BYD',
    tag: 'Planta y defiende',
    icon: 'M15 6h18v36H15zM20 36h8M24 14v10l6 4',
    summary: 'Uno esconde su móvil como bomba y lo defiende; el otro tiene que desactivarlo sin que le den.',
    details: [],
    available: false,
  },
  {
    id: 'blanco',
    bars: [{ k: 'Ritmo', v: 0.9 }, { k: 'Movimiento', v: 0.2 }, { k: 'Estrategia', v: 0.2 }],
    color: '#9b6bff',
    name: 'Tiro al blanco',
    category: 'PRÁCTICA',
    code: 'TAB',
    tag: 'Tumba la lata cantada',
    icon: 'M8 18h10v24H8zM30 18h10v24H30zM19 6h10v24H19z',
    summary: 'La app canta un número y gana quien tumbe esa lata primero.',
    details: [],
    available: false,
  },
];

export const modeInfo = (id: ModeId) => MODES.find((m) => m.id === id)!;

export const DEFAULT_DUEL: DuelConfig = {
  lives: 3,
  timeLimitSec: 300,
  oneInChamber: false,
  confirmedKill: false,
};

export function defaultConfig(mode: ModeId): ModeConfig {
  switch (mode) {
    default:
      return { ...DEFAULT_DUEL };
  }
}
