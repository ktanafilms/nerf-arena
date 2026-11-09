// Reconocimiento de voz continuo con dos motores:
//  · 'web'  → el del navegador (Web Speech API: Siri en iPhone, Google en Android)
//  · 'vosk' → motor propio dentro de la app (sin Siri ni internet; modelo de 40 MB)
// Si el del navegador no está disponible, se pasa al propio automáticamente.
// Filtra por nombre y descarta lo que oye mientras habla el narrador.
//
// Importante: NO se abre el micrófono por otra vía (getUserMedia) a la vez,
// porque en iPhone y en muchos Android eso hace fallar al reconocedor con "not-allowed".

import { parseCommands, type Callsign, type Command } from './matcher';
import { narratorBusy } from '../audio/narrator';
import { isIOS, isStandalone } from '../device';
import { VoskEngine, voskModelStored } from './vosk-engine';

const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

const voskSupported =
  typeof window !== 'undefined' && typeof WebAssembly === 'object' && !!navigator.mediaDevices?.getUserMedia;

export const speechSupported = !!SR || voskSupported;

export type Engine = 'web' | 'vosk';
function initialEngine(): Engine {
  try {
    const e = localStorage.getItem('nerf.voiceEngine');
    if (e === 'vosk' && voskSupported) return 'vosk';
    if (e === 'web' && SR) return 'web';
  } catch {}
  return SR ? 'web' : 'vosk';
}

/**
 * off: apagado · starting: arrancando · listening: escuchando
 * tap: hay que tocar para (re)activarlo · denied: permiso denegado de verdad
 * unavailable: el servicio de voz del sistema no está disponible · unsupported: navegador sin voz
 */
export type VoiceState = 'off' | 'loading' | 'starting' | 'listening' | 'tap' | 'denied' | 'unavailable' | 'unsupported';

export interface Heard {
  text: string;
  cmd: Command | null;
  at: number;
}

// Variantes de español: si iOS rechaza una, al reintentar se prueba la siguiente
const LANGS = ['es-ES', 'es-MX', 'es-US', 'es', ''];
let langIdx = (() => {
  try {
    const saved = localStorage.getItem('nerf.voiceLang');
    const i = saved === null ? 0 : LANGS.indexOf(saved);
    return i >= 0 ? i : 0;
  } catch {
    return 0;
  }
})();

async function micPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    const st = await (navigator as any).permissions?.query({ name: 'microphone' });
    return st?.state ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

class Recognizer {
  state = $state<VoiceState>(speechSupported ? 'off' : 'unsupported');
  errorMsg = $state<string | null>(null);
  lastError = $state<string | null>(null); // código técnico, para diagnóstico
  level = $state(0); // 0..1 actividad de voz (estimada por los eventos del reconocedor)
  heard = $state<Heard | null>(null);
  engine = $state<Engine>(initialEngine());
  progress = $state(0); // descarga del modelo propio (0..1)
  private vosk: VoskEngine | null = null;
  private utt = 100000; // índice de frase para el motor propio
  /** Registro de eventos (diagnóstico en la prueba de voz) */
  log = $state<string[]>([]);
  private t0 = Date.now();
  private note(ev: string) {
    const t = ((Date.now() - this.t0) / 1000).toFixed(1);
    this.log = [...this.log.slice(-11), `${t}s ${ev}`];
  }

  private rec: any = null;
  private wanted = false;
  private everListened = false;
  private consumed = new Map<number, number>();
  private lastCmdAt: Partial<Record<Command, number>> = {};
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private notAllowedStreak = 0;
  private decay: ReturnType<typeof setInterval> | null = null;
  private target = 0;

  callsign: Callsign = [];
  others: Callsign[] = [];
  /** Recibe cada transcripción final (para la calibración) */
  onFinal: ((text: string) => void) | null = null;
  allowed: Command[] = [];
  onCommand: (c: Command) => void = () => {};

  /** Llamar SIEMPRE desde un toque del usuario (iOS lo exige). */
  start() {
    this.note(`start() ← toque [${this.engine === 'web' ? 'navegador' : 'propio'}]`);
    if (!speechSupported) {
      this.state = 'unsupported';
      return;
    }
    this.wanted = true;
    if (this.engine === 'vosk') return this.startVosk();
    this.notAllowedStreak = 0;
    this.failures = 0;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.rec) {
      // ya está en marcha: si estaba atascado, reiniciar
      if (this.state === 'listening' || this.state === 'starting') return;
      try {
        this.rec.abort();
      } catch {}
      this.rec = null;
    }
    this.state = 'starting';
    this.errorMsg = null;
    this.boot();
    this.startDecay();
  }

  /** Reactiva solo si la partida lo necesita (lo llama el toque global). */
  resumeIfWanted() {
    if (this.wanted) this.start();
  }

  /** Cambiar de motor (lo guarda para la próxima vez). Llamar desde un toque. */
  useEngine(e: Engine) {
    const was = this.wanted;
    this.stop();
    this.engine = e;
    try {
      localStorage.setItem('nerf.voiceEngine', e);
    } catch {}
    this.note(`motor: ${e === 'web' ? 'navegador' : 'propio'}`);
    if (was || e === 'vosk') this.start();
  }

  private startVosk() {
    if (this.vosk?.active && (this.state === 'listening' || this.state === 'loading' || this.state === 'starting')) return;
    this.vosk?.stop();
    this.state = voskModelStored() ? 'starting' : 'loading';
    this.errorMsg = null;
    this.progress = 0;
    this.startDecay();
    const eng = new VoskEngine({
      onPartial: (t) => this.handleText(t, false, this.utt),
      onFinal: (t) => {
        this.note(`oído: «${t.slice(0, 30)}»`);
        this.handleText(t, true, this.utt);
        this.utt++;
      },
      onLevel: (v) => {
        this.target = v;
      },
      onProgress: (f) => {
        this.progress = f;
      },
      onReady: () => {
        this.state = 'listening';
        this.everListened = true;
        this.note('escuchando (motor propio)');
      },
    });
    this.vosk = eng;
    eng.start().catch((err: any) => {
      if (this.vosk !== eng) return;
      const name = err?.name ?? '';
      this.lastError = name || String(err?.message ?? err);
      this.note(`error: ${this.lastError}`);
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.state = 'denied';
        this.errorMsg = isIOS
          ? 'Safari tiene el micrófono bloqueado para esta web. Toca «aA» en la barra de direcciones › Ajustes del sitio web › Micrófono › Permitir.'
          : 'El navegador tiene el micrófono bloqueado para esta web. Revisa los permisos del sitio.';
      } else if (name === 'NotReadableError' || name === 'AbortError') {
        this.state = 'tap';
        this.errorMsg = 'Otra app está usando el micrófono. Ciérrala y toca para reintentar.';
      } else {
        this.state = 'unavailable';
        this.errorMsg = `No se pudo cargar el reconocedor propio: ${err?.message ?? err}. Comprueba la conexión y reintenta.`;
      }
    });
  }

  stop() {
    this.wanted = false;
    this.vosk?.stop();
    this.vosk = null;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    try {
      this.rec?.abort();
    } catch {}
    this.rec = null;
    this.stopDecay();
    if (this.state !== 'unsupported') this.state = 'off';
  }

  private boot() {
    let rec: any;
    try {
      rec = new SR();
    } catch {
      this.state = 'unavailable';
      this.errorMsg = 'No se pudo iniciar el reconocimiento de voz en este navegador.';
      return;
    }
    rec.lang = LANGS[langIdx];
    this.note(`idioma: ${LANGS[langIdx] || 'por defecto'}`);
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    this.consumed.clear();
    rec.onstart = () => {
      this.note('escuchando');
      try {
        localStorage.setItem('nerf.voiceLang', LANGS[langIdx]);
      } catch {}
      this.state = 'listening';
      this.everListened = true;
      this.notAllowedStreak = 0;
      this.errorMsg = null;
    };
    rec.onaudiostart = () => {
      this.note('audio abierto');
      this.target = 0.12;
    };
    rec.onsoundstart = () => (this.target = 0.35);
    rec.onspeechstart = () => {
      this.note('voz detectada');
      this.target = 0.7;
    };
    rec.onspeechend = () => (this.target = 0.1);
    rec.onresult = (e: any) => this.onResult(e);
    rec.onerror = (e: any) => this.onError(e?.error ?? 'desconocido');
    rec.onend = () => {
      this.note('fin');
      if (this.rec === rec) this.rec = null;
      this.target = 0;
      if (!this.wanted) return;
      if (this.state === 'tap' || this.state === 'denied' || this.state === 'unavailable') return;
      // Reinicio automático (el modo continuo se corta solo tras silencios)
      const delay = Math.min(300 + this.failures * 600, 4000);
      this.restartTimer = setTimeout(() => {
        if (this.wanted && !this.rec) {
          this.note('reinicio automático');
          this.boot();
        }
      }, delay);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch (err: any) {
      this.note(`start falló: ${err?.name ?? err}`);
      this.rec = null;
      // InvalidStateError = ya estaba arrancado; cualquier otra cosa: pedir toque
      if (err?.name !== 'InvalidStateError') {
        this.lastError = err?.name ?? 'start';
        this.state = 'tap';
      }
    }
  }

  private async onError(err: string) {
    this.note(`error: ${err}`);
    this.lastError = err;
    if (err === 'no-speech' || err === 'aborted') return; // normal: se reinicia solo
    if (err === 'network') {
      this.failures++;
      this.errorMsg = 'El reconocimiento de voz necesita conexión a internet.';
      return;
    }
    if (err === 'audio-capture') {
      this.failures++;
      this.errorMsg = 'Otra app está usando el micrófono (¿grabación de pantalla con micro, llamada…?).';
      return;
    }
    if (err === 'service-not-allowed' || err === 'language-not-supported') {
      if (voskSupported) {
        // El sistema no deja usar su voz: pasamos al reconocedor propio de la app
        this.engine = 'vosk';
        try {
          localStorage.setItem('nerf.voiceEngine', 'vosk');
        } catch {}
        this.state = 'tap';
        this.errorMsg = voskModelStored()
          ? 'Usaremos el reconocedor propio de la app. Toca para activar el micro.'
          : 'Tu móvil no deja usar su reconocimiento de voz. Usaremos el reconocedor propio de la app (descarga única de 40 MB, mejor con wifi). Toca para activarlo.';
        this.note('→ cambio a motor propio');
        return;
      }
      if (!this.everListened) langIdx = (langIdx + 1) % LANGS.length;
      this.state = 'unavailable';
      this.errorMsg = isIOS && isStandalone
        ? 'En iPhone la voz no funciona desde el icono de inicio. Abre la web en Safari.'
        : 'El servicio de voz del sistema no está disponible.';
      return;
    }
    if (err === 'not-allowed') {
      this.notAllowedStreak++;
      const perm = await micPermission();
      if (perm === 'denied') {
        this.state = 'denied';
        this.errorMsg = isIOS
          ? 'Safari tiene el micrófono bloqueado para esta web. Toca «aA» en la barra de direcciones › Ajustes del sitio web › Micrófono › Permitir.'
          : 'Chrome tiene el micrófono bloqueado para esta web. Toca el candado de la barra de direcciones › Permisos › Micrófono › Permitir.';
      } else {
        // Casi siempre: se intentó arrancar sin un toque (reinicio automático en iPhone)
        this.state = 'tap';
        this.errorMsg = this.everListened ? 'El micro se ha pausado. Toca para reactivarlo.' : 'Toca para activar el micro.';
      }
    }
  }

  private onResult(e: any) {
    const last = e.results[e.results.length - 1];
    if (last?.isFinal) this.note(`oído: «${(last[0]?.transcript ?? '').trim().slice(0, 30)}»`);
    this.failures = 0;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const alts: string[] = [];
      for (let a = 0; a < res.length; a++) alts.push(res[a].transcript);
      this.handleText(res[0]?.transcript ?? '', res.isFinal, i, alts);
    }
  }

  /** Procesa una transcripción (parcial o final) de cualquiera de los dos motores. */
  private handleText(raw: string, isFinal: boolean, idx: number, alts: string[] = []) {
    if (this.state !== 'listening') this.state = 'listening';
    this.target = Math.max(this.target, 0.8);
    let text = raw;
    let cmds = parseCommands(text, this.callsign, this.allowed, this.others);
    if (isFinal && cmds.length === 0) {
      for (const alt of alts.slice(1)) {
        const c = parseCommands(alt, this.callsign, this.allowed, this.others);
        if (c.length) {
          cmds = c;
          text = alt;
          break;
        }
      }
    }
    const already = this.consumed.get(idx) ?? 0;
    const fresh = cmds.slice(already);
    this.consumed.set(idx, Math.max(already, cmds.length));
    if (this.consumed.size > 200) this.consumed.clear();
    if (text.trim()) this.heard = { text: text.trim(), cmd: null, at: Date.now() };
    if (isFinal && !narratorBusy()) this.onFinal?.(raw);
    if (narratorBusy()) return; // lo que oiga mientras habla la app se descarta
    for (const c of fresh) {
      const last = this.lastCmdAt[c] ?? 0;
      if (Date.now() - last < 1200) continue;
      this.lastCmdAt[c] = Date.now();
      this.heard = { text: text.trim(), cmd: c, at: Date.now() };
      this.onCommand(c);
    }
  }

  // Medidor visual sin abrir el micro: sigue la actividad que informa el reconocedor
  private startDecay() {
    if (this.decay) return;
    this.decay = setInterval(() => {
      const jitter = this.target > 0.3 ? Math.random() * 0.25 : 0;
      this.level = this.level * 0.7 + (this.target + jitter) * 0.3;
      if (this.target > 0.4) this.target *= 0.9;
    }, 60);
  }

  private stopDecay() {
    if (this.decay) clearInterval(this.decay);
    this.decay = null;
    this.level = 0;
  }
}

export const voice = new Recognizer();

// En iPhone el reconocedor puede pararse (p. ej. tras hablar el narrador) y Safari
// solo deja reactivarlo con un toque: cualquier toque en la pantalla lo reactiva.
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    () => {
      if (voice.state === 'tap' || voice.state === 'off') voice.resumeIfWanted();
    },
    true,
  );
}

/** Texto de diagnóstico para mostrar en la prueba de voz. */
export function voiceDiagnostics(): string {
  const ua = navigator.userAgent;
  const browser = /CriOS/.test(ua)
    ? 'Chrome iOS'
    : /FxiOS/.test(ua)
      ? 'Firefox iOS'
      : isIOS
        ? 'Safari iOS'
        : /SamsungBrowser/.test(ua)
          ? 'Samsung Internet'
          : /Chrome/.test(ua)
            ? 'Chrome'
            : /Firefox/.test(ua)
              ? 'Firefox'
              : 'otro';
  return [
    browser,
    isStandalone ? 'app instalada' : 'navegador',
    speechSupported ? 'voz: sí' : 'voz: no',
    `estado: ${voice.state}`,
    voice.lastError ? `error: ${voice.lastError}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
