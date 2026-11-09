// Dibuja el HUD de la partida (fondo transparente) para superponerlo a los vídeos.
// Todo sale del registro de eventos: cada evento lleva el marcador en ese instante.

import type { GEvent, Game, Room, Scoreboard } from '../types';
import { colorDef } from '../types';
import { iconPath } from '../icons';
import { LEVELS, modeInfo } from '../modes';
import { mmss, EXTRA_NAMES } from '../engine/logic';

export type Format = '16:9' | '9:16';
export const PREROLL = 3000; // el vídeo empieza 3 s antes del ¡YA!
export const POSTROLL = 5000;
const BANNER_MS = 3500;
const ANIM_MS = 300;
const PULSE_MS = 450;

const DISPLAY = '"Big Shoulders Display", "Arial Narrow", sans-serif';
const BODY = '"Archivo", system-ui, sans-serif';

interface PlayerView {
  id: string;
  name: string;
  hex: string;
  ink: string;
  icon: Path2D;
}
interface BannerView {
  id: number;
  at: number;
  title: string;
  sub: string;
  hex: string;
  ink: string;
}

export interface Prepared {
  W: number;
  H: number;
  format: Format;
  g: Game;
  mode: { name: string; color: string };
  A: PlayerView;
  B: PlayerView;
  sbs: { at: number; id: number; sb: Scoreboard }[];
  banners: BannerView[];
  pulses: { at: number; side: 'A' | 'B' }[];
  frozen: [number, number][]; // intervalos (reloj host) en que el tiempo de partida no corre
  end: { at: number; winner: string | null } | null;
  t0: number; // reloj host del primer fotograma
  duration: number; // ms de vídeo
}

/** Texto de cada evento para el rótulo inferior. */
function label(room: Room, g: Game, e: GEvent): { title: string; sub: string; pid?: string } | null {
  const nm = (pid?: string | null) => room.players.find((p) => p.id === pid)?.name ?? '';
  switch (e.kind) {
    case 'hit':
      if (g.mode === 'duelo') return { title: e.reason === 'dorado' ? 'Dardo dorado' : 'Impacto', sub: `${nm(e.shooter)} ▸ ${nm(e.victim)} · quedan ${e.value}`, pid: e.shooter };
      if (g.mode === 'cazador') return { title: 'Cazado', sub: `${nm(e.victim)} aguantó ${mmss(e.value ?? 0)}`, pid: e.shooter };
      if (g.mode === 'armas') return { title: 'Nivel final', sub: `${nm(e.shooter)} ▸ ${nm(e.victim)}`, pid: e.shooter };
      return { title: 'Baja', sub: `${nm(e.shooter)} ▸ ${nm(e.victim)}`, pid: e.shooter };
    case 'lastlife':
      return { title: 'Última vida', sub: nm(e.victim), pid: e.victim };
    case 'levelup':
      return { title: `Nivel ${e.value}`, sub: `${nm(e.by)} · ${LEVELS[(e.value ?? 1) - 1]?.name ?? ''}`, pid: e.by };
    case 'leveldown':
      return { title: 'Humillación', sub: `${nm(e.by)} baja al nivel 5`, pid: e.by };
    case 'bombstart':
      return { title: 'Bomba', sub: `La lleva ${nm(e.by)}`, pid: e.by };
    case 'bombpass':
      return { title: 'Bomba pasada', sub: `${nm(e.shooter)} ▸ ${nm(e.victim)}`, pid: e.shooter };
    case 'explode':
      return { title: '¡Boom!', sub: g.mode === 'bomba' ? `Le explota a ${nm(e.victim)}` : 'La bomba explota', pid: e.by };
    case 'hide':
      return { title: 'A esconderse', sub: `${nm(e.by)} es la presa`, pid: e.by };
    case 'hunt':
      return { title: 'Empieza la caza', sub: `${nm(e.by)} caza`, pid: e.by };
    case 'survived':
      return { title: 'Sobrevive', sub: `${nm(e.by)} · ${mmss(e.value ?? 0)}`, pid: e.by };
    case 'plant':
      return { title: 'Plantando', sub: `${nm(e.by)} esconde la bomba`, pid: e.by };
    case 'armed':
      return { title: 'Bomba armada', sub: `${nm(e.by)} defiende`, pid: e.by };
    case 'defused':
      return { title: 'Desactivada', sub: nm(e.by), pid: e.by };
    case 'bombcan':
      return { title: `Lata bomba: ${e.value}`, sub: 'Tumbarla resta un punto' };
    case 'call':
      return { title: `¡Lata ${e.value}!`, sub: '¿Quién la tumba antes?' };
    case 'claim':
      return { title: `Para ${nm(e.by)}`, sub: `${e.value} ms`, pid: e.by };
    case 'tie':
      return { title: 'Empate', sub: 'No puntúa' };
    case 'bombhit':
      return { title: 'Lata bomba', sub: `${nm(e.by)} pierde un punto`, pid: e.by };
    case 'roundend':
      return e.by ? { title: `Ronda ${e.value}`, sub: `Para ${nm(e.by)} · ${e.reason ?? ''}`, pid: e.by } : { title: `Fin de la ronda ${e.value}`, sub: '' };
    case 'suddendeath':
      return { title: 'Muerte súbita', sub: 'El siguiente acierto gana' };
    case 'timeup':
      return { title: 'Tiempo', sub: '' };
    case 'undo':
      return { title: 'Anulado', sub: nm(e.by), pid: e.by };
    case 'surprise':
      return { title: EXTRA_NAMES[e.reason ?? ''] ?? 'Sorpresa', sub: 'Evento sorpresa' };
    case 'uav':
      return { title: 'Racha UAV', sub: `${nm(e.by)} delata a ${nm(e.victim)} 30 s`, pid: e.by };
    default:
      return null;
  }
}

export function prepare(room: Room, format: Format): Prepared {
  const g = room.game!;
  const [W, H] = format === '16:9' ? [1920, 1080] : [1080, 1920];
  const pv = (i: number): PlayerView => {
    const p = room.players[i];
    const c = colorDef(p.color);
    return { id: p.id, name: p.name, hex: c.hex, ink: c.ink, icon: new Path2D(iconPath(p.icon)) };
  };
  const A = pv(0);
  const B = pv(1);
  const mi = modeInfo(g.mode);
  const sbs: Prepared['sbs'] = [];
  const banners: BannerView[] = [];
  const pulses: Prepared['pulses'] = [];
  let prev: Scoreboard | null = null;
  for (const e of g.events) {
    if (e.sb) {
      sbs.push({ at: e.at, id: e.id, sb: e.sb });
      if (prev) {
        if (prev.A.main !== e.sb.A.main) pulses.push({ at: e.at, side: 'A' });
        if (prev.B.main !== e.sb.B.main) pulses.push({ at: e.at, side: 'B' });
      }
      prev = e.sb;
    }
    const l = label(room, g, e);
    if (l) {
      const who = l.pid === A.id ? A : l.pid === B.id ? B : null;
      banners.push({ id: e.id, at: e.at, title: l.title, sub: l.sub, hex: who?.hex ?? mi.color, ink: who?.ink ?? '#0d0d0d' });
    }
  }
  // Tramos con el tiempo de partida parado: pausas (+3 s de reanudación)
  const frozen: [number, number][] = [];
  for (let i = 0; i < g.events.length; i++) {
    const e = g.events[i];
    if (e.kind !== 'pause') continue;
    const r = g.events.slice(i + 1).find((x) => x.kind === 'resume');
    frozen.push([e.at, r ? r.at + 3000 : Infinity]);
  }
  const endEv = [...g.events].reverse().find((e) => e.kind === 'win' || e.kind === 'draw');
  const end = endEv ? { at: endEv.at, winner: endEv.kind === 'win' ? (endEv.by ?? null) : null } : null;
  const t0 = g.startAt - PREROLL;
  const tEnd = (g.endedAt ?? g.events[g.events.length - 1]?.at ?? g.startAt) + POSTROLL;
  return { W, H, format, g, mode: { name: mi.name, color: mi.color }, A, B, sbs, banners, pulses, frozen, end, t0, duration: tEnd - t0 };
}

/** Tiempo de partida en el instante T (reloj host). */
function gameTimeAt(p: Prepared, T: number) {
  const { g } = p;
  const stop = Math.min(T, g.endedAt ?? T);
  let t = stop - g.startAt;
  for (const [a, b] of p.frozen) {
    const lo = Math.max(a, g.startAt);
    const hi = Math.min(b, stop);
    if (hi > lo) t -= hi - lo;
  }
  return Math.max(0, t);
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

interface FrameState {
  key: string;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

/** Estado del fotograma en el ms `v` del vídeo. La clave identifica fotogramas idénticos. */
export function frameAt(p: Prepared, v: number): FrameState {
  const T = p.t0 + v;
  const { g } = p;
  const sbEntry = [...p.sbs].reverse().find((s) => s.at <= T) ?? p.sbs[0];
  const sb = sbEntry?.sb;
  const gt = gameTimeAt(p, T);
  const paused = p.frozen.some(([a, b]) => T >= a && T < b);
  let clock = '';
  if (sb && T >= g.startAt) {
    if (sb.clock.kind === 'down') clock = mmss(Math.max(0, sb.clock.ref - gt) + 999);
    else if (sb.clock.kind === 'up') clock = mmss(Math.max(0, gt - sb.clock.ref));
  }
  // Cuenta atrás inicial
  const toGo = g.startAt - T;
  const count = toGo > 0 ? String(Math.ceil(toGo / 1000)) : T - g.startAt < 800 ? '¡YA!' : '';
  // Rótulo inferior activo
  const ban = [...p.banners].reverse().find((b) => b.at <= T && T < b.at + BANNER_MS);
  let banPhase = '';
  let banX = 0;
  if (ban) {
    const age = T - ban.at;
    const left = ban.at + BANNER_MS - T;
    if (age < ANIM_MS) {
      banX = 1 - ease(age / ANIM_MS);
      banPhase = `in${Math.floor(age / 33)}`;
    } else if (left < ANIM_MS) {
      banX = -(1 - ease(left / ANIM_MS));
      banPhase = `out${Math.floor(left / 33)}`;
    } else banPhase = 'hold';
  }
  // Pulso del número cuando cambia
  const pulse = (side: 'A' | 'B') => {
    const pu = [...p.pulses].reverse().find((x) => x.side === side && x.at <= T && T - x.at < PULSE_MS);
    return pu ? 1 - (T - pu.at) / PULSE_MS : 0;
  };
  const pa = pulse('A');
  const pb = pulse('B');
  // Tarjeta final
  const endAge = p.end ? T - p.end.at - 600 : -1;
  const endK = endAge >= 0 ? Math.min(1, endAge / 400) : 0;

  const key = [
    sbEntry?.id ?? 0,
    clock,
    paused ? 'P' : '',
    count,
    ban ? `${ban.id}:${banPhase}` : '',
    pa ? Math.floor(pa * 14) : '',
    pb ? Math.floor(pb * 14) : '',
    endK ? Math.floor(endK * 12) : '',
  ].join('|');

  return {
    key,
    draw: (ctx) => {
      ctx.clearRect(0, 0, p.W, p.H);
      if (sb) drawBug(ctx, p, sb, clock, paused, pa, pb);
      if (ban) drawBanner(ctx, p, ban, banX);
      if (count) drawCount(ctx, p, count);
      if (endK > 0 && p.end) drawEnd(ctx, p, sb, endK);
    },
  };
}

// ───────────── dibujo ─────────────

function fitFont(ctx: CanvasRenderingContext2D, text: string, family: string, weight: number, size: number, maxW: number) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 10 && ctx.measureText(text).width > maxW) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  return s;
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawIcon(ctx: CanvasRenderingContext2D, pv: PlayerView, x: number, y: number, size: number) {
  ctx.save();
  ctx.fillStyle = pv.ink;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.14);
  ctx.fill();
  ctx.translate(x + size * 0.19, y + size * 0.19);
  ctx.scale((size * 0.62) / 24, (size * 0.62) / 24);
  ctx.fillStyle = pv.hex;
  ctx.fill(pv.icon, 'evenodd');
  ctx.restore();
}

function drawBug(ctx: CanvasRenderingContext2D, p: Prepared, sb: Scoreboard, clock: string, paused: boolean, pa: number, pb: number) {
  const vertical = p.format === '9:16';
  const total = vertical ? 1000 : 1240;
  const h = vertical ? 92 : 100;
  const y = vertical ? 120 : 44;
  const cw = vertical ? 210 : 250; // bloque central
  const side = (total - cw) / 2;
  const x0 = (p.W - total) / 2;
  const slant = 22;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  // Lado A
  poly(ctx, [[x0, y], [x0 + side + slant, y], [x0 + side, y + h], [x0, y + h]], p.A.hex);
  // Lado B
  poly(ctx, [[x0 + side + cw, y], [x0 + total, y], [x0 + total, y + h], [x0 + side + cw - slant, y + h]], p.B.hex);
  // Centro
  poly(ctx, [[x0 + side + slant, y], [x0 + side + cw, y], [x0 + side + cw - slant, y + h], [x0 + side, y + h]], '#101010');
  ctx.restore();

  const icon = h - 28;
  const numW = vertical ? 96 : 116;
  // Números en caja oscura
  const numBox = (x: number, main: string, k: number, pv: PlayerView) => {
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(x, y, numW, h);
    ctx.save();
    ctx.translate(x + numW / 2, y + h / 2 + 4);
    const sc = 1 + k * 0.35;
    ctx.scale(sc, sc);
    ctx.fillStyle = k ? pv.hex : '#ffffff';
    fitFont(ctx, main, DISPLAY, 900, vertical ? 76 : 86, numW - 12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(main, 0, 0);
    ctx.restore();
  };
  // A: icono · nombre · número (a la derecha, junto al centro)
  drawIcon(ctx, p.A, x0 + 14, y + 14, icon);
  numBox(x0 + side - numW - 4, sb.A.main, pa, p.A);
  ctx.fillStyle = p.A.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  fitFont(ctx, p.A.name.toUpperCase(), DISPLAY, 900, vertical ? 52 : 58, side - numW - icon - 50);
  ctx.fillText(p.A.name.toUpperCase(), x0 + 14 + icon + 14, y + h / 2 + 3);
  // B: número · nombre · icono
  drawIcon(ctx, p.B, x0 + total - 14 - icon, y + 14, icon);
  numBox(x0 + side + cw + 4, sb.B.main, pb, p.B);
  ctx.fillStyle = p.B.ink;
  ctx.textAlign = 'right';
  fitFont(ctx, p.B.name.toUpperCase(), DISPLAY, 900, vertical ? 52 : 58, side - numW - icon - 50);
  ctx.fillText(p.B.name.toUpperCase(), x0 + total - 14 - icon - 14, y + h / 2 + 3);

  // Centro: reloj y texto
  const cx = x0 + side + cw / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  if (paused) {
    ctx.font = `900 ${vertical ? 46 : 52}px ${DISPLAY}`;
    ctx.fillStyle = '#ffb020';
    ctx.fillText('PAUSA', cx, y + h / 2 + 2);
  } else if (clock) {
    ctx.font = `900 ${vertical ? 58 : 66}px ${DISPLAY}`;
    ctx.fillText(clock, cx, y + h / 2 + (sb.center ? -6 : 3));
  }
  const centerText = (sb.center || (clock ? '' : p.mode.name)).toUpperCase();
  if (centerText) {
    ctx.fillStyle = clock || paused ? 'rgba(255,255,255,0.75)' : '#ffffff';
    if (clock || paused) {
      fitFont(ctx, centerText, BODY, 700, 17, cw - 60);
      ctx.fillText(centerText, cx, y + h - 16);
    } else {
      fitFont(ctx, centerText, DISPLAY, 900, 40, cw - 60);
      ctx.fillText(centerText, cx, y + h / 2 + 2);
    }
  }
  // Pestañas inferiores: subtítulos y modo
  const tabY = y + h;
  ctx.font = `700 ${vertical ? 18 : 19}px ${BODY}`;
  const tab = (text: string, x: number, align: CanvasTextAlign, bg: string, fg: string) => {
    const t = text.toUpperCase();
    const w = ctx.measureText(t).width + 24;
    const bx = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    ctx.fillStyle = bg;
    ctx.fillRect(bx, tabY, w, 30);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.fillText(t, bx + w / 2, tabY + 16);
  };
  if (sb.A.sub) tab(sb.A.sub, x0, 'left', 'rgba(0,0,0,0.75)', p.A.hex);
  if (sb.B.sub) tab(sb.B.sub, x0 + total, 'right', 'rgba(0,0,0,0.75)', p.B.hex);
  tab(p.mode.name, cx, 'center', p.mode.color, '#0d0d0d');
}

function drawBanner(ctx: CanvasRenderingContext2D, p: Prepared, b: BannerView, k: number) {
  const vertical = p.format === '9:16';
  const x = vertical ? 40 : 64;
  const y = vertical ? p.H - 520 : p.H - 230;
  const off = k * (vertical ? 900 : 1100);
  ctx.save();
  ctx.translate(-Math.max(0, off), 0);
  ctx.globalAlpha = 1 - Math.max(0, -k);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 20;
  const title = b.title.toUpperCase();
  const ts = fitFont(ctx, title, DISPLAY, 900, vertical ? 84 : 92, vertical ? 960 : 1300);
  const tw = ctx.measureText(title).width;
  const th = ts * 0.95;
  poly(ctx, [[x, y], [x + tw + 70, y], [x + tw + 46, y + th + 20], [x, y + th + 20]], b.hex);
  ctx.shadowBlur = 0;
  ctx.fillStyle = b.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, x + 26, y + (th + 20) / 2 + 3);
  if (b.sub) {
    const sub = b.sub;
    fitFont(ctx, sub, BODY, 700, vertical ? 34 : 36, vertical ? 960 : 1300);
    const sw = ctx.measureText(sub).width;
    ctx.fillStyle = 'rgba(10,10,10,0.88)';
    ctx.fillRect(x, y + th + 20, sw + 52, 58);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(sub, x + 26, y + th + 20 + 30);
  }
  ctx.restore();
}

function drawCount(ctx: CanvasRenderingContext2D, p: Prepared, text: string) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${p.format === '9:16' ? 320 : 300}px ${DISPLAY}`;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = text === '¡YA!' ? p.mode.color : '#ffffff';
  ctx.fillText(text, p.W / 2, p.H / 2);
  ctx.restore();
}

function drawEnd(ctx: CanvasRenderingContext2D, p: Prepared, sb: Scoreboard | undefined, k: number) {
  const w = p.end?.winner === p.A.id ? p.A : p.end?.winner === p.B.id ? p.B : null;
  const vertical = p.format === '9:16';
  const cw = vertical ? 900 : 1000;
  const ch = vertical ? 420 : 360;
  const x = (p.W - cw) / 2;
  const y = (p.H - ch) / 2 + (1 - ease(k)) * 80;
  ctx.save();
  ctx.globalAlpha = ease(k);
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 40;
  poly(ctx, [[x, y], [x + cw, y], [x + cw - 30, y + ch], [x, y + ch]], w?.hex ?? '#f4f1ea');
  ctx.shadowBlur = 0;
  const ink = w?.ink ?? '#0d0d0d';
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 34px ${BODY}`;
  ctx.fillText(w ? 'VICTORIA' : 'EMPATE', p.W / 2, y + 70);
  const big = w ? w.name.toUpperCase() : `${p.A.name} · ${p.B.name}`.toUpperCase();
  fitFont(ctx, big, DISPLAY, 900, vertical ? 170 : 170, cw - 80);
  ctx.fillText(big, p.W / 2, y + ch / 2 + 6);
  if (sb) {
    ctx.font = `900 64px ${DISPLAY}`;
    ctx.fillText(`${sb.A.main} – ${sb.B.main}`, p.W / 2, y + ch - 62);
  }
  ctx.restore();
}
