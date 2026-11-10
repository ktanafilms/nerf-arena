// Mando con los botones de los cascos.
//
// Una web NO puede leer los botones de volumen (+/−): el sistema se los queda para el volumen.
// Lo que sí llega es el botón de reproducir/pausar de los cascos (y «siguiente»/«anterior»),
// a través de Media Session, mientras la página está reproduciendo audio. Por eso, al activarlo,
// suena en bucle un audio inaudible: así el móvil le manda a la app los toques de los cascos.
//
//   1 toque  (reproducir/pausar)  → tocado (o «mía» en Tiro al blanco)
//   2 toques (siguiente pista)    → estado: el narrador dice el marcador
//   3 toques (pista anterior)     → anular
// En muchos cascos Bluetooth, mantener pulsado + o − también manda «siguiente» / «anterior».

export type Press = 'single' | 'double' | 'triple';

const ACTIONS: [MediaSessionAction, Press][] = [
  ['play', 'single'],
  ['pause', 'single'],
  ['stop', 'single'],
  ['nexttrack', 'double'],
  ['seekforward', 'double'],
  ['previoustrack', 'triple'],
  ['seekbackward', 'triple'],
];

// Teclas multimedia (teclados y algunos cascos en Android/ordenador)
const KEYS: Record<string, Press> = {
  MediaPlayPause: 'single',
  MediaPlay: 'single',
  MediaPause: 'single',
  MediaTrackNext: 'double',
  MediaTrackPrevious: 'triple',
};

export const remoteSupported = typeof navigator !== 'undefined' && 'mediaSession' in navigator;

/** WAV de 2 s casi en silencio (un silencio perfecto hace que algunos móviles lo ignoren) */
function quietWav(): string {
  const rate = 8000;
  const n = rate * 2;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, i % 2 ? 1 : -1, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

class Remote {
  /** Activado por el usuario (se guarda en las preferencias) */
  on = $state(false);
  /** El audio de enganche está sonando */
  armed = $state(false);
  /** Último botón recibido (para la prueba) */
  last = $state<{ press: Press; at: number } | null>(null);
  onPress: (p: Press) => void = () => {};

  private audio: HTMLAudioElement | null = null;
  private lastAt = 0;
  private lastPress: Press | null = null;
  private bound = false;

  private handle(p: Press) {
    const now = Date.now();
    // Algunos móviles mandan dos avisos por el mismo toque (p. ej. pausa + reproducir)
    if (p === this.lastPress && now - this.lastAt < 450) return;
    this.lastAt = now;
    this.lastPress = p;
    this.last = { press: p, at: now };
    this.keepPlaying();
    this.onPress(p);
  }

  /** Tras un toque, el sistema puede haber pausado el audio: volver a reproducir */
  private keepPlaying() {
    if (!this.on || !this.audio) return;
    try {
      navigator.mediaSession.playbackState = 'playing';
    } catch {}
    if (this.audio.paused) this.audio.play().catch(() => {});
  }

  private bind() {
    if (this.bound || !remoteSupported) return;
    this.bound = true;
    for (const [action, press] of ACTIONS) {
      try {
        navigator.mediaSession.setActionHandler(action, () => this.handle(press));
      } catch {
        /* acción no soportada en este navegador */
      }
    }
    document.addEventListener('keydown', (e) => {
      const p = KEYS[e.key];
      if (p && this.on) {
        e.preventDefault();
        this.handle(p);
      }
    });
  }

  /** Activar. Llamar SIEMPRE desde un toque (el audio solo arranca así). */
  async start() {
    if (!remoteSupported) return;
    this.on = true;
    this.bind();
    if (!this.audio) {
      const a = new Audio(quietWav());
      a.loop = true;
      a.preload = 'auto';
      a.setAttribute('playsinline', '');
      a.addEventListener('pause', () => {
        if (this.on) setTimeout(() => this.keepPlaying(), 300);
        this.armed = false;
      });
      a.addEventListener('playing', () => (this.armed = true));
      this.audio = a;
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Nerf Arena', artist: 'Árbitro en marcha' });
      navigator.mediaSession.playbackState = 'playing';
    } catch {}
    try {
      await this.audio.play();
    } catch {
      this.armed = false;
    }
  }

  /** Reengancha si estaba activado y se paró (llamar en un toque) */
  resumeIfWanted() {
    if (this.on && !this.armed) this.start();
  }

  stop() {
    this.on = false;
    this.armed = false;
    this.audio?.pause();
    try {
      navigator.mediaSession.playbackState = 'none';
      navigator.mediaSession.metadata = null;
    } catch {}
  }
}

export const remote = new Remote();

if (typeof document !== 'undefined') {
  // Cualquier toque en la pantalla reengancha el mando si el sistema lo soltó
  document.addEventListener('pointerdown', () => remote.resumeIfWanted(), true);
}

export const PRESS_TEXT: Record<Press, string> = { single: '1 toque', double: '2 toques', triple: '3 toques' };
