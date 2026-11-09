// Tipos compartidos entre host, invitado y modo de prueba.

export type ModeId = 'duelo' | 'armas' | 'bomba' | 'cazador' | 'buscar' | 'blanco';

export interface Profile {
  name: string;
  color: string; // id de color (ver COLORS)
  callsign: string; // id de indicativo (ver CALLSIGNS)
}

export interface Player extends Profile {
  id: string; // 'A' (host) o 'B' (invitado)
  connected: boolean;
}

export interface DuelConfig {
  lives: number;
  timeLimitSec: number; // 0 = sin límite
  oneInChamber: boolean; // Una en la recámara
  confirmedKill: boolean; // Baja confirmada
}

export type ModeConfig = DuelConfig;

export type GamePhase =
  | 'countdown' // esperando a startAt (3-2-1-YA)
  | 'playing'
  | 'paused'
  | 'resuming' // cuenta atrás de 3 s tras "seguir"
  | 'finalizing' // golpe letal: ventana para anular antes de cerrar
  | 'ended';

export type GEventKind =
  | 'start'
  | 'hit'
  | 'undo'
  | 'pause'
  | 'resume'
  | 'timeup'
  | 'suddendeath'
  | 'lastlife'
  | 'win'
  | 'draw';

export interface GEvent {
  id: number;
  kind: GEventKind;
  gt: number; // tiempo de partida (ms, sin pausas)
  at: number; // reloj del host (ms epoch)
  by?: string; // jugador que lo origina
  shooter?: string;
  victim?: string;
  value?: number; // vidas restantes, etc.
  ref?: number; // evento anulado
  reason?: string;
  golden?: boolean;
}

export interface PlayerStats {
  hits: number; // aciertos
  taken: number; // recibidos
  streak: number;
  bestStreak: number;
}

export interface Game {
  mode: ModeId;
  config: ModeConfig;
  phase: GamePhase;
  startAt: number; // epoch host en que arranca (tras cuenta atrás)
  pausedAt: number | null;
  pauseTotal: number;
  resumeAt: number | null;
  finalizeAt: number | null;
  endedAt: number | null;
  pauseReason: string | null;
  lives: Record<string, number>;
  stats: Record<string, PlayerStats>;
  suddenDeath: boolean;
  winner: string | null; // null + ended = empate
  events: GEvent[];
  nextEventId: number;
}

export interface Room {
  code: string;
  players: Player[]; // [host, invitado]
  mode: ModeId;
  configs: Partial<Record<ModeId, ModeConfig>>;
  ready: Record<string, boolean>;
  screen: 'lobby' | 'mode' | 'game';
  wins: Record<string, number>; // marcador de la sesión
  game: Game | null;
  rev: number;
}

// Intenciones que un jugador envía al host
export type Intent =
  | { t: 'profile'; profile: Profile }
  | { t: 'selectMode'; mode: ModeId }
  | { t: 'config'; mode: ModeId; config: ModeConfig }
  | { t: 'ready'; ready: boolean }
  | { t: 'toLobby' }
  | { t: 'hit' } // "tocado": el emisor es la víctima
  | { t: 'undo' }
  | { t: 'pause' }
  | { t: 'resume' };

export interface ColorDef {
  id: string;
  name: string;
  hex: string;
}

export const COLORS: ColorDef[] = [
  { id: 'cian', name: 'Cian', hex: '#2bf0ff' },
  { id: 'rojo', name: 'Rojo', hex: '#ff3b5c' },
  { id: 'lima', name: 'Lima', hex: '#a6ff2e' },
  { id: 'naranja', name: 'Naranja', hex: '#ff9a1f' },
  { id: 'violeta', name: 'Violeta', hex: '#b46bff' },
  { id: 'oro', name: 'Oro', hex: '#ffd23f' },
];

export interface CallsignDef {
  id: string;
  label: string;
  aliases: string[]; // transcripciones erróneas habituales
}

// Lista revisada: consonante inicial y vocal tónica distintas entre sí,
// y ninguna se parece a las órdenes (tocado, estado, pausa, seguir, anular, mía).
export const CALLSIGNS: CallsignDef[] = [
  { id: 'lobo', label: 'Lobo', aliases: ['lobos', 'globo', 'lo bo'] },
  { id: 'tigre', label: 'Tigre', aliases: ['tigres', 'tigré'] },
  { id: 'cobra', label: 'Cobra', aliases: ['cobras', 'kobra', 'cobra.'] },
  { id: 'rayo', label: 'Rayo', aliases: ['rallo', 'rayos', 'raio'] },
  { id: 'fenix', label: 'Fénix', aliases: ['felix', 'phoenix', 'fenis', 'fénis'] },
  { id: 'halcon', label: 'Halcón', aliases: ['alcon', 'halcones', 'falcon'] },
  { id: 'delta', label: 'Delta', aliases: ['delta.', 'deltas'] },
  { id: 'puma', label: 'Puma', aliases: ['pumas', 'puma.'] },
];

export const colorHex = (id: string) => COLORS.find((c) => c.id === id)?.hex ?? '#2bf0ff';
export const callsignLabel = (id: string) => CALLSIGNS.find((c) => c.id === id)?.label ?? id;
