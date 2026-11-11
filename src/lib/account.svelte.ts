// Cuenta personal, rivalidades y guerra diaria (habla con el servidor de /server).

import { isIOS, isStandalone } from './device';

const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '');
/** Hay servidor configurado (si no, la sección de rivales avisa de que aún no está activa) */
export const accountsEnabled = !!API;

const TOKEN_KEY = 'nerf.token';
const CODE_KEY = 'nerf.code';

export interface PublicUser {
  id: number;
  name: string;
  color: string;
  icon: string;
}
export interface WarView {
  id: number;
  day: string;
  status: 'live' | 'claimed' | 'done' | 'expired';
  starts: number | null;
  ends: number;
  hitter: number | null;
  victim: number | null;
  claimedBy: number | null;
  claimedAt: number | null;
  paid: boolean;
}
export interface RivalView {
  id: number;
  status: 'pending' | 'active';
  invitedByMe: boolean;
  rival: PublicUser;
  today: WarView | { status: 'scheduled' } | null;
  history: WarView[];
  kebabs: { iOwe: number; theyOwe: number; won: number; lost: number; draws: number };
}
export interface Me {
  user: PublicUser;
  rivals: RivalView[];
  pushDevices: number;
  now: number;
}

export type PushState = 'unsupported' | 'install' | 'denied' | 'off' | 'on' | 'working';

const pushSupported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function b64uToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
};

class Account {
  token = $state<string | null>(read(TOKEN_KEY));
  /** Código de acceso guardado en este móvil (para poder verlo y entrar en otro) */
  code = $state<string | null>(read(CODE_KEY));
  me = $state<Me | null>(null);
  error = $state<string | null>(null);
  busy = $state(false);
  push = $state<PushState>('off');
  /** Diferencia entre el reloj del servidor y el del móvil */
  private skew = 0;

  get loggedIn() {
    return !!this.token;
  }

  /** Hora del servidor estimada */
  now() {
    return Date.now() + this.skew;
  }

  /** ¿Hay alguna guerra en marcha ahora? (para avisar en el inicio) */
  get warLive(): RivalView | null {
    return this.me?.rivals.find((r) => r.today && (r.today.status === 'live' || r.today.status === 'claimed')) ?? null;
  }

  /** Invitaciones que me han hecho y aún no he contestado */
  get invites(): number {
    return this.me?.rivals.filter((r) => r.status === 'pending' && !r.invitedByMe).length ?? 0;
  }

  private async call<T = any>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
    if (!API) throw new Error('El servidor de rivales aún no está activo');
    let res: Response;
    try {
      res = await fetch(API + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error('Sin conexión con el servidor');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && this.token) this.forget();
    if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
    return data as T;
  }

  /** Ejecuta una acción mostrando el error si falla. Devuelve true si salió bien. */
  private async act(fn: () => Promise<unknown>): Promise<boolean> {
    this.busy = true;
    this.error = null;
    try {
      await fn();
      return true;
    } catch (e: any) {
      this.error = e?.message ?? String(e);
      return false;
    } finally {
      this.busy = false;
    }
  }

  private forget() {
    this.token = null;
    this.me = null;
    write(TOKEN_KEY, null);
  }

  private setSession(token: string, code?: string) {
    this.token = token;
    write(TOKEN_KEY, token);
    if (code) {
      this.code = code;
      write(CODE_KEY, code);
    }
  }

  async refresh() {
    if (!this.token || !API) return;
    try {
      const me = await this.call<Me>('/me');
      this.skew = me.now - Date.now();
      this.me = me;
      this.error = null;
    } catch (e: any) {
      if (this.token) this.error = e?.message ?? String(e);
    }
    await this.checkPush();
  }

  signup(name: string, color: string, icon: string) {
    return this.act(async () => {
      const r = await this.call<{ token: string; code: string }>('/auth/signup', { name, color, icon });
      this.setSession(r.token, r.code);
      await this.refresh();
    });
  }

  login(name: string, code: string) {
    return this.act(async () => {
      const r = await this.call<{ token: string }>('/auth/login', { name, code });
      this.setSession(r.token, code.toUpperCase().trim());
      await this.refresh();
    });
  }

  logout() {
    return this.act(async () => {
      const sub = await this.subscription();
      await this.call('/auth/logout', { endpoint: sub?.endpoint }).catch(() => {});
      await sub?.unsubscribe().catch(() => {});
      this.forget();
      this.push = 'off';
    });
  }

  deleteAccount() {
    return this.act(async () => {
      await this.call('/auth/delete', {});
      (await this.subscription())?.unsubscribe().catch(() => {});
      this.forget();
      this.code = null;
      write(CODE_KEY, null);
    });
  }

  updateLook(color: string, icon: string) {
    if (this.token) this.call('/auth/profile', { color, icon }).catch(() => {});
  }

  invite(name: string) {
    return this.act(async () => {
      await this.call('/rivals', { name });
      await this.refresh();
    });
  }

  rivalry(id: number, action: 'accept' | 'decline' | 'end' | 'paid') {
    return this.act(async () => {
      await this.call(`/rivals/${id}/${action}`, {});
      await this.refresh();
    });
  }

  /** who: 'me' = me ha dado (pago yo) · 'them' = le he dado (lo tiene que confirmar) */
  hit(warId: number, who: 'me' | 'them') {
    return this.act(async () => {
      await this.call(`/wars/${warId}/hit`, { who });
      await this.refresh();
    });
  }

  confirm(warId: number, ok: boolean) {
    return this.act(async () => {
      await this.call(`/wars/${warId}/confirm`, { ok });
      await this.refresh();
    });
  }

  // ───────────── notificaciones ─────────────

  private async subscription(): Promise<PushSubscription | null> {
    if (!pushSupported) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  }

  async checkPush() {
    if (!pushSupported) {
      // En iPhone solo hay notificaciones con la app añadida a la pantalla de inicio
      this.push = isIOS && !isStandalone ? 'install' : 'unsupported';
      return;
    }
    if (Notification.permission === 'denied') {
      this.push = 'denied';
      return;
    }
    const sub = await this.subscription();
    if (sub && Notification.permission === 'granted' && this.token) {
      // Que el servidor la tenga (por si cambió de cuenta o se borró)
      if (this.me && this.me.pushDevices === 0) this.call('/push/subscribe', sub.toJSON()).catch(() => {});
      this.push = 'on';
    } else this.push = 'off';
  }

  /** Activa las notificaciones. Llamar desde un toque. */
  enablePush() {
    return this.act(async () => {
      if (!pushSupported) throw new Error(isIOS ? 'Añade la app a la pantalla de inicio para recibir notificaciones' : 'Este navegador no admite notificaciones');
      this.push = 'working';
      try {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          this.push = perm === 'denied' ? 'denied' : 'off';
          throw new Error('Sin permiso para las notificaciones');
        }
        const reg = await navigator.serviceWorker.ready;
        const { key } = await this.call<{ key: string | null }>('/push/key');
        if (!key) throw new Error('El servidor aún no tiene las notificaciones configuradas');
        let sub = await reg.pushManager.getSubscription();
        // Si la suscripción es de otra clave (servidor nuevo), se rehace
        const same = sub?.options.applicationServerKey && new Uint8Array(sub.options.applicationServerKey).join() === b64uToBytes(key).join();
        if (sub && !same) {
          await sub.unsubscribe();
          sub = null;
        }
        sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) as BufferSource });
        await this.call('/push/subscribe', sub.toJSON());
        this.push = 'on';
        await this.refresh();
      } catch (e) {
        if (this.push === 'working') this.push = 'off';
        throw e;
      }
    });
  }

  testPush() {
    return this.act(async () => {
      const r = await this.call<{ sent: number }>('/push/test', {});
      if (!r.sent) throw new Error('No ha llegado a ningún móvil. Desactiva y vuelve a activar las notificaciones.');
    });
  }
}

export const account = new Account();

// Refrescar al volver a la app y cuando llega una notificación con la app abierta
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') account.refresh();
  });
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'push') account.refresh();
  });
}

/** Texto «quedan 3 h 12 min» */
export function timeLeft(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export const kebabs = (n: number) => (n === 1 ? 'un kebab' : `${n} kebabs`);
