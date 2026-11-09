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
