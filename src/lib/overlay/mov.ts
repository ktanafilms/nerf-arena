// Escritor mínimo de QuickTime (.mov) con fotogramas PNG con transparencia (canal alfa).
// Los fotogramas repetidos no se duplican: varias muestras apuntan a los mismos bytes,
// así el vídeo es de ritmo constante (30 fps) y el archivo sigue siendo pequeño.

class Buf {
  private parts: Uint8Array[] = [];
  private cur = new Uint8Array(1024);
  private n = 0;
  private grow(k: number) {
    if (this.n + k <= this.cur.length) return;
    const next = new Uint8Array(Math.max(this.cur.length * 2, this.n + k));
    next.set(this.cur.subarray(0, this.n));
    this.cur = next;
  }
  u8(v: number) {
    this.grow(1);
    this.cur[this.n++] = v & 0xff;
    return this;
  }
  u16(v: number) {
    return this.u8(v >> 8).u8(v);
  }
  u32(v: number) {
    return this.u16((v >>> 16) & 0xffff).u16(v & 0xffff);
  }
  str(s: string) {
    for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i));
    return this;
  }
  zeros(k: number) {
    for (let i = 0; i < k; i++) this.u8(0);
    return this;
  }
  bytes(b: Uint8Array) {
    this.grow(b.length);
    this.cur.set(b, this.n);
    this.n += b.length;
    return this;
  }
  get length() {
    return this.n;
  }
  out() {
    void this.parts;
    return this.cur.slice(0, this.n);
  }
}

/** Átomo: tamaño (4) + tipo (4) + contenido */
function atom(type: string, ...children: (Uint8Array | ((b: Buf) => void))[]): Uint8Array {
  const body = new Buf();
  for (const c of children) {
    if (c instanceof Uint8Array) body.bytes(c);
    else c(body);
  }
  const b = new Buf();
  b.u32(8 + body.length).str(type).bytes(body.out());
  return b.out();
}

const MATRIX = (b: Buf) => {
  [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].forEach((v) => b.u32(v));
};

export interface MovFrame {
  /** Índice del PNG único que usa este fotograma */
  png: number;
}

/**
 * Monta el .mov.
 * @param pngs PNG únicos (en orden de aparición)
 * @param frames para cada fotograma, qué PNG único usa
 */
export async function buildMov(pngs: Blob[], frames: number[], width: number, height: number, fps: number): Promise<Blob> {
  const ftyp = atom('ftyp', (b) => b.str('qt  ').u32(0x00000200).str('qt  '));
  const total = pngs.reduce((s, p) => s + p.size, 0);
  const mdatHeader = new Buf().u32(8 + total).str('mdat').out();
  // Desplazamiento de cada PNG único dentro del archivo
  const offsets: number[] = [];
  let off = ftyp.length + mdatHeader.length;
  for (const p of pngs) {
    offsets.push(off);
    off += p.size;
  }
  const nFrames = frames.length;
  const movieScale = 1000;
  const movieDur = Math.round((nFrames * movieScale) / fps);
  const now = Math.floor(Date.now() / 1000) + 2082844800; // segundos desde 1904

  const mvhd = atom('mvhd', (b) => {
    b.u32(0).u32(now).u32(now).u32(movieScale).u32(movieDur);
    b.u32(0x00010000).u16(0x0100).zeros(10);
    MATRIX(b);
    b.zeros(24).u32(2);
  });
  const tkhd = atom('tkhd', (b) => {
    b.u32(0x0000000f).u32(now).u32(now).u32(1).u32(0).u32(movieDur).zeros(8);
    b.u16(0).u16(0).u16(0).u16(0);
    MATRIX(b);
    b.u32(width << 16).u32(height << 16);
  });
  const mdhd = atom('mdhd', (b) => b.u32(0).u32(now).u32(now).u32(fps).u32(nFrames).u16(0).u16(0));
  const hdlr = (type: string, sub: string, name: string) =>
    atom('hdlr', (b) => {
      b.u32(0).str(type).str(sub).u32(0).u32(0).u32(0).u8(name.length).str(name);
    });
  const vmhd = atom('vmhd', (b) => b.u32(0x00000001).u16(0x0040).u16(0x8000).u16(0x8000).u16(0x8000));
  const dinf = atom('dinf', atom('dref', (b) => b.u32(0).u32(1).bytes(atom('alis', (bb) => bb.u32(0x00000001)))));
  const stsd = atom(
    'stsd',
    (b) => b.u32(0).u32(1),
    atom('png ', (b) => {
      b.zeros(6).u16(1); // reservado + índice de referencia
      b.u16(0).u16(0).u32(0); // versión, revisión, fabricante
      b.u32(0).u32(0x200); // calidad temporal / espacial
      b.u16(width).u16(height);
      b.u32(0x00480000).u32(0x00480000); // 72 ppp
      b.u32(0).u16(1); // tamaño de datos, fotogramas por muestra
      const name = 'PNG';
      b.u8(name.length).str(name).zeros(31 - name.length);
      b.u16(32); // profundidad: 32 bits = con alfa
      b.u16(0xffff); // sin tabla de color
    }),
  );
  const stts = atom('stts', (b) => b.u32(0).u32(1).u32(nFrames).u32(1));
  const stsc = atom('stsc', (b) => b.u32(0).u32(1).u32(1).u32(1).u32(1));
  const stsz = atom('stsz', (b) => {
    b.u32(0).u32(0).u32(nFrames);
    for (const f of frames) b.u32(pngs[f].size);
  });
  const stco = atom('stco', (b) => {
    b.u32(0).u32(nFrames);
    for (const f of frames) b.u32(offsets[f]);
  });
  const stbl = atom('stbl', stsd, stts, stsc, stsz, stco);
  const minf = atom('minf', vmhd, hdlr('dhlr', 'alis', 'DataHandler'), dinf, stbl);
  const mdia = atom('mdia', mdhd, hdlr('mhlr', 'vide', 'VideoHandler'), minf);
  const trak = atom('trak', tkhd, mdia);
  const moov = atom('moov', mvhd, trak);

  return new Blob([ftyp as BlobPart, mdatHeader as BlobPart, ...pngs, moov as BlobPart], { type: 'video/quicktime' });
}
