// Reglas de cada modo. Las ejecuta solo el host (o el modo de prueba) a través del motor común.

import type { Game, GEvent, Intent, ModeId, Outcome, Room, Scoreboard, SbSide } from '../types';
import { LEVELS } from '../modes';

export interface Core {
  room: Room;
  g: Game;
  now: number; // reloj del host
  gt: number; // tiempo de partida
  other(pid: string): string;
  push(e: Omit<GEvent, 'id' | 'gt' | 'at'>): GEvent;
  credit(shooter: string, victim: string): void;
  snapshot(): { m: any; stats: Game['stats'] };
  addUndo(ev: GEvent, by: string, prev: { m: any; stats: Game['stats'] }, windowMs?: number): void;
  confirmEnd(o: Outcome, windowMs?: number): void;
  resolve(o: Outcome): void;
  secret(): any; // datos ocultos del host (no se sincronizan)
}

export interface ModeLogic {
  init(c: Core): void;
  startRound(c: Core): void;
  /** "tocado" del jugador `victim`. Devuelve el evento (se podrá anular) o null si no cuenta. */
  hit(c: Core, victim: string): GEvent | null;
  intent?(c: Core, pid: string, it: Intent): boolean;
  tick(c: Core): boolean;
  /** Tras cerrar una ronda: ganador de la partida, null = empate, undefined = sigue */
  matchWinner(c: Core): string | null | undefined;
  scoreboard(room: Room, g: Game): Scoreboard;
  undoWindow?(g: Game): number;
}

const ids = (room: Room) => room.players.map((p) => p.id);
const per = <T>(room: Room, v: () => T): Record<string, T> => Object.fromEntries(ids(room).map((id) => [id, v()]));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
export const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const sides = (room: Room, f: (pid: string) => SbSide) => {
  const [a, b] = ids(room);
  return { A: f(a ?? 'A'), B: f(b ?? 'B') };
};
const num = (g: Game, k: string) => Number(g.config[k]);

// ───────────────────────────── DUELO ─────────────────────────────
const duelo: ModeLogic = {
  init(c) {
    c.g.m = { lives: per(c.room, () => num(c.g, 'lives')), sudden: false };
  },
  startRound() {},
  undoWindow: (g) => (g.config.confirmedKill ? 10000 : 5000),
  hit(c, victim) {
    const { m } = c.g;
    const shooter = c.other(victim);
    const dmg = m.sudden ? m.lives[victim] : 1;
    m.lives[victim] = Math.max(0, m.lives[victim] - dmg);
    c.credit(shooter, victim);
    const ev = c.push({ kind: 'hit', shooter, victim, by: victim, value: m.lives[victim] });
    if (m.lives[victim] <= 0) {
      c.confirmEnd({ scope: 'game', winner: shooter, reason: 'eliminado' }, duelo.undoWindow!(c.g));
    } else if (m.lives[victim] === 1 && num(c.g, 'lives') > 1) {
      c.push({ kind: 'lastlife', victim });
    }
    return ev;
  },
  tick(c) {
    const { m } = c.g;
    const limit = num(c.g, 'timeLimitSec') * 1000;
    if (!limit || m.sudden || c.gt < limit) return false;
    c.push({ kind: 'timeup' });
    const [a, b] = ids(c.room);
    if (m.lives[a] !== m.lives[b]) c.resolve({ scope: 'game', winner: m.lives[a] > m.lives[b] ? a : b, reason: 'tiempo' });
    else {
      m.sudden = true;
      c.push({ kind: 'suddendeath' });
    }
    return true;
  },
  matchWinner: () => undefined,
  scoreboard(room, g) {
    const limit = num(g, 'timeLimitSec') * 1000;
    return {
      ...sides(room, (pid) => ({ main: String(g.m.lives?.[pid] ?? 0), sub: 'vidas' })),
      center: g.m.sudden ? 'Muerte súbita' : '',
      clock: limit && !g.m.sudden ? { kind: 'down', ref: limit } : { kind: 'up', ref: 0 },
    };
  },
};

// ───────────────────────────── JUEGO DE ARMAS ─────────────────────────────
const armas: ModeLogic = {
  init(c) {
    c.g.m = { level: per(c.room, () => 1), sudden: false, humiliations: per(c.room, () => 0) };
  },
  startRound() {},
  hit(c, victim) {
    const { m } = c.g;
    const shooter = c.other(victim);
    c.credit(shooter, victim);
    if (m.sudden || m.level[shooter] === 6) {
      const ev = c.push({ kind: 'hit', shooter, victim, by: victim, value: m.level[shooter] });
      c.confirmEnd({ scope: 'game', winner: shooter, reason: m.sudden ? 'muerte súbita' : 'nivel final' });
      return ev;
    }
    m.level[shooter]++;
    const ev = c.push({ kind: 'levelup', shooter, victim, by: shooter, value: m.level[shooter] });
    if (m.level[victim] === 6) {
      m.level[victim] = 5;
      m.humiliations[victim]++;
      c.push({ kind: 'leveldown', by: victim, value: 5 });
    }
    return ev;
  },
  tick(c) {
    const { m } = c.g;
    const limit = num(c.g, 'timeLimitSec') * 1000;
    if (!limit || m.sudden || c.gt < limit) return false;
    c.push({ kind: 'timeup' });
    const [a, b] = ids(c.room);
    if (m.level[a] !== m.level[b]) c.resolve({ scope: 'game', winner: m.level[a] > m.level[b] ? a : b, reason: 'tiempo' });
    else {
      m.sudden = true;
      c.push({ kind: 'suddendeath' });
    }
    return true;
  },
  matchWinner: () => undefined,
  scoreboard(room, g) {
    const limit = num(g, 'timeLimitSec') * 1000;
    return {
      ...sides(room, (pid) => {
        const l = g.m.level?.[pid] ?? 1;
        return { main: String(l), sub: LEVELS[l - 1]?.short ?? '' };
      }),
      center: g.m.sudden ? 'Muerte súbita' : 'Nivel',
      clock: limit && !g.m.sudden ? { kind: 'down', ref: limit } : { kind: 'up', ref: 0 },
    };
  },
};

// ───────────────────────────── BOMBA ─────────────────────────────
const NO_RETURN_MS = 3000;
const bomba: ModeLogic = {
  init(c) {
    c.g.m = { holder: null, protectedUntil: 0, tension: 0, passes: per(c.room, () => 0), explosions: per(c.room, () => 0) };
  },
  startRound(c) {
    const { m } = c.g;
    m.holder = pick(ids(c.room));
    m.protectedUntil = 0;
    m.tension = 0;
    const s = c.secret();
    s.fuseStart = c.gt;
    s.fuseEnd = c.gt + rnd(45000, 90000);
    c.push({ kind: 'bombstart', by: m.holder, value: c.g.round });
  },
  hit(c, victim) {
    const { m } = c.g;
    const shooter = c.other(victim);
    if (m.holder !== shooter) return null; // te ha dado quien no lleva la bomba: no cuenta
    if (c.gt < m.protectedUntil) {
      c.push({ kind: 'blocked', by: shooter });
      return null;
    }
    m.holder = victim;
    m.protectedUntil = c.gt + NO_RETURN_MS;
    m.passes[shooter]++;
    c.credit(shooter, victim);
    return c.push({ kind: 'bombpass', shooter, victim, by: victim });
  },
  tick(c) {
    const { m } = c.g;
    const s = c.secret();
    if (!s.fuseEnd) {
      // el host se recargó: mecha nueva y corta
      s.fuseStart = c.gt;
      s.fuseEnd = c.gt + rnd(20000, 40000);
    }
    if (c.gt >= s.fuseEnd) {
      m.explosions[m.holder]++;
      c.push({ kind: 'explode', by: m.holder, victim: m.holder });
      c.resolve({ scope: 'round', winner: c.other(m.holder), reason: 'explosión' });
      return true;
    }
    const t = Math.floor(((c.gt - s.fuseStart) / (s.fuseEnd - s.fuseStart)) * 10) / 10;
    if (t !== m.tension) {
      m.tension = t;
      return true;
    }
    return false;
  },
  matchWinner(c) {
    const need = Math.ceil(num(c.g, 'bestOf') / 2);
    return ids(c.room).find((p) => (c.g.roundWins[p] ?? 0) >= need);
  },
  scoreboard(room, g) {
    return {
      ...sides(room, (pid) => ({ main: String(g.roundWins[pid] ?? 0), sub: g.m.holder === pid ? 'lleva la bomba' : 'rondas' })),
      center: `Ronda ${g.round}`,
      clock: { kind: 'none', ref: 0 },
    };
  },
};

// ───────────────────────────── CAZADOR Y PRESA ─────────────────────────────
const cazador: ModeLogic = {
  init(c) {
    c.g.m = { first: pick(ids(c.room)), prey: null, hunter: null, sub: 'hide', subStart: 0, survived: per(c.room, () => null) };
  },
  startRound(c) {
    const { m } = c.g;
    m.prey = c.g.round % 2 === 1 ? m.first : c.other(m.first);
    m.hunter = c.other(m.prey);
    m.sub = 'hide';
    m.subStart = c.gt;
    c.push({ kind: 'hide', by: m.prey, value: c.g.round });
  },
  hit(c, victim) {
    const { m } = c.g;
    if (victim !== m.prey || m.sub !== 'hunt') return null;
    const ms = c.gt - m.subStart;
    m.survived[m.prey] = ms;
    c.credit(m.hunter, m.prey);
    const ev = c.push({ kind: 'hit', shooter: m.hunter, victim: m.prey, by: m.prey, value: ms });
    c.confirmEnd({ scope: 'round', winner: null, reason: 'cazado' });
    return ev;
  },
  tick(c) {
    const { m } = c.g;
    if (m.sub === 'hide' && c.gt >= m.subStart + num(c.g, 'hideSec') * 1000) {
      m.sub = 'hunt';
      m.subStart = c.gt;
      c.push({ kind: 'hunt', by: m.hunter });
      return true;
    }
    const max = num(c.g, 'maxSec') * 1000;
    if (m.sub === 'hunt' && c.gt - m.subStart >= max) {
      m.survived[m.prey] = max;
      c.push({ kind: 'survived', by: m.prey, value: max });
      c.resolve({ scope: 'round', winner: null, reason: 'tiempo máximo' });
      return true;
    }
    return false;
  },
  matchWinner(c) {
    if (c.g.round < 2) return undefined;
    const [a, b] = ids(c.room);
    const sa = c.g.m.survived[a] ?? 0;
    const sb = c.g.m.survived[b] ?? 0;
    if (Math.abs(sa - sb) < 500) return null;
    return sa > sb ? a : b;
  },
  scoreboard(room, g) {
    const { m } = g;
    const hideEnd = m.subStart + num(g, 'hideSec') * 1000;
    return {
      ...sides(room, (pid) => ({
        main: m.survived?.[pid] != null ? mmss(m.survived[pid]) : '—',
        sub: m.prey === pid ? 'presa' : 'cazador',
      })),
      center: m.sub === 'hide' ? `Ronda ${g.round}/2 · a esconderse` : `Ronda ${g.round}/2 · caza`,
      clock: m.sub === 'hide' ? { kind: 'down', ref: hideEnd } : { kind: 'up', ref: m.subStart },
    };
  },
};

// ───────────────────────────── BUSCAR Y DESTRUIR ─────────────────────────────
const buscar: ModeLogic = {
  init(c) {
    c.g.m = {
      first: pick(ids(c.room)),
      attacker: null,
      defuser: null,
      sub: 'plant',
      subStart: 0,
      defusals: per(c.room, () => 0),
      kills: per(c.room, () => 0),
      detonations: per(c.room, () => 0),
    };
  },
  startRound(c) {
    const { m } = c.g;
    m.attacker = c.g.round % 2 === 1 ? m.first : c.other(m.first);
    m.defuser = c.other(m.attacker);
    m.sub = 'plant';
    m.subStart = c.gt;
    c.push({ kind: 'plant', by: m.attacker, value: c.g.round });
  },
  hit(c, victim) {
    const { m } = c.g;
    if (victim !== m.defuser || m.sub !== 'bomb') return null;
    c.credit(m.attacker, m.defuser);
    m.kills[m.attacker]++;
    const ev = c.push({ kind: 'hit', shooter: m.attacker, victim: m.defuser, by: victim });
    c.confirmEnd({ scope: 'round', winner: m.attacker, reason: 'baja' });
    return ev;
  },
  intent(c, pid, it) {
    const { m } = c.g;
    if (it.t !== 'defuse' || pid !== m.attacker || m.sub !== 'bomb') return false;
    m.defusals[m.defuser]++;
    m.sub = 'defused';
    c.push({ kind: 'defused', by: m.defuser });
    c.resolve({ scope: 'round', winner: m.defuser, reason: 'desactivada' });
    return true;
  },
  tick(c) {
    const { m } = c.g;
    if (m.sub === 'plant' && c.gt >= m.subStart + num(c.g, 'plantSec') * 1000) {
      m.sub = 'bomb';
      m.subStart = c.gt;
      c.push({ kind: 'armed', by: m.attacker });
      return true;
    }
    if (m.sub === 'bomb' && c.gt - m.subStart >= num(c.g, 'bombSec') * 1000) {
      m.detonations[m.attacker]++;
      m.sub = 'exploded';
      c.push({ kind: 'explode', by: m.attacker });
      c.resolve({ scope: 'round', winner: m.attacker, reason: 'explosión' });
      return true;
    }
    return false;
  },
  matchWinner(c) {
    const R = num(c.g, 'rounds');
    const [a, b] = ids(c.room);
    const wa = c.g.roundWins[a] ?? 0;
    const wb = c.g.roundWins[b] ?? 0;
    const left = R - c.g.round;
    if (left > 0) {
      if (wa - wb > left) return a;
      if (wb - wa > left) return b;
      return undefined;
    }
    if (wa === wb) return undefined; // muerte súbita: otra ronda
    return wa > wb ? a : b;
  },
  scoreboard(room, g) {
    const { m } = g;
    const R = num(g, 'rounds');
    const end = m.subStart + num(g, m.sub === 'plant' ? 'plantSec' : 'bombSec') * 1000;
    return {
      ...sides(room, (pid) => ({ main: String(g.roundWins[pid] ?? 0), sub: m.attacker === pid ? 'ataca' : 'desactiva' })),
      center: g.round > R ? 'Muerte súbita' : `Ronda ${g.round}/${R}`,
      clock: m.sub === 'plant' || m.sub === 'bomb' ? { kind: 'down', ref: end } : { kind: 'none', ref: 0 },
    };
  },
};

// ───────────────────────────── TIRO AL BLANCO ─────────────────────────────
const TIE_MS = 700;
const blanco: ModeLogic = {
  init(c) {
    c.g.m = {
      bombCan: 1 + Math.floor(Math.random() * 6),
      sub: 'wait',
      nextCall: 0,
      callNum: null,
      callAt: 0,
      done: 0,
      points: per(c.room, () => 0),
      reactions: per(c.room, () => [] as number[]),
      bombs: per(c.room, () => 0),
      pending: null,
    };
  },
  startRound(c) {
    const { m } = c.g;
    c.push({ kind: 'bombcan', value: m.bombCan });
    m.sub = 'wait';
    m.nextCall = c.gt + 6000 + blancoDelay(0, num(c.g, 'rounds'));
  },
  hit: () => null, // en este modo no hay "tocado"
  intent(c, pid, it) {
    const { m } = c.g;
    if (it.t === 'bombcan') {
      const prev = c.snapshot();
      m.points[pid]--;
      m.bombs[pid]++;
      const ev = c.push({ kind: 'bombhit', by: pid });
      c.addUndo(ev, pid, prev);
      return true;
    }
    if (it.t !== 'claim' || m.sub !== 'live') return false;
    // Hora de la orden según el móvil que la dijo (corrige el retardo de red)
    const t = Math.min(c.now, Math.max(m.callAt, it.at ?? c.now));
    if (!m.pending) {
      m.pending = { pid, t, until: c.now + TIE_MS };
      return true;
    }
    if (m.pending.pid !== pid && Math.abs(t - m.pending.t) <= TIE_MS) {
      c.push({ kind: 'tie', value: m.callNum });
      blancoNext(c);
      return true;
    }
    return false;
  },
  tick(c) {
    const { m } = c.g;
    if (m.sub === 'wait' && c.gt >= m.nextCall) {
      const options = [1, 2, 3, 4, 5, 6].filter((n) => n !== m.bombCan);
      m.callNum = pick(options);
      m.callAt = c.now;
      m.sub = 'live';
      m.pending = null;
      c.push({ kind: 'call', value: m.callNum });
      return true;
    }
    if (m.sub === 'live' && m.pending && c.now >= m.pending.until) {
      const { pid, t } = m.pending;
      const rt = Math.max(0, Math.round(t - m.callAt));
      m.points[pid]++;
      m.reactions[pid].push(rt);
      m.pending = null;
      const ev = c.push({ kind: 'claim', by: pid, value: rt });
      blancoNext(c);
      if (c.g.phase === 'playing') {
        // "anular" quita el punto (la ronda ya ha pasado)
        const prev = c.snapshot();
        prev.m.points[pid]--;
        prev.m.reactions[pid].pop();
        c.addUndo(ev, pid, prev);
      }
      return true;
    }
    if (m.sub === 'live' && !m.pending && c.now - m.callAt > 15000) {
      c.push({ kind: 'nocall', value: m.callNum });
      blancoNext(c);
      return true;
    }
    return false;
  },
  matchWinner: () => undefined,
  scoreboard(room, g) {
    const { m } = g;
    const R = num(g, 'rounds');
    return {
      ...sides(room, (pid) => ({ main: String(m.points?.[pid] ?? 0), sub: 'puntos' })),
      center: m.sub === 'live' ? `Lata ${m.callNum}` : `Ronda ${Math.min(R, (m.done ?? 0) + 1)}/${R}`,
      clock: { kind: 'none', ref: 0 },
    };
  },
};

/** Espera antes de cantar: cada vez más corta. */
function blancoDelay(k: number, n: number) {
  const f = n > 1 ? Math.min(1, k / (n - 1)) : 1;
  return 2500 + (1 - f) * 4000 + Math.random() * (3500 - 2000 * f);
}

function blancoNext(c: Core) {
  const { m } = c.g;
  m.done++;
  m.pending = null;
  m.callNum = null;
  const R = num(c.g, 'rounds');
  if (m.done >= R) {
    const [a, b] = ids(c.room);
    const w = m.points[a] === m.points[b] ? null : m.points[a] > m.points[b] ? a : b;
    c.resolve({ scope: 'game', winner: w, reason: 'puntos' });
    return;
  }
  m.sub = 'wait';
  m.nextCall = c.gt + 3000 + blancoDelay(m.done, R);
}

export const LOGIC: Record<ModeId, ModeLogic> = { duelo, armas, bomba, cazador, buscar, blanco };
