// Motor de voz propio (Vosk, en el propio móvil). No depende de Siri, de Google ni de internet
// una vez descargado el modelo. Se usa cuando el reconocimiento del navegador no está disponible.

import type { Model } from 'vosk-browser';

export const MODEL_URL = './models/vosk-es.tar.gz';

export interface VoskHandlers {
  onPartial(text: string): void;
  onFinal(text: string): void;
  onLevel(level: number): void;
  onProgress(fraction: number): void;
  onReady(): void;
}

let modelPromise: Promise<Model> | null = null;
const READY_KEY = 'nerf.voskReady';

/** Descarga con progreso (calienta la caché del navegador antes de que el motor lo pida). */
async function prefetch(url: string, onProgress: (f: number) => void): Promise<void> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar el modelo de voz (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 39_800_000;
  const reader = res.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    onProgress(Math.min(0.97, got / total));
  }
}

/** ¿Ya se descargó alguna vez? (el motor lo guarda en el almacenamiento del navegador) */
export function voskModelStored(): boolean {
  try {
    return localStorage.getItem(READY_KEY) === '1';
  } catch {
    return false;
  }
}

export function loadModel(onProgress: (f: number) => void): Promise<Model> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const url = new URL(MODEL_URL, location.href).toString();
      const lib = import('vosk-browser');
      if (!voskModelStored()) await prefetch(url, onProgress);
      onProgress(0.98);
      const { createModel } = await lib;
      // Siempre la misma dirección: el motor la usa como clave de su copia guardada
      const model = await createModel(url, -1);
      try {
        localStorage.setItem(READY_KEY, '1');
      } catch {}
      onProgress(1);
      return model;
    })().catch((e) => {
      modelPromise = null;
      throw e;
    });
  }
  return modelPromise;
}

export class VoskEngine {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rec: InstanceType<Model['KaldiRecognizer']> | null = null;
  private running = false;

  constructor(private h: VoskHandlers) {}

  /**
   * Llamar dentro de un toque: el AudioContext y el micro se piden de inmediato
   * (iOS lo exige) y el modelo se carga en paralelo.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    void this.ctx.resume();
    const mic = navigator.mediaDevices.getUserMedia({
      video: false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    try {
      const [model, stream] = await Promise.all([loadModel(this.h.onProgress), mic]);
      if (!this.running) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const ctx = this.ctx!;
      if (ctx.state !== 'running') await ctx.resume().catch(() => {});
      const rec = new model.KaldiRecognizer(ctx.sampleRate);
      rec.on('result', (m: any) => {
        const t = (m?.result?.text ?? '').trim();
        if (t) this.h.onFinal(t);
      });
      rec.on('partialresult', (m: any) => {
        const t = (m?.result?.partial ?? '').trim();
        if (t) this.h.onPartial(t);
      });
      this.rec = rec;
      this.source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i += 8) sum += data[i] * data[i];
        this.h.onLevel(Math.min(1, Math.sqrt(sum / (data.length / 8)) * 6));
        try {
          rec.acceptWaveform(e.inputBuffer);
        } catch {
          /* el reconocedor aún no está listo */
        }
      };
      this.source.connect(node);
      node.connect(ctx.destination); // necesario para que el nodo procese (no emite sonido)
      this.node = node;
      this.h.onReady();
    } catch (e) {
      this.stop();
      throw e;
    }
  }

  stop() {
    this.running = false;
    try {
      this.node?.disconnect();
      this.source?.disconnect();
    } catch {}
    this.node = null;
    this.source = null;
    try {
      this.rec?.remove();
    } catch {}
    this.rec = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  get active() {
    return this.running;
  }
}
