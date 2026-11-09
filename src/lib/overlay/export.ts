// Genera el vídeo del HUD (.mov con transparencia) a partir de la partida terminada.

import type { Room } from '../types';
import { frameAt, prepare, type Format, PREROLL } from './render';
import { buildMov } from './mov';
import { modeInfo } from '../modes';

export const FPS = 30;

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
}

export async function exportHud(
  room: Room,
  format: Format,
  onProgress: (f: number) => void,
  isCancelled: () => boolean = () => false,
): Promise<ExportResult> {
  // Las fuentes tienen que estar cargadas antes de dibujar en el canvas
  await Promise.all([
    document.fonts.load('900 80px "Big Shoulders Display"'),
    document.fonts.load('700 30px "Archivo"'),
  ]).catch(() => {});

  const p = prepare(room, format);
  const canvas = document.createElement('canvas');
  canvas.width = p.W;
  canvas.height = p.H;
  const ctx = canvas.getContext('2d')!;
  const n = Math.ceil((p.duration / 1000) * FPS);

  const pngs: Blob[] = [];
  const frames: number[] = [];
  const byKey = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    if (isCancelled()) throw new Error('cancelado');
    const st = frameAt(p, (i * 1000) / FPS);
    let idx = byKey.get(st.key);
    if (idx === undefined) {
      st.draw(ctx);
      const png = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG'))), 'image/png'));
      idx = pngs.length;
      pngs.push(png);
      byKey.set(st.key, idx);
    }
    frames.push(idx);
    if (i % 15 === 0) {
      onProgress(i / n);
      await yieldUI(); // deja respirar a la interfaz
    }
  }
  onProgress(1);
  const blob = await buildMov(pngs, frames, p.W, p.H, FPS);
  const g = room.game!;
  const d = new Date(g.startAt);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  const name = `hud-${modeInfo(g.mode).id}-${format === '16:9' ? 'horizontal' : 'vertical'}-${stamp}.mov`;
  return {
    blob,
    file: new File([blob], name, { type: 'video/quicktime' }),
    frames: n,
    unique: pngs.length,
    seconds: p.duration / 1000,
  };
}

export const SYNC_NOTE = `El ¡YA! (destello y pitido) está en el segundo ${PREROLL / 1000} del vídeo.`;
