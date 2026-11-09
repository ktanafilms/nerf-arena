// Diseño sonoro 100 % sintetizado con Web Audio (original, sin archivos).

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;

export function audioCtx(): AudioContext | null {
  return ctx;
}

/** Debe llamarse dentro de un toque del usuario (restricción de los navegadores móviles). */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp).connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state !== 'running') ctx.resume();
    if ((unlockAudio as any).done) return;
    (unlockAudio as any).done = true;
    // Pulso silencioso para desbloquear iOS (solo una vez)
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(master!);
    o.start();
    o.stop(ctx.currentTime + 0.01);
  } catch {
    /* sin audio */
  }
}

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number; attack?: number } = {},
) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + (opts.at ?? 0);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
  const v = opts.vol ?? 0.4;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + (opts.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, opts: { vol?: number; at?: number; freq?: number; q?: number; type?: BiquadFilterType } = {}) {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + (opts.at ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = opts.type ?? 'bandpass';
  f.frequency.value = opts.freq ?? 2000;
  f.Q.value = opts.q ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(opts.vol ?? 0.4, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  /** Confirmación de orden entendida */
  confirm() {
    tone(880, 0.07, { type: 'square', vol: 0.18 });
    tone(1320, 0.09, { type: 'square', vol: 0.16, at: 0.06 });
  },
  /** Marcador de acierto: chasquido metálico seco */
  hitmarker() {
    noise(0.05, { freq: 5200, q: 6, vol: 0.7 });
    tone(2400, 0.06, { type: 'triangle', vol: 0.35 });
    tone(3600, 0.05, { type: 'sine', vol: 0.2, at: 0.035 });
    tone(523, 0.18, { type: 'triangle', vol: 0.18, at: 0.08 });
    tone(784, 0.22, { type: 'triangle', vol: 0.16, at: 0.12 });
  },
  /** Impacto recibido: golpe grave + distorsión */
  hurt() {
    tone(140, 0.35, { type: 'sawtooth', vol: 0.5, slide: 45 });
    noise(0.3, { freq: 600, q: 0.7, vol: 0.6, type: 'lowpass' });
    tone(70, 0.4, { type: 'sine', vol: 0.6 });
  },
  heartbeat() {
    tone(60, 0.16, { type: 'sine', vol: 0.9, slide: 40 });
    tone(55, 0.18, { type: 'sine', vol: 0.7, slide: 38, at: 0.24 });
  },
  countdown() {
    tone(660, 0.16, { type: 'square', vol: 0.3 });
  },
  /** ¡YA! + claqueta: pitido fuerte y nítido para sincronizar cámaras por audio */
  go() {
    tone(1000, 0.14, { type: 'square', vol: 0.75, attack: 0.001 });
    tone(2000, 0.14, { type: 'square', vol: 0.4, attack: 0.001 });
    tone(220, 0.6, { type: 'sawtooth', vol: 0.3, slide: 440, at: 0.12 });
  },
  pause() {
    tone(600, 0.12, { type: 'triangle', vol: 0.3, slide: 300 });
    tone(300, 0.18, { type: 'triangle', vol: 0.3, slide: 200, at: 0.12 });
  },
  resume() {
    tone(300, 0.1, { type: 'triangle', vol: 0.3, slide: 600 });
    tone(600, 0.14, { type: 'triangle', vol: 0.3, slide: 900, at: 0.1 });
  },
  undo() {
    tone(900, 0.08, { type: 'sine', vol: 0.3, slide: 400 });
    tone(500, 0.12, { type: 'sine', vol: 0.3, slide: 250, at: 0.08 });
  },
  alarm() {
    for (let i = 0; i < 4; i++) {
      tone(880, 0.12, { type: 'sawtooth', vol: 0.3, at: i * 0.25 });
      tone(660, 0.12, { type: 'sawtooth', vol: 0.3, at: i * 0.25 + 0.12 });
    }
  },
  victory() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => tone(f, 0.35, { type: 'square', vol: 0.18, at: i * 0.11 }));
    tone(1046, 0.9, { type: 'triangle', vol: 0.3, at: 0.45 });
    tone(1568, 0.9, { type: 'triangle', vol: 0.15, at: 0.45 });
  },
  defeat() {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.25, at: i * 0.18 }));
  },
  whoosh() {
    noise(0.25, { freq: 1200, q: 0.8, vol: 0.18 });
  },
  error() {
    tone(200, 0.15, { type: 'square', vol: 0.2 });
    tone(150, 0.2, { type: 'square', vol: 0.2, at: 0.13 });
  },
  click() {
    tone(1800, 0.03, { type: 'square', vol: 0.12 });
  },
};

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

export const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator;
