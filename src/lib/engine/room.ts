// Lógica autoritativa de la sala. Solo la ejecuta el host (o el modo de prueba).
// Todas las funciones mutan la sala y devuelven true si ha cambiado algo.

import type { DuelConfig, Game, GEvent, Intent, Profile, Room } from '../types';
import { COLORS, CALLSIGNS } from '../types';
import { defaultConfig } from '../modes';

export const COUNTDOWN_MS = 3600; // 3-2-1 (+ margen) antes del ¡YA!
export const RESUME_MS = 3000;
export const UNDO_MS = 5000;
export const CONFIRM_MS = 10000;

interface UndoEntry {
  ref: number;
  by: string;
  until: number;
  prev: Pick<Game, 'lives' | 'stats' | 'suddenDeath'>;
}

// La pila de deshacer vive fuera del estado sincronizado.
const undoStacks = new WeakMap<Game, UndoEntry[]>();

export function createRoom(code: string, host: Profile): Room {
  return {
    code,
    players: [{ id: 'A', ...host, connected: true }],
    mode: 'duelo',
    configs: {},
    ready: {},
    screen: 'lobby',
    wins: { A: 0, B: 0 },
    game: null,
    rev: 0,
  };
}

/** Añade o actualiza al invitado y resuelve conflictos de color/indicativo. */
export function joinGuest(room: Room, profile: Profile): void {
  const existing = room.players.find((p) => p.id === 'B');
  const fixed = resolveConflicts(room, 'B', profile);
  if (existing) Object.assign(existing, fixed, { connected: true });
  else room.players.push({ id: 'B', ...fixed, connected: true });
}

function resolveConflicts(room: Room, pid: string, profile: Profile): Profile {
  const other = room.players.find((p) => p.id !== pid);
  if (!other) return profile;
  const p = { ...profile };
  if (p.color === other.color) p.color = COLORS.find((c) => c.id !== other.color)!.id;
  if (p.callsign === other.callsign) p.callsign = CALLSIGNS.find((c) => c.id !== other.callsign)!.id;
  return p;
}

export function configFor(room: Room, mode = room.mode) {
  return room.configs[mode] ?? defaultConfig(mode);
}

export function gameTime(g: Game, now: number): number {
  if (now < g.startAt) return 0;
  const frozen = g.endedAt ?? g.pausedAt;
  const t = (frozen ?? now) - g.startAt - g.pauseTotal;
  return Math.max(0, t);
}

function push(g: Game, now: number, e: Omit<GEvent, 'id' | 'gt' | 'at'>): GEvent {
  const ev: GEvent = { id: g.nextEventId++, gt: gameTime(g, now), at: now, ...e };
  g.events.push(ev);
  return ev;
}

function newGame(room: Room, now: number): Game {
  const cfg = configFor(room) as DuelConfig;
  const lives: Record<string, number> = {};
  const stats: Game['stats'] = {};
  for (const p of room.players) {
    lives[p.id] = cfg.lives;
    stats[p.id] = { hits: 0, taken: 0, streak: 0, bestStreak: 0 };
  }
  return {
    mode: room.mode,
    config: { ...cfg },
    phase: 'countdown',
    startAt: now + COUNTDOWN_MS,
    pausedAt: null,
    pauseTotal: 0,
    resumeAt: null,
    finalizeAt: null,
    endedAt: null,
    pauseReason: null,
    lives,
    stats,
    suddenDeath: false,
    winner: null,
    events: [],
    nextEventId: 1,
  };
}

const other = (room: Room, pid: string) => room.players.find((p) => p.id !== pid)?.id ?? pid;

export function applyIntent(room: Room, pid: string, it: Intent, now: number): boolean {
  const g = room.game;
  switch (it.t) {
    case 'profile': {
      const fixed = resolveConflicts(room, pid, it.profile);
      const p = room.players.find((x) => x.id === pid);
      if (!p) return false;
      Object.assign(p, fixed);
      return true;
    }
    case 'selectMode':
      if (room.screen === 'game' && g && g.phase !== 'ended') return false;
      room.mode = it.mode;
      room.screen = 'mode';
      room.ready = {};
      room.game = null;
      return true;
    case 'config':
      room.configs[it.mode] = it.config;
      room.ready = {};
      return true;
    case 'toLobby':
      if (g && g.phase !== 'ended') return false;
      room.screen = 'lobby';
      room.ready = {};
      room.game = null;
      return true;
    case 'ready': {
      if (room.screen === 'game' && g && g.phase !== 'ended') return false;
      room.ready[pid] = it.ready;
      const all = room.players.length === 2 && room.players.every((p) => room.ready[p.id]);
      if (all) {
        room.ready = {};
        room.screen = 'game';
        room.game = newGame(room, now);
        undoStacks.set(room.game, []);
      }
      return true;
    }
    case 'hit':
      return g ? hit(room, g, pid, now) : false;
    case 'undo':
      return g ? undo(room, g, pid, now) : false;
    case 'pause':
      return g ? pause(g, pid, now, 'voz') : false;
    case 'resume':
      // No se reanuda mientras falte alguien: se hará solo al reconectar
      if (room.players.some((p) => !p.connected)) return false;
      return g ? resume(g, pid, now) : false;
  }
}

function hit(room: Room, g: Game, victim: string, now: number): boolean {
  if (g.phase !== 'playing') return false;
  const shooter = other(room, victim);
  const stack = undoStacks.get(g) ?? [];
  const prev = structuredClone({ lives: g.lives, stats: g.stats, suddenDeath: g.suddenDeath });
  const dmg = g.suddenDeath ? g.lives[victim] : 1;
  g.lives[victim] = Math.max(0, g.lives[victim] - dmg);
  const s = g.stats[shooter];
  s.hits++;
  s.streak++;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  g.stats[victim].taken++;
  g.stats[victim].streak = 0;
  const ev = push(g, now, { kind: 'hit', shooter, victim, value: g.lives[victim], by: victim });
  const windowMs = (g.config as DuelConfig).confirmedKill ? CONFIRM_MS : UNDO_MS;
  stack.push({ ref: ev.id, by: victim, until: now + windowMs, prev });
  undoStacks.set(g, stack);

  if (g.lives[victim] <= 0) {
    g.phase = 'finalizing';
    g.endedAt = now;
    g.finalizeAt = now + windowMs;
    g.winner = shooter;
  } else if (g.lives[victim] === 1 && (g.config as DuelConfig).lives > 1) {
    push(g, now, { kind: 'lastlife', victim });
  }
  return true;
}

function undo(room: Room, g: Game, pid: string, now: number): boolean {
  if (!['playing', 'finalizing', 'paused', 'resuming'].includes(g.phase)) return false;
  const stack = undoStacks.get(g) ?? [];
  // Último tocado propio aún dentro de su ventana
  for (let i = stack.length - 1; i >= 0; i--) {
    const u = stack[i];
    if (u.by !== pid) continue;
    if (now > u.until) return false;
    stack.splice(i, 1);
    const prev = structuredClone(u.prev);
    g.lives = prev.lives;
    g.stats = prev.stats;
    g.suddenDeath = prev.suddenDeath;
    if (g.phase === 'finalizing') {
      g.phase = 'playing';
      g.finalizeAt = null;
      // el tiempo transcurrido durante la ventana sigue contando
      g.endedAt = null;
      g.winner = null;
    }
    push(g, now, { kind: 'undo', ref: u.ref, by: pid });
    void room;
    return true;
  }
  return false;
}

function pause(g: Game, pid: string, now: number, reason: string): boolean {
  if (g.phase === 'playing') {
    g.pausedAt = now;
  } else if (g.phase === 'resuming') {
    g.resumeAt = null; // seguía congelado: mantenemos pausedAt
  } else return false;
  g.phase = 'paused';
  g.pauseReason = reason;
  push(g, now, { kind: 'pause', by: pid, reason });
  return true;
}

function resume(g: Game, pid: string, now: number): boolean {
  if (g.phase !== 'paused') return false;
  g.phase = 'resuming';
  g.resumeAt = now + RESUME_MS;
  push(g, now, { kind: 'resume', by: pid });
  return true;
}

export function setConnected(room: Room, pid: string, connected: boolean, now: number): boolean {
  const p = room.players.find((x) => x.id === pid);
  if (!p || p.connected === connected) return false;
  p.connected = connected;
  const g = room.game;
  if (g) {
    if (!connected) pause(g, pid, now, 'desconexión');
    else if (g.phase === 'paused' && g.pauseReason === 'desconexión' && room.players.every((x) => x.connected))
      resume(g, pid, now);
  }
  return true;
}

/** Transiciones dependientes del tiempo. Llamar ~10 veces por segundo en el host. */
export function tick(room: Room, now: number): boolean {
  const g = room.game;
  if (!g) return false;
  let changed = false;

  if (g.phase === 'countdown' && now >= g.startAt) {
    g.phase = 'playing';
    push(g, now, { kind: 'start' });
    changed = true;
  }

  if (g.phase === 'resuming' && g.resumeAt && now >= g.resumeAt) {
    g.pauseTotal += g.resumeAt - (g.pausedAt ?? g.resumeAt);
    g.pausedAt = null;
    g.resumeAt = null;
    g.pauseReason = null;
    g.phase = 'playing';
    changed = true;
  }

  const cfg = g.config as DuelConfig;
  if (g.phase === 'playing' && cfg.timeLimitSec > 0 && !g.suddenDeath) {
    if (gameTime(g, now) >= cfg.timeLimitSec * 1000) {
      push(g, now, { kind: 'timeup' });
      const [a, b] = room.players.map((p) => p.id);
      if (g.lives[a] !== g.lives[b]) {
        g.winner = g.lives[a] > g.lives[b] ? a : b;
        g.endedAt = now;
        finish(room, g, now);
      } else {
        g.suddenDeath = true;
        push(g, now, { kind: 'suddendeath' });
      }
      changed = true;
    }
  }

  if (g.phase === 'finalizing' && g.finalizeAt && now >= g.finalizeAt) {
    finish(room, g, now);
    changed = true;
  }
  return changed;
}

function finish(room: Room, g: Game, now: number) {
  g.phase = 'ended';
  g.finalizeAt = null;
  if (!g.endedAt) g.endedAt = now;
  if (g.winner) {
    room.wins[g.winner] = (room.wins[g.winner] ?? 0) + 1;
    push(g, now, { kind: 'win', by: g.winner });
  } else push(g, now, { kind: 'draw' });
  undoStacks.set(g, []);
}

/** Restaura la pila de deshacer tras recargar el host (no se recupera, se vacía). */
export function ensureUndo(g: Game) {
  if (!undoStacks.has(g)) undoStacks.set(g, []);
}
