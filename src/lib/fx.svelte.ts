// Traduce los eventos de la partida en efectos: sonido, vibración, narrador y animaciones.
// Regla del narrador: nunca decir "[nombre] + [orden]" para no activar el otro móvil.

import type { GEvent, Game, Room } from './types';
import { sfx, vibrate } from './audio/sfx';
import { say, numberWord, durationWords } from './audio/narrator';
import { gameTime } from './engine/room';
import { mmss } from './engine/logic';
import { LEVELS, modeInfo } from './modes';

export interface FeedItem {
  id: number;
  shooter: string;
  victim: string;
  undone?: boolean;
}

export interface Banner {
  id: number;
  title: string;
  sub?: string;
  tone: 'me' | 'opp' | 'neutral' | 'danger';
}

const secs = (ms: number) => durationWords(ms);

class Fx {
  hurtKey = $state(0); // cambia → destello rojo + temblor
  hitKey = $state(0); // cambia → hitmarker +1
  flashKey = $state(0); // destello de confirmación
  goKey = $state(0); // destello blanco del ¡YA! (claqueta)
  boomKey = $state(0); // explosión
  levelKey = $state(0); // subida de nivel
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
  sync(room: Room | null, me: string, hostNow: number) {
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
      const old = g.events.filter((e) => hostNow - e.at > 3000);
      this.lastSeen = old.length ? old[old.length - 1].id : 0;
    }
    for (const e of g.events) {
      if (e.id <= this.lastSeen) continue;
      this.lastSeen = e.id;
      this.react(room, g, e, me);
    }
  }

  private addFeed(e: GEvent) {
    if (!e.shooter || !e.victim) return;
    this.feed = [...this.feed, { id: e.id, shooter: e.shooter, victim: e.victim }].slice(-3);
    sfx.whoosh();
    // Como en los shooters: cada entrada desaparece sola a los pocos segundos
    setTimeout(() => (this.feed = this.feed.filter((f) => f.id !== e.id)), 5000);
  }

  private hurt(e: GEvent, shatter = -1) {
    sfx.hurt();
    vibrate([90, 40, 180]);
    this.shatterIndex = shatter;
    this.hurtKey++;
  }

  private scored() {
    sfx.hitmarker();
    vibrate(40);
    this.hitKey++;
  }

  private react(room: Room, g: Game, e: GEvent, me: string) {
    const name = (pid?: string | null) => room.players.find((x) => x.id === pid)?.name ?? '';
    const opp = room.players.find((p) => p.id !== me)?.id ?? '';
    const mine = e.by === me;
    const I = (s: string) => say(s, { interrupt: true });

    switch (e.kind) {
      // ── comunes ──
      case 'start':
        sfx.go();
        vibrate(200);
        this.goKey++;
        break;
      case 'undo':
        sfx.undo();
        this.feed = this.feed.map((f) => (f.id === e.ref ? { ...f, undone: true } : f));
        I(mine ? 'Anulado.' : `Anulado por ${name(e.by)}.`);
        this.showBanner({ title: 'Anulado', sub: `Lo ha anulado ${name(e.by)}`, tone: 'neutral' }, 1600);
        break;
      case 'pause':
        sfx.pause();
        vibrate([60, 60, 60]);
        I(e.reason === 'desconexión' ? 'Conexión perdida. Partida en pausa.' : 'Pausa.');
        break;
      case 'resume':
        sfx.resume();
        I('Seguimos en tres.');
        break;
      case 'timeup':
        sfx.alarm();
        vibrate([200, 100, 200]);
        I('¡Tiempo!');
        break;
      case 'suddendeath':
        this.showBanner({ title: 'Muerte súbita', sub: 'El siguiente acierto gana', tone: 'danger' }, 3000);
        setTimeout(() => say('Empate. Muerte súbita. El siguiente acierto gana.'), 900);
        break;
      case 'roundend':
        if (!e.by) {
          this.showBanner({ title: `Fin de la ronda ${e.value}`, tone: 'neutral' }, 2400);
        } else {
          this.showBanner({ title: mine ? 'Ronda para ti' : `Ronda para ${name(e.by)}`, sub: e.reason, tone: mine ? 'me' : 'opp' }, 2600);
          setTimeout(() => say(mine ? 'Ronda para ti.' : `Ronda para ${name(e.by)}.`), 1200);
        }
        break;
      case 'roundstart':
        sfx.go();
        vibrate(120);
        this.goKey++;
        break;
      case 'win':
        if (mine) {
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

      // ── duelo / armas / cazador / buscar: impacto reportado ──
      case 'hit': {
        this.addFeed(e);
        const victimMe = e.victim === me;
        if (g.mode === 'duelo') {
          const left = e.value ?? 0;
          if (victimMe) {
            this.hurt(e, left);
            I(left <= 0 ? 'Eliminado.' : left === 1 ? 'Impacto. Última vida.' : `Impacto. Te quedan ${numberWord(left)}.`);
          } else {
            this.scored();
            I(left <= 0 ? '¡Baja! Rival eliminado.' : `¡Acierto! A ${name(e.victim)} le ${left === 1 ? 'queda una' : 'quedan ' + numberWord(left)}.`);
          }
          if (left <= 0)
            this.showBanner(
              { title: victimMe ? 'Eliminado' : 'Baja', sub: g.config.confirmedKill ? 'Baja confirmada: 10 s para anular' : 'Confirmando…', tone: victimMe ? 'danger' : 'me' },
              2600,
            );
        } else if (g.mode === 'armas') {
          if (victimMe) {
            this.hurt(e);
            I('Impacto final. Has perdido.');
          } else {
            this.scored();
            I('¡Acierto en el nivel final!');
          }
          this.showBanner({ title: victimMe ? 'Eliminado' : '¡Nivel final superado!', sub: 'Confirmando…', tone: victimMe ? 'danger' : 'me' }, 2600);
        } else if (g.mode === 'cazador') {
          const t = secs(e.value ?? 0);
          if (victimMe) {
            this.hurt(e);
            I(`Cazado. Has aguantado ${t}.`);
          } else {
            this.scored();
            I(`¡Presa abatida! Aguantó ${t}.`);
          }
          this.showBanner({ title: victimMe ? 'Cazado' : 'Presa abatida', sub: `Aguantó ${mmss(e.value ?? 0)}`, tone: victimMe ? 'danger' : 'me' }, 2600);
        } else if (g.mode === 'buscar') {
          if (victimMe) {
            this.hurt(e);
            I('Te han dado. Ronda para el atacante.');
          } else {
            this.scored();
            I('¡Baja! Bomba defendida.');
          }
        }
        break;
      }
      case 'lastlife':
        if (e.victim === opp) this.showBanner({ title: 'Última vida', sub: `${name(e.victim)} está al límite`, tone: 'me' }, 1800);
        break;

      // ── Juego de armas ──
      case 'levelup': {
        this.addFeed(e);
        const lv = e.value ?? 1;
        const info = LEVELS[lv - 1];
        if (mine) {
          this.scored();
          sfx.levelup();
          this.levelKey++;
          this.showBanner({ title: `Nivel ${lv}`, sub: info?.name, tone: 'me' }, 2600);
          I(`Nivel ${numberWord(lv)}. ${info?.name}.`);
        } else {
          this.hurt(e);
          this.showBanner({ title: `${name(e.by)} sube a nivel ${lv}`, sub: info?.name, tone: 'opp' }, 2000);
          I(`Impacto. ${name(e.by)} sube a nivel ${numberWord(lv)}.`);
        }
        break;
      }
      case 'leveldown':
        if (mine) {
          this.showBanner({ title: 'Humillación', sub: 'Bajas al nivel 5', tone: 'danger' }, 2400);
          setTimeout(() => say('Humillación. Bajas al nivel cinco.'), 1300);
        } else this.showBanner({ title: 'Humillación', sub: `${name(e.by)} baja al nivel 5`, tone: 'me' }, 2000);
        break;

      // ── Bomba ──
      case 'bombstart':
        sfx.alert();
        if (mine) {
          vibrate([100, 50, 100, 50, 300]);
          this.showBanner({ title: '¡Tienes la bomba!', sub: `Ronda ${e.value} · dale al rival para pasarla`, tone: 'danger' }, 2600);
          say('¡Tienes la bomba! Dale al rival para pasarla.');
        } else {
          this.showBanner({ title: `La bomba la lleva ${name(e.by)}`, sub: `Ronda ${e.value} · ¡huye!`, tone: 'neutral' }, 2600);
          say(`La bomba la lleva ${name(e.by)}. ¡Huye!`);
        }
        break;
      case 'bombpass':
        this.addFeed(e);
        if (e.victim === me) {
          this.hurt(e);
          vibrate([100, 50, 100, 50, 300]);
          this.showBanner({ title: '¡Te la han pasado!', sub: 'No puedes devolverla en 3 s', tone: 'danger' }, 2000);
          I('¡Te han pasado la bomba!');
        } else {
          this.scored();
          this.showBanner({ title: '¡Bomba pasada!', sub: 'Tienes 3 s para alejarte', tone: 'me' }, 2000);
          I('¡Bomba pasada! Aléjate.');
        }
        break;
      case 'blocked':
        if (mine) {
          sfx.error();
          I('Sin devolución todavía.');
        }
        break;
      case 'explode':
        sfx.boom();
        vibrate([400, 100, 600]);
        this.boomKey++;
        if (g.mode === 'bomba') I(e.victim === me ? '¡Bum! Te ha explotado.' : `¡Bum! Le ha explotado a ${name(e.victim)}.`);
        else I(mine ? '¡Bum! La bomba ha explotado. Ronda para ti.' : '¡Bum! La bomba ha explotado.');
        break;

      // ── Cazador y presa ──
      case 'hide': {
        const t = secs(Number(g.config.hideSec) * 1000);
        sfx.alert();
        if (mine) {
          this.showBanner({ title: 'Eres la presa', sub: `Escóndete: ${g.config.hideSec} s`, tone: 'me' }, 2600);
          say(`Eres la presa. Escóndete. Tienes ${t}.`);
        } else {
          this.showBanner({ title: 'Eres el cazador', sub: 'Mira a la pared', tone: 'opp' }, 2600);
          say(`Eres el cazador. Mira a la pared durante ${t}.`);
        }
        break;
      }
      case 'hunt':
        sfx.go();
        vibrate(200);
        this.goKey++;
        I(mine ? '¡A cazar!' : 'Empieza la caza. Aguanta.');
        break;
      case 'survived':
        sfx.victory();
        I(mine ? '¡Has sobrevivido!' : 'Se acabó el tiempo. La presa ha sobrevivido.');
        this.showBanner({ title: mine ? '¡Sobrevives!' : 'La presa sobrevive', sub: mmss(e.value ?? 0), tone: mine ? 'me' : 'opp' }, 2600);
        break;

      // ── Buscar y destruir ──
      case 'plant':
        sfx.alert();
        if (mine) {
          this.showBanner({ title: 'Atacas', sub: `Esconde tu móvil: ${g.config.plantSec} s`, tone: 'me' }, 2600);
          say(`Atacas. Esconde tu móvil con la pantalla encendida. Tienes ${secs(Number(g.config.plantSec) * 1000)}.`);
        } else {
          this.showBanner({ title: 'Desactivas', sub: 'Mira a la pared', tone: 'opp' }, 2600);
          say('Desactivas. Mira a la pared mientras planta la bomba.');
        }
        break;
      case 'armed':
        sfx.alarm();
        this.goKey++;
        if (mine) say('Bomba armada. Defiéndela.');
        else I('Bomba armada. Encuéntrala y mantén el botón cinco segundos.');
        break;
      case 'defused':
        sfx.victory();
        this.showBanner({ title: '¡Desactivada!', sub: `Por ${name(e.by)}`, tone: mine ? 'me' : 'opp' }, 2600);
        I(mine ? '¡Bomba desactivada!' : 'Han desactivado tu bomba.');
        break;

      // ── Tiro al blanco ──
      case 'bombcan':
        sfx.alert();
        this.showBanner({ title: `Lata bomba: ${e.value}`, sub: 'Si la tumbas, pierdes un punto', tone: 'danger' }, 3200);
        say(`La lata bomba es la número ${numberWord(e.value ?? 0)}. No la tumbéis.`);
        break;
      case 'call':
        sfx.call();
        vibrate(80);
        say(`¡Lata ${numberWord(e.value ?? 0)}!`, { interrupt: true, rate: 1.3 });
        break;
      case 'claim': {
        const ms = e.value ?? 0;
        if (mine) {
          this.scored();
          I(`¡Tuya! ${(ms / 1000).toFixed(2).replace('.', ',')} segundos.`);
        } else {
          sfx.defeat();
          I(`Para ${name(e.by)}.`);
        }
        this.showBanner({ title: mine ? '¡Tuya!' : `Para ${name(e.by)}`, sub: `${ms} ms`, tone: mine ? 'me' : 'opp' }, 1800);
        break;
      }
      case 'tie':
        sfx.error();
        I('Empate. No puntúa.');
        this.showBanner({ title: 'Empate', sub: 'No puntúa', tone: 'neutral' }, 1600);
        break;
      case 'nocall':
        I('Nadie. Siguiente.');
        break;
      case 'bombhit':
        sfx.boom();
        this.boomKey++;
        if (mine) {
          this.hurt(e);
          I('¡Lata bomba! Pierdes un punto.');
        } else I(`${name(e.by)} ha tumbado la lata bomba.`);
        this.showBanner({ title: 'Lata bomba', sub: `${name(e.by)} pierde un punto`, tone: mine ? 'danger' : 'me' }, 2000);
        break;
    }
  }
}

export const fx = new Fx();

/** Resumen hablado para la orden "estado". */
export function statusPhrase(room: Room, me: string, now: number): string {
  const g = room.game;
  const opp = room.players.find((p) => p.id !== me);
  const oppName = opp?.name ?? 'rival';
  if (!g) return 'No hay partida en curso.';
  const gt = gameTime(g, now);
  const m = g.m;
  const o = opp?.id ?? '';
  const parts: string[] = [];
  switch (g.mode) {
    case 'duelo': {
      const mine = m.lives[me];
      parts.push(mine === 1 ? 'Tienes una vida.' : `Tienes ${numberWord(mine)} vidas.`);
      parts.push(`${oppName}, ${numberWord(m.lives[o])}.`);
      if (m.sudden) parts.push('Muerte súbita.');
      else if (g.config.timeLimitSec) parts.push(`Quedan ${secs(Number(g.config.timeLimitSec) * 1000 - gt)}.`);
      break;
    }
    case 'armas':
      parts.push(`Estás en el nivel ${numberWord(m.level[me])}: ${LEVELS[m.level[me] - 1].name}.`);
      parts.push(`${oppName}, nivel ${numberWord(m.level[o])}.`);
      break;
    case 'bomba':
      parts.push(m.holder === me ? 'Llevas la bomba.' : `La bomba la lleva ${oppName}.`);
      parts.push(`Rondas: tú ${numberWord(g.roundWins[me])}, ${oppName} ${numberWord(g.roundWins[o])}.`);
      break;
    case 'cazador':
      parts.push(m.prey === me ? 'Eres la presa.' : 'Eres el cazador.');
      if (m.sub === 'hunt') parts.push(`Llevas ${secs(gt - m.subStart)} de caza.`);
      break;
    case 'buscar':
      parts.push(m.attacker === me ? 'Atacas.' : 'Desactivas.');
      if (m.sub === 'bomb') parts.push(`Quedan ${secs(Number(g.config.bombSec) * 1000 - (gt - m.subStart))} de bomba.`);
      parts.push(`Rondas: tú ${numberWord(g.roundWins[me])}, ${oppName} ${numberWord(g.roundWins[o])}.`);
      break;
    case 'blanco':
      parts.push(`Tienes ${numberWord(Math.max(0, m.points[me]))} puntos. ${oppName}, ${numberWord(Math.max(0, m.points[o]))}.`);
      parts.push(`La lata bomba es la ${numberWord(m.bombCan)}.`);
      break;
  }
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

/** Texto neutro de un evento (línea de tiempo y vídeo del HUD). null = no se muestra. */
export function describe(room: Room, g: Game, e: GEvent): string | null {
  const nm = (pid?: string | null) => room.players.find((x) => x.id === pid)?.name ?? '?';
  switch (e.kind) {
    case 'start':
      return `Inicio – ${modeInfo(g.mode).name}`;
    case 'hit':
      if (g.mode === 'duelo') return `${nm(e.shooter)} ▸ ${nm(e.victim)} (${e.value} ${e.value === 1 ? 'vida' : 'vidas'})`;
      if (g.mode === 'cazador') return `${nm(e.shooter)} caza a ${nm(e.victim)} (${mmss(e.value ?? 0)})`;
      return `${nm(e.shooter)} ▸ ${nm(e.victim)}`;
    case 'undo':
      return `Anulado por ${nm(e.by)}`;
    case 'pause':
      return `Pausa (${e.reason === 'desconexión' ? 'desconexión' : nm(e.by)})`;
    case 'resume':
      return 'Reanudación (3 s)';
    case 'lastlife':
      return `${nm(e.victim)} en última vida`;
    case 'timeup':
      return 'Tiempo';
    case 'suddendeath':
      return 'Muerte súbita';
    case 'roundstart':
      return `Ronda ${e.value}`;
    case 'roundend':
      return e.by ? `Ronda ${e.value} para ${nm(e.by)} (${e.reason})` : `Fin de la ronda ${e.value}`;
    case 'win':
      return `Victoria de ${nm(e.by)}`;
    case 'draw':
      return 'Empate';
    case 'levelup':
      return `${nm(e.shooter)} ▸ ${nm(e.victim)} · ${nm(e.by)} sube a nivel ${e.value}`;
    case 'leveldown':
      return `Humillación: ${nm(e.by)} baja a nivel 5`;
    case 'bombstart':
      return `La bomba empieza en ${nm(e.by)}`;
    case 'bombpass':
      return `${nm(e.shooter)} pasa la bomba a ${nm(e.victim)}`;
    case 'explode':
      return g.mode === 'bomba' ? `¡Explota! (${nm(e.victim)})` : '¡La bomba explota!';
    case 'hide':
      return `${nm(e.by)} se esconde`;
    case 'hunt':
      return 'Empieza la caza';
    case 'survived':
      return `${nm(e.by)} sobrevive (${mmss(e.value ?? 0)})`;
    case 'plant':
      return `${nm(e.by)} planta la bomba`;
    case 'armed':
      return 'Bomba armada';
    case 'defused':
      return `${nm(e.by)} desactiva la bomba`;
    case 'bombcan':
      return `Lata bomba: ${e.value}`;
    case 'call':
      return `¡Lata ${e.value}!`;
    case 'claim':
      return `${nm(e.by)} tumba la lata (${e.value} ms)`;
    case 'tie':
      return 'Empate en la lata';
    case 'nocall':
      return 'Nadie tumba la lata';
    case 'bombhit':
      return `${nm(e.by)} tumba la lata bomba (−1)`;
    default:
      return null;
  }
}

/** Línea de tiempo exportable para montar el vídeo. */
export function timeline(room: Room): string {
  const g = room.game;
  if (!g) return '';
  const ts = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const lines: string[] = [];
  const date = new Date(g.startAt).toLocaleString('es-ES');
  lines.push(`# ${modeInfo(g.mode).name} · ${room.players.map((p) => p.name).join(' vs ')} · ${date}`);
  lines.push('# 00:00 = destello y pitido de ¡YA! (claqueta)');
  for (const e of g.events) {
    const t = describe(room, g, e);
    // Tiempo real desde el ¡YA! (incluye pausas) para casar con las cámaras
    if (t) lines.push(`${ts(e.at - g.startAt)} ${t}`);
  }
  return lines.join('\n');
}
