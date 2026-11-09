// Reconocimiento de voz continuo (Web Speech API) con reinicio automático,
// filtro por nombre y bloqueo mientras habla el narrador.
//
// Importante: NO se abre el micrófono por otra vía (getUserMedia) a la vez,
// porque en iPhone y en muchos Android eso hace fallar al reconocedor con "not-allowed".

import { parseCommands, type Callsign, type Command } from './matcher';
import { narratorBusy } from '../audio/narrator';
import { isIOS, isStandalone } from '../device';

const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

export const speechSupported = !!SR;

/**
 * off: apagado · starting: arrancando · listening: escuchando
 * tap: hay que tocar para (re)activarlo · denied: permiso denegado de verdad
 * unavailable: el servicio de voz del sistema no está disponible · unsupported: navegador sin voz
 */
export type VoiceState = 'off' | 'starting' | 'listening' | 'tap' | 'denied' | 'unavailable' | 'unsupported';

export interface Heard {
  text: string;
  cmd: Command | null;
  at: number;
}

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
    if (!SR) {
      this.state = 'unsupported';
      return;
    }
    this.wanted = true;
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

  stop() {
    this.wanted = false;
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
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    this.consumed.clear();
    rec.onstart = () => {
      this.state = 'listening';
      this.everListened = true;
      this.notAllowedStreak = 0;
      this.errorMsg = null;
    };
    rec.onaudiostart = () => (this.target = 0.12);
    rec.onsoundstart = () => (this.target = 0.35);
    rec.onspeechstart = () => (this.target = 0.7);
    rec.onspeechend = () => (this.target = 0.1);
    rec.onresult = (e: any) => this.onResult(e);
    rec.onerror = (e: any) => this.onError(e?.error ?? 'desconocido');
    rec.onend = () => {
      if (this.rec === rec) this.rec = null;
      this.target = 0;
      if (!this.wanted) return;
      if (this.state === 'tap' || this.state === 'denied' || this.state === 'unavailable') return;
      // Reinicio automático (el modo continuo se corta solo tras silencios)
      const delay = Math.min(300 + this.failures * 600, 4000);
      this.restartTimer = setTimeout(() => {
        if (this.wanted && !this.rec) this.boot();
      }, delay);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch (err: any) {
      this.rec = null;
      // InvalidStateError = ya estaba arrancado; cualquier otra cosa: pedir toque
      if (err?.name !== 'InvalidStateError') {
        this.lastError = err?.name ?? 'start';
        this.state = 'tap';
      }
    }
  }

  private async onError(err: string) {
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
    if (err === 'language-not-supported') {
      this.state = 'unavailable';
      this.errorMsg = 'Tu móvil no tiene el reconocimiento de voz en español instalado.';
      return;
    }
    if (err === 'service-not-allowed') {
      this.state = 'unavailable';
      this.errorMsg =
        isIOS && isStandalone
          ? 'En iPhone la voz no funciona desde el icono de inicio. Abre la web en Safari.'
          : isIOS
            ? 'Activa el Dictado: Ajustes › General › Teclado › Activar Dictado (y que Siri esté permitido).'
            : 'El servicio de voz del sistema no está disponible. En Android revisa que la app de Google esté instalada y actualizada.';
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
    if (this.state !== 'listening') this.state = 'listening';
    this.failures = 0;
    this.target = 1;
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
      if (res.isFinal && !narratorBusy()) this.onFinal?.(res[0]?.transcript ?? '');
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
