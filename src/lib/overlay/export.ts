// Genera el vídeo del HUD (.mov con transparencia) de una partida o de toda una sesión.

import type { Room } from '../types';
import { prepareSession, sessionFrameAt, segmentAt, nextSegmentStart, type Format, type Gaps, PREROLL } from './render';
import { buildMov } from './mov';
import { PngPool, fastPngSupported } from './png';
import { modeInfo } from '../modes';

export const FPS = 30;
const MAX_BYTES = 3.9 * 1024 ** 3; // el formato .mov usado guarda posiciones de 32 bits

/** Cede el turno sin el retraso mínimo de setTimeout (que en segundo plano llega a 1 s). */
function yieldUI() {
  return new Promise<void>((res) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => res();
    ch.port2.postMessage(0);
  });
}

export interface ExportResult {
  blob: Blob;
  file: File;
  frames: number;
  unique: number;
  seconds: number;
  games: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function fileStamp(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export async function exportHud(
  rooms: Room | Room[],
  format: Format,
  onProgress: (f: number) => void,
  isCancelled: () => boolean = () => false,
  gaps: Gaps = 'real',
): Promise<ExportResult> {
  const list = Array.isArray(rooms) ? rooms : [rooms];
  // Las fuentes tienen que estar cargadas antes de dibujar en el canvas
  await Promise.all([
    document.fonts.load('900 80px "Big Shoulders Display"'),
    document.fonts.load('700 30px "Archivo"'),
  ]).catch(() => {});

  const ses = prepareSession(list, format, gaps);
  if (!ses.segments.length) throw new Error('no hay partidas');
  const canvas = document.createElement('canvas');
  canvas.width = ses.W;
  canvas.height = ses.H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const n = Math.ceil((ses.duration / 1000) * FPS);

  // Cada PNG único se codifica una sola vez; con varios hilos, en paralelo y sin bloquear
  const pool = fastPngSupported ? new PngPool() : null;
  const jobs: Promise<Blob>[] = [];
  const inflight: Promise<unknown>[] = [];
  const frames: number[] = [];
  const byKey = new Map<string, number>();
  let bytes = 0;
  const count = (png: Blob) => {
    bytes += png.size;
    if (bytes > MAX_BYTES) throw new Error('el vídeo sale demasiado grande; prueba «Seguidas» o menos partidas');
    return png;
  };
  const pngOf = async (key: string, draw: (c: CanvasRenderingContext2D) => void) => {
    let idx = byKey.get(key);
    if (idx === undefined) {
      draw(ctx);
      let job: Promise<Blob>;
      if (pool) {
        job = pool.encode(ctx.getImageData(0, 0, ses.W, ses.H).data, ses.W, ses.H).then(count);
        inflight.push(job);
        if (inflight.length >= pool.size * 2) await inflight.shift();
      } else {
        job = new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG'))), 'image/png')).then(count);
        await job;
      }
      job.catch(() => {}); // el error se recoge al final
      idx = jobs.length;
      jobs.push(job);
      byKey.set(key, idx);
    }
    return idx;
  };

  let pngs: Blob[];
  try {
    let lastYield = 0;
    for (let i = 0; i < n; ) {
      if (isCancelled()) throw new Error('cancelado');
      const v = (i * 1000) / FPS;
      if (!segmentAt(ses, v)) {
        // Descanso entre partidas: todo transparente, se añade de golpe
        const idx = await pngOf('vacío', (c) => c.clearRect(0, 0, ses.W, ses.H));
        const until = Math.max(i + 1, Math.min(n, Math.ceil((nextSegmentStart(ses, v) / 1000) * FPS)));
        while (i < until) {
          frames.push(idx);
          i++;
        }
      } else {
        const st = sessionFrameAt(ses, v);
        frames.push(await pngOf(st.key, st.draw));
        i++;
      }
      if (i - lastYield >= 15) {
        lastYield = i;
        onProgress(i / n);
        await yieldUI(); // deja respirar a la interfaz
      }
    }
    pngs = await Promise.all(jobs);
  } finally {
    pool?.close();
  }
  onProgress(1);
  const blob = await buildMov(pngs, frames, ses.W, ses.H, FPS);
  const first = ses.segments[0].room.game!;
  const what = ses.segments.length > 1 ? `sesion-${ses.segments.length}-partidas` : modeInfo(first.mode).id;
  const name = `hud-${what}-${format === '16:9' ? 'horizontal' : 'vertical'}-${fileStamp(first.startAt)}.mov`;
  return {
    blob,
    file: new File([blob], name, { type: 'video/quicktime' }),
    frames: n,
    unique: pngs.length,
    seconds: ses.duration / 1000,
    games: ses.segments.length,
  };
}

export const SYNC_NOTE = `El ¡YA! (destello y pitido) está en el segundo ${PREROLL / 1000} del vídeo.`;
