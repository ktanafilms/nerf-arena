// Historial de partidas guardado en el móvil (para exportar el HUD o los marcadores más tarde).

import type { Room } from './types';

const KEY = 'nerf.history';
const MAX = 40;

export interface SavedGame {
  id: number; // = startAt
  at: number;
  room: Room; // jugadores + partida completa (eventos incluidos)
}

function load(): SavedGame[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

class History {
  games = $state<SavedGame[]>(load());

  /** Guarda una partida terminada (una sola vez por partida). */
  save(room: Room) {
    const g = room.game;
    if (!g || g.phase !== 'ended') return;
    if (this.games.some((x) => x.id === g.startAt)) return;
    const copy: Room = JSON.parse(JSON.stringify({ ...room, ready: {}, configs: {} }));
    this.games = [{ id: g.startAt, at: Date.now(), room: copy }, ...this.games].slice(0, MAX);
    this.persist();
  }

  remove(id: number) {
    this.games = this.games.filter((x) => x.id !== id);
    this.persist();
  }

  private persist() {
    // Si no cabe, se van quitando las más antiguas
    let list = this.games;
    for (;;) {
      try {
        localStorage.setItem(KEY, JSON.stringify(list));
        if (list !== this.games) this.games = list;
        return;
      } catch {
        if (list.length <= 1) return;
        list = list.slice(0, -1);
      }
    }
  }

  /**
   * Partidas de la misma sesión que `room`: misma sala y mismos jugadores, encadenadas
   * sin descansos de más de 3 horas. Ordenadas de la primera a la última.
   */
  sessionOf(room: Room): Room[] {
    const g = room.game;
    if (!g) return [room];
    const names = (r: Room) => r.players.map((p) => p.name.toLowerCase()).sort().join('|');
    const key = names(room);
    const same = this.games
      .filter((x) => x.room.code === room.code && names(x.room) === key && x.room.game)
      .map((x) => x.room);
    if (!same.some((r) => r.game!.startAt === g.startAt)) same.push(room);
    same.sort((a, b) => a.game!.startAt - b.game!.startAt);
    const i = same.findIndex((r) => r.game!.startAt === g.startAt);
    const endOf = (r: Room) => r.game!.endedAt ?? r.game!.startAt;
    let a = i,
      b = i;
    while (a > 0 && same[a].game!.startAt - endOf(same[a - 1]) < 3 * 3600_000) a--;
    while (b < same.length - 1 && same[b + 1].game!.startAt - endOf(same[b]) < 3 * 3600_000) b++;
    return same.slice(a, b + 1);
  }

  /** Partidas agrupadas por día (lo más reciente primero) */
  byDay(): { day: string; label: string; games: SavedGame[] }[] {
    const out: { day: string; label: string; games: SavedGame[] }[] = [];
    for (const s of this.games) {
      const d = new Date(s.room.game?.startAt ?? s.at);
      const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      let grp = out.find((x) => x.day === day);
      if (!grp) {
        grp = { day, label: d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }), games: [] };
        out.push(grp);
      }
      grp.games.push(s);
    }
    return out;
  }

  /** Victorias por nombre (todas las partidas guardadas) */
  totals() {
    const t = new Map<string, { name: string; wins: number; games: number }>();
    for (const s of this.games) {
      for (const p of s.room.players) {
        const k = p.name.toLowerCase();
        const e = t.get(k) ?? { name: p.name, wins: 0, games: 0 };
        e.games++;
        if (s.room.game?.winner === p.id) e.wins++;
        t.set(k, e);
      }
    }
    return [...t.values()].sort((a, b) => b.wins - a.wins);
  }
}

export const history = new History();
