// Estado global de la app: preferencias guardadas, navegación y sesión activa.

import type { Profile, Room } from './types';
import { COLORS } from './types';
import { ICONS } from './icons';
import { GuestSession, HostSession, LocalSession, SoloSession, randomCode, type Session } from './net/session.svelte';
import { unlockAudio } from './audio/sfx';
import { unlockSpeech } from './audio/narrator';
import { keepAwake } from './device';
import { voice } from './voice/recognizer.svelte';

export interface Prefs {
  profile: Profile | null;
  profile2: Profile | null; // segundo jugador en "un móvil para los dos"
  recordingMode: boolean; // modo grabación
  narratorVoice: string | null; // voz elegida para el narrador
  seenGuide: boolean;
  voiceTested: boolean;
  seenTip: boolean;
  recording: boolean;
}

const PREFS_KEY = 'nerf.prefs';

function loadPrefs(): Prefs {
  // Solo en desarrollo: ?demo salta la guía con un perfil de prueba (para capturas)
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
    return {
      profile: { name: 'Pablo', color: 'naranja', icon: 'rayo', aliases: [] },
      profile2: { name: 'Marta', color: 'azul', icon: 'calavera', aliases: [] },
      recordingMode: new URLSearchParams(location.search).has('rec'),
      narratorVoice: null,
      seenGuide: true,
      voiceTested: true,
      seenTip: true,
      recording: false,
    };
  }
  const def: Prefs = {
    profile: null,
    profile2: null,
    recordingMode: false,
    narratorVoice: null,
    seenGuide: false,
    voiceTested: false,
    seenTip: false,
    recording: false,
  };
  try {
    const p: Prefs = { ...def, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
    // Perfiles antiguos (con indicativo de lista): pedir nombre e icono de nuevo
    if (p.profile && (!p.profile.icon || !p.profile.name || !COLORS.some((c) => c.id === p.profile!.color))) {
      p.profile = null;
      p.voiceTested = false;
    }
    if (p.profile && !p.profile.aliases) p.profile.aliases = [];
    return p;
  } catch {
    return def;
  }
}

export type Screen = 'home' | 'guide' | 'profile' | 'join' | 'room' | 'voicetest' | 'history';
type After = { kind: 'create' } | { kind: 'join'; code: string } | { kind: 'solo' } | { kind: 'local' } | { kind: 'back' } | null;

class App {
  prefs = $state<Prefs>(loadPrefs());
  screen = $state<Screen>('home');
  session = $state.raw<Session | null>(null);
  after: After = null;
  /** Tras la prueba de voz: qué hacer */
  voiceTestThen: (() => void) | null = null;
  /** La pantalla de perfil está editando al segundo jugador (un móvil para los dos) */
  editingSecond = $state(false);
  toast = $state<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {}
  }

  showToast(msg: string, ms = 2500) {
    this.toast = msg;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toast = null), ms);
  }

  /** Copia plana del perfil (los proxies reactivos no se pueden clonar ni enviar) */
  profile(): Profile | null {
    return this.prefs.profile ? ($state.snapshot(this.prefs.profile) as Profile) : null;
  }

  get room(): Room | null {
    return this.session?.room ?? null;
  }

  get me() {
    const r = this.room;
    return r?.players.find((p) => p.id === this.session?.me) ?? null;
  }

  get opp() {
    const r = this.room;
    return r?.players.find((p) => p.id !== this.session?.me) ?? null;
  }

  /** Desbloquea audio y voz: llamar en un toque */
  private unlocked = false;
  unlock() {
    // Solo la primera vez: en iPhone, arrancar audio o voz sintética en el mismo
    // toque que el micro corta el reconocimiento de voz.
    if (this.unlocked) {
      unlockAudio(); // solo reanuda si estaba suspendido
      return;
    }
    this.unlocked = true;
    unlockAudio();
    unlockSpeech();
  }

  private needProfile(after: After) {
    this.after = after;
    this.screen = 'profile';
  }

  create() {
    this.unlock();
    if (!this.prefs.profile) return this.needProfile({ kind: 'create' });
    const saved = HostSession.savedRoom();
    const s = new HostSession(saved?.code ?? randomCode(), this.profile()!, saved ?? undefined);
    this.startSession(s);
  }

  /** Crea siempre una sala nueva (descarta la guardada) */
  createFresh() {
    try {
      localStorage.removeItem('nerf.hostRoom');
    } catch {}
    this.create();
  }

  join(code: string) {
    this.unlock();
    if (!this.prefs.profile) return this.needProfile({ kind: 'join', code });
    this.startSession(new GuestSession(code, this.profile()!));
  }

  solo() {
    this.unlock();
    if (!this.prefs.profile) return this.needProfile({ kind: 'solo' });
    const me = this.profile()!;
    const color = COLORS.find((c) => c.id !== me.color)!.id;
    const icon = ICONS.find((i) => i.id !== me.icon)!.id;
    const name = me.name.toLowerCase() === 'rival' ? 'Bot' : 'Rival';
    this.startSession(new SoloSession(me, { name, color, icon, aliases: [] }));
  }

  /** Un móvil para los dos: un único móvil hace de árbitro, sin conexión */
  local() {
    this.unlock();
    if (!this.prefs.profile) return this.needProfile({ kind: 'local' });
    if (!this.prefs.profile2) {
      this.editingSecond = true;
      return this.needProfile({ kind: 'local' });
    }
    const a = this.profile()!;
    const b = $state.snapshot(this.prefs.profile2) as Profile;
    if (b.color === a.color) b.color = COLORS.find((c) => c.id !== a.color)!.id;
    this.startSession(new LocalSession(a, b));
  }

  editProfile2() {
    this.editingSecond = true;
    this.after = { kind: 'back' };
    this.screen = 'profile';
  }

  private startSession(s: HostSession | GuestSession) {
    this.session?.leave();
    this.session = s;
    s.start();
    this.screen = 'room';
    keepAwake(true);
  }

  profileDone(p: Profile) {
    if (this.editingSecond) {
      this.editingSecond = false;
      this.prefs.profile2 = p;
      this.savePrefs();
      const s = this.session;
      if (s instanceof SoloSession) s.as('B', { t: 'profile', profile: $state.snapshot(p) as Profile });
    } else {
      this.prefs.profile = p;
      this.savePrefs();
      if (this.session) this.session.send({ t: 'profile', profile: this.profile()! });
    }
    const a = this.after;
    this.after = null;
    if (!a || a.kind === 'back') this.screen = this.session ? 'room' : 'home';
    else if (a.kind === 'create') this.create();
    else if (a.kind === 'join') this.join(a.code);
    else if (a.kind === 'solo') this.solo();
    else if (a.kind === 'local') this.local();
  }

  editProfile() {
    this.after = { kind: 'back' };
    this.screen = 'profile';
  }

  leave() {
    voice.stop();
    this.session?.leave();
    this.session = null;
    this.screen = 'home';
    keepAwake(false);
    history.replaceState(null, '', location.pathname);
  }

  /** Pulsar ¡Listo!: primera vez pasa por la prueba de voz */
  ready(on: boolean) {
    // El micro se arranca lo primero dentro del toque (Safari lo exige)
    if (on) voice.start();
    else this.unlock();
    if (on && !this.prefs.voiceTested) {
      this.voiceTestThen = () => this.session?.send({ t: 'ready', ready: true });
      this.screen = 'voicetest';
      return;
    }
    this.session?.send({ t: 'ready', ready: on });
  }

  voiceTestDone(_ok: boolean) {
    // Solo se muestra la primera vez (o si se pide desde el lobby)
    this.prefs.voiceTested = true;
    this.savePrefs();
    this.screen = this.session ? 'room' : 'home';
    const then = this.voiceTestThen;
    this.voiceTestThen = null;
    then?.();
  }

  label(pid: string | undefined | null) {
    const p = this.room?.players.find((x) => x.id === pid);
    return p ? p.name : '—';
  }
}

export const app = new App();
