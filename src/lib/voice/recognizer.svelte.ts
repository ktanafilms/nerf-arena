// Reconocimiento de voz continuo (Web Speech API) con reinicio automático,
// filtro por indicativo y bloqueo mientras habla el narrador.

import { parseCommands, type Command } from './matcher';
import { narratorBusy } from '../audio/narrator';

const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export const speechSupported = !!SR;

export type VoiceState = 'off' | 'starting' | 'listening' | 'denied' | 'unsupported' | 'error';

export interface Heard {
  text: string;
  cmd: Command | null;
  at: number;
}

class Recognizer {
  state = $state<VoiceState>(speechSupported ? 'off' : 'unsupported');
  errorMsg = $state<string | null>(null);
  level = $state(0); // 0..1 nivel de entrada del micro
  heard = $state<Heard | null>(null);

  private rec: any = null;
  private wanted = false;
  private consumed = new Map<number, number>();
  private lastCmdAt: Partial<Record<Command, number>> = {};
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;

  callsign = '';
  others: string[] = [];
  allowed: Command[] = [];
  onCommand: (c: Command) => void = () => {};

  // medidor de nivel
  private stream: MediaStream | null = null;
  private raf = 0;
  meterEnabled = true;

  async start() {
    if (!SR) {
      this.state = 'unsupported';
      return;
    }
    this.wanted = true;
    if (this.rec) return;
    this.state = 'starting';
    this.boot();
    if (this.meterEnabled) this.startMeter();
  }

  stop() {
    this.wanted = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    try {
      this.rec?.abort();
    } catch {}
    this.rec = null;
    this.stopMeter();
    if (this.state !== 'denied' && this.state !== 'unsupported') this.state = 'off';
  }

  private boot() {
    const rec = new SR();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    this.consumed.clear();
    rec.onstart = () => {
      this.state = 'listening';
      this.errorMsg = null;
    };
    rec.onresult = (e: any) => this.onResult(e);
    rec.onerror = (e: any) => {
      const err = e?.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        this.state = 'denied';
        this.errorMsg =
          err === 'service-not-allowed'
            ? 'El reconocimiento de voz no está disponible. En iPhone activa Ajustes › General › Teclado › Dictado.'
            : 'Permiso de micrófono denegado.';
        this.wanted = false;
      } else if (err === 'network') {
        this.errorMsg = 'El reconocimiento de voz necesita internet.';
        this.failures++;
      } else if (err === 'audio-capture') {
        this.errorMsg = 'El micrófono está ocupado por otra app.';
        this.failures++;
        // En algunos Android el medidor de nivel bloquea el micro: lo apagamos
        if (this.stream) {
          this.stopMeter();
          this.meterEnabled = false;
        }
      }
    };
    rec.onend = () => {
      this.rec = null;
      if (!this.wanted) return;
      // Reinicio automático (el modo continuo se corta solo tras silencios)
      const delay = Math.min(250 + this.failures * 500, 4000);
      this.restartTimer = setTimeout(() => {
        if (this.wanted && !this.rec) this.boot();
      }, delay);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.rec = null;
    }
  }

  private onResult(e: any) {
    if (this.state !== 'listening') this.state = 'listening';
    this.failures = 0;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      let text: string = res[0]?.transcript ?? '';
      let cmds = parseCommands(text, this.callsign, this.allowed, this.others);
      if (res.isFinal && cmds.length === 0) {
        for (let a = 1; a < res.length; a++) {
          const alt = parseCommands(res[a].transcript, this.callsign, this.allowed, this.others);
          if (alt.length) {
            cmds = alt;
            text = res[a].transcript;
            break;
          }
        }
      }
      const already = this.consumed.get(i) ?? 0;
      const fresh = cmds.slice(already);
      this.consumed.set(i, Math.max(already, cmds.length));
      if (text.trim()) this.heard = { text: text.trim(), cmd: null, at: Date.now() };
      if (narratorBusy()) continue; // lo que oiga mientras habla la app se descarta
      for (const c of fresh) {
        const last = this.lastCmdAt[c] ?? 0;
        if (Date.now() - last < 1200) continue;
        this.lastCmdAt[c] = Date.now();
        this.heard = { text: text.trim(), cmd: c, at: Date.now() };
        this.onCommand(c);
      }
    }
  }

  private async startMeter() {
    if (this.stream || !navigator.mediaDevices?.getUserMedia) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!this.wanted) return this.stopMeter();
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      const ac: AudioContext = new AC();
      const src = ac.createMediaStreamSource(this.stream);
      const an = ac.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        this.level = this.level * 0.6 + Math.min(1, rms * 4) * 0.4;
        this.raf = requestAnimationFrame(loop);
      };
      loop();
      (this.stream as any)._ac = ac;
    } catch {
      this.stream = null;
    }
  }

  private stopMeter() {
    cancelAnimationFrame(this.raf);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      try {
        (this.stream as any)._ac?.close();
      } catch {}
    }
    this.stream = null;
    this.level = 0;
  }
}

export const voice = new Recognizer();
