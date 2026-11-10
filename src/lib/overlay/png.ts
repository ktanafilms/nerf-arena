// Codificador PNG propio para los fotogramas del HUD.
// El del navegador (canvas.toBlob) comprime poco: un fotograma casi todo transparente pesa
// ~70 KB. Aquí las filas vacías no se tocan y el resto lleva el filtro PNG que mejor le va antes de
// comprimir con el zlib nativo (CompressionStream), y el resultado ocupa varias veces menos.

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  const t = new TextEncoder().encode(type);
  out.set(t, 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32([t, data]));
  return out;
}

/**
 * Aplica el filtro PNG `f` (1 Sub, 2 Up, 4 Paeth) a una fila y la escribe en `raw`.
 * Con `limit`, solo mide cuánto «cuesta» (suma de desviaciones) y para al pasarse.
 */
function filterRow(px: Uint8ClampedArray, raw: Uint8Array, f: number, s: number, up: number, o: number, n: number, limit = -1): number {
  const measure = limit >= 0;
  let cost = 0;
  if (!measure) raw[o] = f;
  for (let i = 0; i < n; i++) {
    const a = i >= 4 ? px[s + i - 4] : 0;
    let p: number;
    if (f === 1) p = a;
    else if (f === 2) p = px[up + i];
    else {
      const b = px[up + i];
      const c = i >= 4 ? px[up + i - 4] : 0;
      const q = a + b - c;
      const pa = q > a ? q - a : a - q;
      const pb = q > b ? q - b : b - q;
      const pc = q > c ? q - c : c - q;
      p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
    const d = (px[s + i] - p) & 0xff;
    if (measure) {
      cost += d < 128 ? d : 256 - d;
      if (cost >= limit) return cost;
    } else raw[o + 1 + i] = d;
  }
  return cost;
}

export const fastPngSupported = typeof CompressionStream !== 'undefined';

/** PNG RGBA de 8 bits a partir de los píxeles (sirve también dentro de un worker) */
export async function encodeRGBA(px: Uint8ClampedArray, w: number, h: number): Promise<Uint8Array> {
  const words = new Uint32Array(px.buffer, px.byteOffset, w * h);
  const stride = 1 + w * 4;
  const raw = new Uint8Array(h * stride); // a cero: las filas vacías ya están hechas
  for (let y = 0; y < h; y++) {
    const rowW = y * w;
    let empty = true;
    for (let x = 0; x < w; x++) {
      if (words[rowW + x] !== 0) {
        empty = false;
        break;
      }
    }
    if (empty) continue;
    // Filtro por fila: el que deje los bytes más cerca de cero (comprime mejor)
    const s = rowW * 4;
    const o = y * stride;
    if (y === 0) {
      filterRow(px, raw, 1, s, -1, o, w * 4);
      continue;
    }
    let best = 1;
    let bestCost = Infinity;
    for (const f of [1, 2, 4]) {
      const cost = filterRow(px, raw, f, s, s - w * 4, o, w * 4, bestCost);
      if (cost < bestCost) {
        bestCost = cost;
        best = f;
      }
    }
    filterRow(px, raw, best, s, s - w * 4, o, w * 4);
  }
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Codifica en varios hilos a la vez (workers). Cada fotograma se copia del canvas en el
 * hilo principal y se comprime fuera, así la exportación no bloquea la pantalla.
 */
export class PngPool {
  private workers: Worker[] = [];
  private next = 0;
  private seq = 0;
  private waiting = new Map<number, { res: (b: Blob) => void; rej: (e: any) => void }>();
  readonly size: number;

  constructor() {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./png.worker.ts', import.meta.url), { type: 'module' });
        w.onmessage = (e: MessageEvent<{ id: number; png?: Uint8Array; err?: string }>) => {
          const job = this.waiting.get(e.data.id);
          if (!job) return;
          this.waiting.delete(e.data.id);
          if (e.data.png) job.res(new Blob([e.data.png as BlobPart], { type: 'image/png' }));
          else job.rej(new Error(e.data.err ?? 'PNG'));
        };
        this.workers.push(w);
      }
    } catch {
      this.workers = [];
    }
    this.size = Math.max(1, this.workers.length);
  }

  encode(px: Uint8ClampedArray, w: number, h: number): Promise<Blob> {
    if (!this.workers.length) return encodeRGBA(px, w, h).then((b) => new Blob([b as BlobPart], { type: 'image/png' }));
    const id = ++this.seq;
    const worker = this.workers[this.next++ % this.workers.length];
    return new Promise((res, rej) => {
      this.waiting.set(id, { res, rej });
      worker.postMessage({ id, px, w, h }, [px.buffer]);
    });
  }

  close() {
    for (const w of this.workers) w.terminate();
    for (const j of this.waiting.values()) j.rej(new Error('cancelado'));
    this.waiting.clear();
  }
}
