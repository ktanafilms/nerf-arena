// Lógica autoritativa de la sala. Solo la ejecuta el host (o el modo de prueba).
// Todas las funciones mutan la sala y devuelven true si ha cambiado algo.
// Lo común (lobby, pausas, rondas, confirmación y "anular") vive aquí;
// las reglas de cada modo, en logic.ts.

import type { Game, GEvent, Intent, Outcome, Profile, Room } from '../types';
import { COLORS } from '../types';
import { defaultConfig, modeInfo } from '../modes';
import { LOGIC, type Core } from './logic';

export const COUNTDOWN_MS = 3600; // 3-2-1 (+ margen) antes del ¡YA!
export const RESUME_MS = 3000;
export const UNDO_MS = 5000;
export const CONFIRM_MS = 10000;
export const INTERMISSION_MS = 7000;

interface UndoEntry {
  ref: number;
  by: string;
  until: number;
  prev: { m: any; stats: Game['stats'] };
}

// Fuera del estado sincronizado: pila de deshacer y secretos del host (p. ej. la mecha oculta)
const undoStacks = new WeakMap<Game, UndoEntry[]>();
export const secrets = new WeakMap<Game, any>();

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

/** Añade o actualiza al invitado y resuelve conflictos de color. */
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
  return p;
}

export function configFor(room: Room, mode = room.mode) {
  return { ...defaultConfig(mode), ...(room.configs[mode] ?? {}) };
}

export function gameTime(g: Game, now: number): number {
  if (now < g.startAt) return 0;
  const frozen = g.endedAt ?? g.pausedAt;
  const t = (frozen ?? now) - g.startAt - g.pauseTotal;
  return Math.max(0, t);
}

const otherOf = (room: Room, pid: string) => room.players.find((p) => p.id !== pid)?.id ?? pid;

/** Contexto que reciben las reglas de cada modo. */
function core(room: Room, g: Game, now: number): Core {
  const c: Core = {
    room,
    g,
    now,
    gt: gameTime(g, now),
    other: (pid) => otherOf(room, pid),
    push: (e) => {
      const ev: GEvent = { id: g.nextEventId++, gt: gameTime(g, now), at: now, ...e };
      ev.sb = LOGIC[g.mode].scoreboard(room, g);
      g.events.push(ev);
      return ev;
    },
    credit: (shooter, victim) => {
      const s = g.stats[shooter];
      s.hits++;
      s.streak++;
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      g.stats[victim].taken++;
      g.stats[victim].streak = 0;
    },
    snapshot: () => structuredClone({ m: g.m, stats: g.stats }),
    addUndo: (ev, by, prev, windowMs = UNDO_MS) => {
      const stack = undoStacks.get(g) ?? [];
      stack.push({ ref: ev.id, by, until: now + windowMs, prev });
      undoStacks.set(g, stack);
    },
    confirmEnd: (o, windowMs = UNDO_MS) => {
      g.pending = o;
      g.phase = 'finalizing';
      g.finalizeAt = now + windowMs;
    },
    resolve: (o) => resolve(room, g, now, o),
    secret: () => {
      if (!secrets.has(g)) secrets.set(g, {});
      return secrets.get(g);
    },
  };
  return c;
}

function newGame(room: Room, now: number): Game {
  const stats: Game['stats'] = {};
  const roundWins: Record<string, number> = {};
  for (const p of room.players) {
    stats[p.id] = { hits: 0, taken: 0, streak: 0, bestStreak: 0 };
    roundWins[p.id] = 0;
  }
  const g: Game = {
    mode: room.mode,
    config: configFor(room),
    phase: 'countdown',
    startAt: now + COUNTDOWN_MS,
    pausedAt: null,
    pauseTotal: 0,
    resumeAt: null,
    finalizeAt: null,
    endedAt: null,
    pauseReason: null,
    prePause: null,
    stats,
    winner: null,
    events: [],
    nextEventId: 1,
    round: 1,
    roundWins,
    interUntil: null,
    pending: null,
    m: {},
  };
  undoStacks.set(g, []);
  LOGIC[g.mode].init(core(room, g, now));
  return g;
}

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
      if (!modeInfo(room.mode).available) return false;
      room.ready[pid] = it.ready;
      const all = room.players.length === 2 && room.players.every((p) => room.ready[p.id]);
      if (all) {
        room.ready = {};
        room.screen = 'game';
        room.game = newGame(room, now);
      }
      return true;
    }
    case 'hit': {
      if (!g || g.phase !== 'playing') return false;
      const c = core(room, g, now);
      const prev = c.snapshot();
      const ev = LOGIC[g.mode].hit(c, pid);
      if (!ev) return false;
      if (!undoStacks.get(g)?.some((u) => u.ref === ev.id)) c.addUndo(ev, pid, prev, LOGIC[g.mode].undoWindow?.(g));
      return true;
    }
    case 'undo':
      return g ? undo(room, g, pid, now) : false;
    case 'pause':
      return g ? pause(room, g, pid, now, 'voz') : false;
    case 'resume':
      // No se reanuda mientras falte alguien: se hará solo al reconectar
      if (room.players.some((p) => !p.connected)) return false;
      return g ? resume(room, g, pid, now) : false;
    case 'claim':
    case 'bombcan':
    case 'defuse': {
      if (!g || g.phase !== 'playing') return false;
      return LOGIC[g.mode].intent?.(core(room, g, now), pid, it) ?? false;
    }
  }
}

function undo(room: Room, g: Game, pid: string, now: number): boolean {
  if (!['playing', 'finalizing', 'paused', 'resuming'].includes(g.phase)) return false;
  const stack = undoStacks.get(g) ?? [];
  // Última acción propia aún dentro de su ventana
  for (let i = stack.length - 1; i >= 0; i--) {
    const u = stack[i];
    if (u.by !== pid) continue;
    if (now > u.until) return false;
    stack.splice(i, 1);
    const prev = structuredClone(u.prev);
    g.m = prev.m;
    g.stats = prev.stats;
    if (g.phase === 'finalizing') {
      g.phase = 'playing';
      g.finalizeAt = null;
      g.pending = null;
    }
    core(room, g, now).push({ kind: 'undo', ref: u.ref, by: pid });
    return true;
  }
  return false;
}

function pause(room: Room, g: Game, pid: string, now: number, reason: string): boolean {
  if (g.phase === 'playing' || g.phase === 'intermission') {
    g.prePause = g.phase;
    g.pausedAt = now;
  } else if (g.phase === 'resuming') {
    g.resumeAt = null; // seguía congelado: mantenemos pausedAt
  } else return false;
  g.phase = 'paused';
  g.pauseReason = reason;
  core(room, g, now).push({ kind: 'pause', by: pid, reason });
  return true;
}

function resume(room: Room, g: Game, pid: string, now: number): boolean {
  if (g.phase !== 'paused') return false;
  g.phase = 'resuming';
  g.resumeAt = now + RESUME_MS;
  core(room, g, now).push({ kind: 'resume', by: pid });
  return true;
}

export function setConnected(room: Room, pid: string, connected: boolean, now: number): boolean {
  const p = room.players.find((x) => x.id === pid);
  if (!p || p.connected === connected) return false;
  p.connected = connected;
  const g = room.game;
  if (g) {
    if (!connected) pause(room, g, pid, now, 'desconexión');
    else if (g.phase === 'paused' && g.pauseReason === 'desconexión' && room.players.every((x) => x.connected))
      resume(room, g, pid, now);
  }
  return true;
}

/** Cierra una ronda o la partida. */
function resolve(room: Room, g: Game, now: number, o: Outcome) {
  g.pending = null;
  g.finalizeAt = null;
  const c = core(room, g, now);
  if (o.scope === 'game') return finish(room, g, now, o.winner);
  if (o.winner) g.roundWins[o.winner] = (g.roundWins[o.winner] ?? 0) + 1;
  c.push({ kind: 'roundend', by: o.winner ?? undefined, value: g.round, reason: o.reason });
  const w = LOGIC[g.mode].matchWinner(c);
  if (w !== undefined) return finish(room, g, now, w);
  g.phase = 'intermission';
  g.interUntil = c.gt + INTERMISSION_MS;
  undoStacks.set(g, []);
}

function finish(room: Room, g: Game, now: number, winner: string | null) {
  g.phase = 'ended';
  g.finalizeAt = null;
  g.pending = null;
  g.winner = winner;
  const c = core(room, g, now);
  if (winner) {
    room.wins[winner] = (room.wins[winner] ?? 0) + 1;
    c.push({ kind: 'win', by: winner });
  } else c.push({ kind: 'draw' });
  g.endedAt = now;
  undoStacks.set(g, []);
}

/** Transiciones dependientes del tiempo. Llamar ~10 veces por segundo en el host. */
export function tick(room: Room, now: number): boolean {
  const g = room.game;
  if (!g) return false;
  let changed = false;

  if (g.phase === 'countdown' && now >= g.startAt) {
    g.phase = 'playing';
    const c = core(room, g, now);
    LOGIC[g.mode].startRound(c);
    c.push({ kind: 'start' });
    changed = true;
  }

  if (g.phase === 'resuming' && g.resumeAt && now >= g.resumeAt) {
    g.pauseTotal += g.resumeAt - (g.pausedAt ?? g.resumeAt);
    g.pausedAt = null;
    g.resumeAt = null;
    g.pauseReason = null;
    g.phase = g.prePause ?? 'playing';
    g.prePause = null;
    changed = true;
  }

  if (g.phase === 'intermission' && g.interUntil !== null && gameTime(g, now) >= g.interUntil) {
    g.round++;
    g.interUntil = null;
    g.phase = 'playing';
    const c = core(room, g, now);
    LOGIC[g.mode].startRound(c);
    c.push({ kind: 'roundstart', value: g.round });
    changed = true;
  }

  if (g.phase === 'playing') {
    if (LOGIC[g.mode].tick(core(room, g, now))) changed = true;
  }

  if (g.phase === 'finalizing' && g.finalizeAt && now >= g.finalizeAt && g.pending) {
    resolve(room, g, now, g.pending);
    changed = true;
  }
  return changed;
}

/** Restaura la pila de deshacer tras recargar el host (no se recupera, se vacía). */
export function ensureUndo(g: Game) {
  if (!undoStacks.has(g)) undoStacks.set(g, []);
}
