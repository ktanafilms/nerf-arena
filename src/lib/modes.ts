import type { DuelConfig, ModeConfig, ModeId } from './types';

export interface ModeInfo {
  id: ModeId;
  name: string;
  category: 'COMBATE' | 'MISIÓN' | 'PRÁCTICA';
  summary: string;
  details: string[];
  available: boolean;
  code: string; // etiqueta corta para el HUD
}

export const MODES: ModeInfo[] = [
  {
    id: 'duelo',
    name: 'Duelo',
    category: 'COMBATE',
    code: 'DUE',
    summary: '3 vidas cada uno; gana quien deje al otro sin ninguna.',
    details: [
      'Cuando te den, di "[tu indicativo], tocado". La víctima siempre reporta.',
      'Con la última vida tu móvil late como un corazón.',
      'Si se acaba el tiempo gana quien tenga más vidas. Con empate: muerte súbita, el siguiente acierto gana.',
      'Puedes recoger dardos libremente salvo en las variantes.',
      '"Anular" deshace tu último tocado si lo dices en 5 segundos.',
    ],
    available: true,
  },
  {
    id: 'armas',
    name: 'Juego de armas',
    category: 'COMBATE',
    code: 'ARM',
    summary: 'Cada acierto te sube de nivel y te pone más difícil disparar; gana quien complete todos los niveles.',
    details: [],
    available: false,
  },
  {
    id: 'bomba',
    name: 'Bomba',
    category: 'COMBATE',
    code: 'BOM',
    summary: 'Quien tiene la bomba solo se la quita de encima dándole al otro; pierde quien la tenga cuando explote.',
    details: [],
    available: false,
  },
  {
    id: 'cazador',
    name: 'Cazador y presa',
    category: 'MISIÓN',
    code: 'CAZ',
    summary: 'Uno caza y el otro aguanta todo lo que pueda; luego cambiáis y gana quien sobreviva más.',
    details: [],
    available: false,
  },
  {
    id: 'buscar',
    name: 'Buscar y destruir',
    category: 'MISIÓN',
    code: 'BYD',
    summary: 'Uno esconde su móvil como bomba y lo defiende; el otro tiene que desactivarlo sin que le den.',
    details: [],
    available: false,
  },
  {
    id: 'blanco',
    name: 'Tiro al blanco',
    category: 'PRÁCTICA',
    code: 'TAB',
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
