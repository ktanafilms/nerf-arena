// Marcadores de las jugadas para el programa de edición. Los tiempos cuentan desde el inicio
// del vídeo del HUD (3 s antes del ¡YA!), igual que el .mov exportado.

import type { Room } from './types';
import { describe } from './fx.svelte';
import { modeInfo } from './modes';
import { PREROLL, prepareSession, type Gaps } from './overlay/render';
import { fileStamp } from './overlay/export';

const FPS = 30;

interface Mark {
  ms: number;
  text: string;
  color: string; // color de marcador de Resolve
}

type Rooms = Room | Room[];
const listOf = (r: Rooms) => (Array.isArray(r) ? r : [r]);

/** Marcadores de una o varias partidas, con los tiempos del vídeo del HUD de esa misma selección */
function marks(rooms: Rooms, gaps: Gaps = 'real'): Mark[] {
  const ses = prepareSession(listOf(rooms), '16:9', gaps);
  const many = ses.segments.length > 1;
  return ses.segments.flatMap((seg, i) => gameMarks(seg.room, seg.offset, many ? `Partida ${i + 1} · ${modeInfo(seg.room.game!.mode).name} · ` : ''));
}

function gameMarks(room: Room, offset: number, prefix: string): Mark[] {
  const g = room.game!;
  const t0 = g.startAt - PREROLL - offset;
  const colorOf = (kind: string) =>
    ['hit', 'explode', 'bombhit'].includes(kind)
      ? 'Red'
      : ['win', 'draw', 'roundend', 'defused', 'survived'].includes(kind)
        ? 'Green'
        : ['levelup', 'bombpass', 'claim', 'call'].includes(kind)
          ? 'Yellow'
          : ['pause', 'resume', 'undo'].includes(kind)
            ? 'Purple'
            : 'Blue';
  const out: Mark[] = [{ ms: PREROLL + offset, text: `${prefix}¡YA! (claqueta)`, color: 'Cyan' }];
  for (const e of g.events) {
    if (e.kind === 'start') continue;
    const text = describe(room, g, e);
    if (text) out.push({ ms: e.at - t0, text, color: colorOf(e.kind) });
  }
  return out;
}

const tc = (ms: number, base = 0) => {
  const f = Math.round((ms / 1000) * FPS) + base * 3600 * FPS;
  const fr = f % FPS;
  const s = Math.floor(f / FPS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(fr)}`;
};
const clean = (t: string) => t.replace(/[|\r\n]/g, ' ').replace('▸', '>');
const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function stamp(rooms: Rooms) {
  const list = listOf(rooms).sort((a, b) => a.game!.startAt - b.game!.startAt);
  const what = list.length > 1 ? `sesion-${list.length}-partidas` : modeInfo(list[0].game!.mode).id;
  return `${what}-${fileStamp(list[0].game!.startAt)}`;
}
const title = (rooms: Rooms) => {
  const list = listOf(rooms);
  return list.length > 1 ? `Sesión (${list.length} partidas)` : modeInfo(list[0].game!.mode).name;
};

/** EDL con marcadores (DaVinci Resolve: Línea de tiempo › Importar › Marcadores de línea de tiempo desde EDL). */
export function edl(room: Rooms, gaps: Gaps = 'real'): File {
  const lines = [`TITLE: Nerf Arena ${title(room)}`, 'FCM: NON-DROP FRAME', ''];
  marks(room, gaps).forEach((m, i) => {
    const a = tc(m.ms, 1);
    const b = tc(m.ms + 1000 / FPS, 1);
    lines.push(`${String(i + 1).padStart(3, '0')}  001      V     C        ${a} ${b} ${a} ${b}  `);
    lines.push(` |C:Resolve${m.color} |M:${clean(m.text)} |D:1`);
    lines.push('');
  });
  return new File([lines.join('\r\n')], `marcadores-${stamp(room)}.edl`, { type: 'text/plain' });
}

/** XML de Final Cut 7 con una secuencia y sus marcadores (Premiere: Archivo › Importar). */
export function xmeml(room: Rooms, format: '16:9' | '9:16' = '16:9', gaps: Gaps = 'real'): File {
  const ms = marks(room, gaps);
  const dur = Math.round((prepareSession(listOf(room), format, gaps).duration / 1000) * FPS);
  const [w, h] = format === '16:9' ? [1920, 1080] : [1080, 1920];
  const mk = ms
    .map((m) => `    <marker><name>${xml(m.text)}</name><comment></comment><in>${Math.round((m.ms / 1000) * FPS)}</in><out>-1</out></marker>`)
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence>
    <name>Nerf Arena ${xml(title(room))} ${stamp(room)}</name>
    <duration>${dur}</duration>
    <rate><timebase>${FPS}</timebase><ntsc>FALSE</ntsc></rate>
    <timecode><rate><timebase>${FPS}</timebase><ntsc>FALSE</ntsc></rate><string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>
${mk}
    <media><video><format><samplecharacteristics><width>${w}</width><height>${h}</height></samplecharacteristics></format><track></track></video></media>
  </sequence>
</xmeml>
`;
  return new File([body], `marcadores-${stamp(room)}.xml`, { type: 'application/xml' });
}

/** CSV legible (tiempo;jugada) */
export function csv(room: Rooms, gaps: Gaps = 'real'): File {
  const rows = ['tiempo;segundos;jugada', ...marks(room, gaps).map((m) => `${tc(m.ms)};${(m.ms / 1000).toFixed(2)};${clean(m.text).replace(/;/g, ',')}`)];
  return new File(['﻿' + rows.join('\n')], `marcadores-${stamp(room)}.csv`, { type: 'text/csv' });
}

/** Guarda archivos: compartir (iPhone) o descargar. */
export async function saveFiles(files: File[]) {
  try {
    if (navigator.canShare?.({ files })) {
      await navigator.share({ files });
      return;
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
  }
  for (const f of files) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    await new Promise((r) => setTimeout(r, 300));
  }
}
