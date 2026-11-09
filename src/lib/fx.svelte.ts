// Traduce los eventos de la partida en efectos: sonido, vibración, narrador y animaciones.

import type { GEvent, Game, Room } from './types';
import { sfx, vibrate } from './audio/sfx';
import { say, numberWord, durationWords } from './audio/narrator';
import { gameTime } from './engine/room';
import { modeInfo } from './modes';
import type { DuelConfig } from './types';

export interface FeedItem {
  id: number;
  shooter: string;
  victim: string;
  text?: string;
  undone?: boolean;
}

export interface Banner {
  id: number;
  title: string;
  sub?: string;
  tone: 'me' | 'opp' | 'neutral' | 'danger';
}

class Fx {
  hurtKey = $state(0); // cambia → destello rojo + temblor
  hitKey = $state(0); // cambia → hitmarker +1
  flashKey = $state(0); // destello de confirmación
  goKey = $state(0); // destello blanco del ¡YA! (claqueta)
  shatterIndex = $state(-1); // segmento de vida que se rompe
  feed = $state<FeedItem[]>([]);
  banner = $state<Banner | null>(null);

  private lastSeen = 0;
  private gameKey = 0;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private bid = 0;

  showBanner(b: Omit<Banner, 'id'>, ms = 2200) {
    this.banner = { ...b, id: ++this.bid };
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => (this.banner = null), ms);
  }

  confirm() {
    sfx.confirm();
    vibrate(30);
    this.flashKey++;
  }

  /** Procesa los eventos nuevos de la sala. */
  sync(room: Room | null, me: string) {
    const g = room?.game;
    if (!g || !room) {
      this.gameKey = 0;
      return;
    }
    if (g.startAt !== this.gameKey) {
      // Partida nueva (o recién reconectado): no repetir eventos antiguos
      this.gameKey = g.startAt;
      this.feed = [];
      this.banner = null;
      const old = g.events.filter((e) => Date.now() - e.at > 3000);
      this.lastSeen = old.length ? old[old.length - 1].id : 0;
      for (const e of g.events) if (e.kind === 'hit' && e.id <= this.lastSeen) this.addFeed(e, true);
    }
    for (const e of g.events) {
      if (e.id <= this.lastSeen) continue;
      this.lastSeen = e.id;
      this.react(room, g, e, me);
    }
  }

  private addFeed(e: GEvent, silent = false) {
    if (!e.shooter || !e.victim) return;
    if (silent) return;
    this.feed = [...this.feed, { id: e.id, shooter: e.shooter, victim: e.victim }].slice(-4);
    sfx.whoosh();
    // Como en los shooters: cada entrada desaparece sola a los pocos segundos
    setTimeout(() => (this.feed = this.feed.filter((f) => f.id !== e.id)), 5000);
  }

  private react(room: Room, g: Game, e: GEvent, me: string) {
    const name = (pid?: string) => {
      const p = room.players.find((x) => x.id === pid);
      return p ? p.name : '';
    };
    const opp = room.players.find((p) => p.id !== me)?.id ?? '';
    switch (e.kind) {
      case 'start':
        sfx.go();
        vibrate(200);
        this.goKey++;
        break;
      case 'hit': {
        this.addFeed(e);
        const left = e.value ?? 0;
        if (e.victim === me) {
          sfx.hurt();
          vibrate([90, 40, 180]);
          this.shatterIndex = left; // índice del segmento que acaba de perderse
          this.hurtKey++;
          if (left <= 0) say('Eliminado.', { interrupt: true });
          else if (left === 1) say('Impacto. Última vida.', { interrupt: true });
          else say(`Impacto. Te quedan ${numberWord(left)}.`, { interrupt: true });
        } else {
          sfx.hitmarker();
          vibrate(40);
          this.hitKey++;
          if (left <= 0) say('¡Baja! Rival eliminado.', { interrupt: true });
          else say(`¡Acierto! A ${name(e.victim)} le ${left === 1 ? 'queda una' : 'quedan ' + numberWord(left)}.`, { interrupt: true });
        }
        if (left <= 0) {
          const confirmed = (g.config as DuelConfig).confirmedKill;
          this.showBanner(
            {
              title: e.victim === me ? 'ELIMINADO' : 'BAJA',
              sub: confirmed ? 'Baja confirmada: 10 s para anular' : 'Confirmando…',
              tone: e.victim === me ? 'danger' : 'me',
            },
            2600,
          );
        }
        break;
      }
      case 'undo': {
        sfx.undo();
        this.feed = this.feed.map((f) => (f.id === e.ref ? { ...f, undone: true } : f));
        if (e.by === me) say('Anulado. Recuperas la vida.', { interrupt: true });
        else say('Impacto anulado.', { interrupt: true });
        this.showBanner({ title: 'ANULADO', sub: `${name(e.by)} recupera la vida`, tone: 'neutral' }, 1600);
        break;
      }
      case 'pause':
        sfx.pause();
        vibrate([60, 60, 60]);
        say(e.reason === 'desconexión' ? 'Conexión perdida. Partida en pausa.' : 'Pausa.', { interrupt: true });
        break;
      case 'resume':
        sfx.resume();
        say('Seguimos en tres.', { interrupt: true });
        break;
      case 'lastlife':
        if (e.victim === opp) this.showBanner({ title: 'ÚLTIMA VIDA', sub: `${name(e.victim)} está al límite`, tone: 'me' }, 1800);
        break;
      case 'timeup':
        sfx.alarm();
        vibrate([200, 100, 200]);
        say('¡Tiempo!', { interrupt: true });
        break;
      case 'suddendeath':
        this.showBanner({ title: 'MUERTE SÚBITA', sub: 'El siguiente acierto gana', tone: 'danger' }, 3000);
        setTimeout(() => say('Empate. Muerte súbita. El siguiente acierto gana.'), 900);
        break;
      case 'win':
        if (e.by === me) {
          sfx.victory();
          say('¡Victoria!');
        } else {
          sfx.defeat();
          say('Derrota.');
        }
        break;
      case 'draw':
        say('Empate.');
        break;
    }
  }
}

export const fx = new Fx();

/** Resumen hablado para la orden "estado". */
export function statusPhrase(room: Room, me: string, now: number): string {
  const g = room.game;
  const opp = room.players.find((p) => p.id !== me);
  const oppName = opp ? opp.name : 'rival';
  if (!g) return 'No hay partida en curso.';
  const parts: string[] = [];
  const mine = g.lives[me] ?? 0;
  const theirs = opp ? g.lives[opp.id] ?? 0 : 0;
  parts.push(mine === 1 ? 'Tienes una vida.' : `Tienes ${numberWord(mine)} vidas.`);
  parts.push(`${oppName}, ${numberWord(theirs)}.`);
  const cfg = g.config as DuelConfig;
  if (g.suddenDeath) parts.push('Muerte súbita.');
  else if (cfg.timeLimitSec > 0) parts.push(`Quedan ${durationWords(cfg.timeLimitSec * 1000 - gameTime(g, now))}.`);
  if (g.phase === 'paused') parts.push('Partida en pausa.');
  return parts.join(' ');
}

export function fmtClock(ms: number, tenths = false): string {
  const neg = ms < 0;
  ms = Math.abs(ms);
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const base = `${m}:${String(s % 60).padStart(2, '0')}`;
  return (neg ? '-' : '') + (tenths ? `${base}.${Math.floor((ms % 1000) / 100)}` : base);
}

/** Línea de tiempo exportable para montar el vídeo. */
export function timeline(room: Room): string {
  const g = room.game;
  if (!g) return '';
  const nm = (pid?: string) => {
    const p = room.players.find((x) => x.id === pid);
    return p ? p.name : '?';
  };
  const ts = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const lines: string[] = [];
  const date = new Date(g.startAt).toLocaleString('es-ES');
  lines.push(`# ${modeInfo(g.mode).name} · ${room.players.map((p) => nm(p.id)).join(' vs ')} · ${date}`);
  lines.push('# 00:00 = destello y pitido de ¡YA! (claqueta)');
  for (const e of g.events) {
    let t = '';
    switch (e.kind) {
      case 'start':
        t = `Inicio – ${modeInfo(g.mode).name}`;
        break;
      case 'hit':
        t = `${nm(e.shooter)} ▸ ${nm(e.victim)} (${nm(e.victim)} ${e.value} ${e.value === 1 ? 'vida' : 'vidas'})`;
        break;
      case 'undo':
        t = `Anulado por ${nm(e.by)}`;
        break;
      case 'pause':
        t = `Pausa (${e.reason === 'desconexión' ? 'desconexión' : nm(e.by)})`;
        break;
      case 'resume':
        t = 'Reanudación (3 s)';
        break;
      case 'lastlife':
        t = `${nm(e.victim)} en última vida`;
        break;
      case 'timeup':
        t = 'Tiempo';
        break;
      case 'suddendeath':
        t = 'Muerte súbita';
        break;
      case 'win':
        t = `Victoria de ${nm(e.by)}`;
        break;
      case 'draw':
        t = 'Empate';
        break;
    }
    // Tiempo real desde el ¡YA! (incluye pausas) para casar con las cámaras
    if (t) lines.push(`${ts(e.at - g.startAt)} ${t}`);
  }
  return lines.join('\n');
}
