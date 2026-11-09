// Estado global de la app: preferencias guardadas, navegación y sesión activa.

import type { Profile, Room } from './types';
import { CALLSIGNS, COLORS, callsignLabel } from './types';
import { GuestSession, HostSession, SoloSession, randomCode, type Session } from './net/session.svelte';
import { unlockAudio } from './audio/sfx';
import { unlockSpeech } from './audio/narrator';
import { keepAwake } from './device';
import { voice } from './voice/recognizer.svelte';

export interface Prefs {
  profile: Profile | null;
  seenGuide: boolean;
  voiceTested: boolean;
  seenTip: boolean;
  recording: boolean;
}

const PREFS_KEY = 'nerf.prefs';

function loadPrefs(): Prefs {
  const def: Prefs = { profile: null, seenGuide: false, voiceTested: false, seenTip: false, recording: false };
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return def;
  }
}

export type Screen = 'home' | 'guide' | 'profile' | 'join' | 'room' | 'voicetest';
type After = { kind: 'create' } | { kind: 'join'; code: string } | { kind: 'solo' } | { kind: 'back' } | null;

class App {
  prefs = $state<Prefs>(loadPrefs());
  screen = $state<Screen>('home');
  session = $state.raw<Session | null>(null);
  after: After = null;
  /** Tras la prueba de voz: qué hacer */
  voiceTestThen: (() => void) | null = null;
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
  unlock() {
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
    const s = new HostSession(saved?.code ?? randomCode(), this.prefs.profile, saved ?? undefined);
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
    this.startSession(new GuestSession(code, this.prefs.profile));
  }

  solo() {
    this.unlock();
    if (!this.prefs.profile) return this.needProfile({ kind: 'solo' });
    const me = this.prefs.profile;
    const color = COLORS.find((c) => c.id !== me.color)!.id;
    const callsign = CALLSIGNS.find((c) => c.id !== me.callsign)!.id;
    this.startSession(new SoloSession(me, { name: 'Bot', color, callsign }));
  }

  private startSession(s: HostSession | GuestSession) {
    this.session?.leave();
    this.session = s;
    s.start();
    this.screen = 'room';
    keepAwake(true);
  }

  profileDone(p: Profile) {
    this.prefs.profile = p;
    this.savePrefs();
    if (this.session) this.session.send({ t: 'profile', profile: p });
    const a = this.after;
    this.after = null;
    if (!a || a.kind === 'back') this.screen = this.session ? 'room' : 'home';
    else if (a.kind === 'create') this.create();
    else if (a.kind === 'join') this.join(a.code);
    else if (a.kind === 'solo') this.solo();
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
    this.unlock();
    // El micro se arranca dentro del toque (iOS lo exige)
    if (on) voice.start();
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
    return p ? callsignLabel(p.callsign) : '—';
  }
}

export const app = new App();
