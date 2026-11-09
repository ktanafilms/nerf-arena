// Tipos compartidos entre host, invitado y modo de prueba.

export type ModeId = 'duelo' | 'armas' | 'bomba' | 'cazador' | 'buscar' | 'blanco';

export interface Profile {
  name: string; // nombre del jugador = indicativo de voz
  color: string; // id de color (ver COLORS)
  icon: string; // id de icono (ver ICONS)
  aliases: string[]; // cómo transcribe el móvil tu nombre (aprendido en la prueba de voz)
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
  ink: string; // color de texto legible encima
}

export const COLORS: ColorDef[] = [
  { id: 'naranja', name: 'Naranja', hex: '#ff5a1f', ink: '#120a06' },
  { id: 'azul', name: 'Azul', hex: '#2f6bff', ink: '#ffffff' },
  { id: 'verde', name: 'Verde', hex: '#1fd27c', ink: '#06140d' },
  { id: 'rosa', name: 'Rosa', hex: '#ff3d8b', ink: '#16050c' },
  { id: 'amarillo', name: 'Amarillo', hex: '#ffd60a', ink: '#141100' },
  { id: 'violeta', name: 'Violeta', hex: '#7b4dff', ink: '#ffffff' },
];

export const colorDef = (id: string) => COLORS.find((c) => c.id === id) ?? COLORS[0];
export const colorHex = (id: string) => colorDef(id).hex;
export const colorInk = (id: string) => colorDef(id).ink;

/** Palabras con las que la voz reconoce a un jugador */
export const callsignOf = (p: Pick<Profile, 'name' | 'aliases'> | null | undefined): string[] =>
  p ? [p.name, ...(p.aliases ?? [])].filter(Boolean) : [];
