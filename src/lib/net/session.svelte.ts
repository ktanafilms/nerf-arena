// Sesiones de juego: host (autoritativo), invitado, prueba con rival simulado y "un móvil para los dos".
//
// Conexión entre móviles con DOS rutas a la vez:
//  · directa (WebRTC con PeerJS): la más rápida, pero algunas redes la bloquean
//  · respaldo por servidor de mensajería público (MQTT sobre WebSocket): funciona con
//    cualquier wifi, datos móviles o punto de acceso con internet
// El invitado usa la directa si está abierta y, si no, el respaldo. El host contesta por las dos.
// Para no saturar el respaldo, la partida se envía sin el historial y solo con los eventos nuevos.

import Peer, { type DataConnection } from 'peerjs';
import type { GEvent, Intent, Profile, Room } from '../types';
import { applyIntent, createRoom, ensureUndo, joinGuest, setConnected, tick } from '../engine/room';
import { Mqtt } from './mqtt';

const PREFIX = 'nerfarena-v1-';
const TOPIC = (code: string) => `nerfarena/v2/${code}`;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const HOST_SAVE = 'nerf.hostRoom';
const HEARTBEAT_MS = 1000;
const TIMEOUT_MS = 5000;
const RELAY_FRESH_MS = 8000;
// Solo en desarrollo: ?nodirect desactiva la ruta directa para probar el respaldo
const NO_DIRECT = import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('nodirect');

export type NetStatus = 'connecting' | 'online' | 'reconnecting' | 'error';
export type Route = 'direct' | 'relay' | 'none';

/** Qué tiene ya el invitado: último evento recibido de la partida `key` (= startAt) */
interface Have {
  key: number;
  id: number;
}
type GuestMsg =
  | { k: 'hello'; profile: Profile; clientId: string; have?: Have }
  | { k: 'intent'; intent: Intent; have?: Have }
  | { k: 'ping'; t0: number; have?: Have };
type HostMsg =
  | { k: 'room'; room: Room; evs: GEvent[] | null; full: boolean }
  | { k: 'pong'; t0: number; th: number }
  | { k: 'full' };

export function randomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

function clientId(): string {
  try {
    let id = localStorage.getItem('nerf.clientId');
    if (!id) {
      id = Math.random().toString(36).slice(2);
      localStorage.setItem('nerf.clientId', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export interface NetDiag {
  direct: string; // estado de la ruta directa
  relay: string; // estado del respaldo
  rtt: number | null;
}

export abstract class Session {
  room = $state.raw<Room | null>(null);
  status = $state<NetStatus>('connecting');
  error = $state<string | null>(null);
  route = $state<Route>('none');
  diag = $state<NetDiag>({ direct: '…', relay: '…', rtt: null });
  abstract readonly me: string;
  abstract readonly kind: 'host' | 'guest' | 'solo' | 'local';
  /** Reloj del host (ms epoch) visto desde este dispositivo. */
  abstract now(): number;
  abstract send(intent: Intent): void;
  abstract leave(): void;
}

/** Copia de la sala sin el historial de eventos (lo nuevo va aparte) */
function stripEvents(r: Room): Room {
  if (!r.game) return r;
  return { ...r, game: { ...r.game, events: [] } };
}

// ───────────────────────────── HOST ─────────────────────────────

export class HostSession extends Session {
  readonly me = 'A';
  readonly kind: 'host' | 'solo' | 'local' = 'host';
  protected r: Room;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private relay: Mqtt | null = null;
  private guestClient: string | null = null;
  private lastGuestSeen = 0;
  private lastRelaySeen = 0;
  private guestHave: Have = { key: 0, id: 0 };
  private timer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(code: string, profile: Profile, restored?: Room) {
    super();
    this.r = restored ?? createRoom(code, profile);
    if (restored) {
      const host = this.r.players.find((p) => p.id === 'A')!;
      Object.assign(host, profile, { connected: true });
      if (this.r.game) ensureUndo(this.r.game);
    }
    this.publish();
    this.timer = setInterval(() => this.loop(), 100);
  }

  now() {
    return Date.now();
  }

  start() {
    if (!NO_DIRECT) this.openPeer(0);
    this.openRelay();
  }

  // ── ruta directa ──
  private openPeer(attempt: number) {
    if (this.closed) return;
    this.status = this.status === 'online' ? 'online' : attempt ? 'reconnecting' : 'connecting';
    this.diag = { ...this.diag, direct: 'conectando' };
    const peer = new Peer(PREFIX + this.r.code, { debug: 0 });
    this.peer = peer;
    peer.on('open', () => {
      this.status = 'online';
      this.error = null;
      this.diag = { ...this.diag, direct: 'esperando' };
    });
    peer.on('connection', (c) => this.onConnection(c));
    peer.on('disconnected', () => {
      if (this.closed) return;
      this.diag = { ...this.diag, direct: 'reconectando' };
      setTimeout(() => !this.closed && !peer.destroyed && peer.reconnect(), 1500);
    });
    peer.on('error', (err: any) => {
      if (this.closed) return;
      if (err?.type === 'unavailable-id') {
        // El emparejador aún recuerda la sesión anterior (recarga rápida): reintentar
        peer.destroy();
        if (attempt < 12) setTimeout(() => this.openPeer(attempt + 1), 2500);
        else this.diag = { ...this.diag, direct: 'no disponible' };
      } else if (err?.type === 'network' || err?.type === 'server-error' || err?.type === 'socket-error') {
        this.diag = { ...this.diag, direct: 'sin emparejador' };
        peer.destroy();
        setTimeout(() => this.openPeer(attempt + 1), 4000);
      } else if (err?.type === 'browser-incompatible') {
        this.diag = { ...this.diag, direct: 'no compatible' };
      }
    });
  }

  private onConnection(c: DataConnection) {
    c.on('data', (raw) => {
      const msg = raw as GuestMsg;
      if (msg.k === 'hello') {
        if (!this.acceptHello(msg)) {
          c.send({ k: 'full' } satisfies HostMsg);
          setTimeout(() => c.close(), 500);
          return;
        }
        if (this.conn && this.conn !== c) this.conn.close();
        this.conn = c;
        this.diag = { ...this.diag, direct: 'conectada' };
        this.commit(true);
        return;
      }
      if (c !== this.conn) return;
      this.onGuestMsg(msg, (m) => c.send(m));
    });
    c.on('close', () => {
      if (c === this.conn) {
        this.conn = null;
        this.diag = { ...this.diag, direct: 'cerrada' };
      }
    });
  }

  // ── ruta de respaldo ──
  private openRelay() {
    const base = TOPIC(this.r.code);
    const relay = new Mqtt(`nerf-h-${this.r.code}-${Math.random().toString(36).slice(2, 8)}`, {
      onState: (st) => {
        this.diag = { ...this.diag, relay: st === 'online' ? 'lista' : st === 'connecting' ? 'conectando' : 'caída' };
        if (st === 'online') {
          this.status = 'online';
          this.commit(true);
        }
      },
      onMessage: (_t, payload) => {
        let env: { c: string; m: GuestMsg };
        try {
          env = JSON.parse(payload);
        } catch {
          return;
        }
        const msg = env.m;
        if (msg.k === 'hello') {
          if (!this.acceptHello(msg)) {
            relay.publish(`${base}/g`, JSON.stringify({ c: env.c, m: { k: 'full' } }));
            return;
          }
          this.lastRelaySeen = Date.now();
          this.commit(true);
          return;
        }
        if (env.c !== this.guestClient) return;
        this.lastRelaySeen = Date.now();
        this.diag = { ...this.diag, relay: 'en uso' };
        this.onGuestMsg(msg, (m) => relay.publish(`${base}/g`, JSON.stringify({ c: this.guestClient, m })));
      },
    });
    relay.subscribe(`${base}/h`);
    relay.connect();
    this.relay = relay;
  }

  /** Acepta (o rechaza si la sala ya tiene otro invitado) un saludo por cualquier ruta */
  private acceptHello(msg: Extract<GuestMsg, { k: 'hello' }>): boolean {
    const guest = this.r.players.find((p) => p.id === 'B');
    if (guest && guest.connected && this.guestClient && this.guestClient !== msg.clientId) return false;
    this.guestClient = msg.clientId;
    this.lastGuestSeen = Date.now();
    this.guestHave = msg.have ?? { key: 0, id: 0 };
    const now = Date.now();
    if (guest) setConnected(this.r, 'B', true, now);
    else joinGuest(this.r, msg.profile);
    return true;
  }

  private onGuestMsg(msg: GuestMsg, reply: (m: HostMsg) => void) {
    this.lastGuestSeen = Date.now();
    if ('have' in msg && msg.have) this.guestHave = msg.have;
    const guest = this.r.players.find((p) => p.id === 'B');
    if (guest && !guest.connected && setConnected(this.r, 'B', true, Date.now())) this.commit();
    if (msg.k === 'ping') reply({ k: 'pong', t0: msg.t0, th: Date.now() });
    else if (msg.k === 'intent') {
      if (applyIntent(this.r, 'B', msg.intent, Date.now())) this.commit();
    }
  }

  private guestLost() {
    if (setConnected(this.r, 'B', false, Date.now())) this.commit();
  }

  protected loop() {
    const now = Date.now();
    const guest = this.r.players.find((p) => p.id === 'B');
    if (this.kind === 'host' && guest?.connected && now - this.lastGuestSeen > TIMEOUT_MS) this.guestLost();
    if (tick(this.r, now)) this.commit();
    if (this.kind === 'host') {
      const direct = !!this.conn?.open;
      const relay = now - this.lastRelaySeen < RELAY_FRESH_MS;
      const route: Route = direct ? 'direct' : relay ? 'relay' : 'none';
      if (route !== this.route) this.route = route;
    }
  }

  send(intent: Intent) {
    if (applyIntent(this.r, this.me, intent, Date.now())) this.commit();
  }

  /** Mensaje de sala para el invitado: sin historial + eventos que le faltan */
  private roomMsg(forceFull: boolean): HostMsg {
    const g = this.r.game;
    if (!g) return { k: 'room', room: this.r, evs: null, full: true };
    const have = this.guestHave.key === g.startAt ? this.guestHave.id : 0;
    const evs = forceFull || !have ? g.events : g.events.filter((e) => e.id > have);
    return { k: 'room', room: stripEvents(this.r), evs, full: forceFull || !have };
  }

  protected commit(forceFull = false) {
    this.r.rev++;
    this.publish();
    if (this.kind === 'host') {
      const msg = this.roomMsg(forceFull);
      if (this.conn?.open) this.conn.send(msg);
      const relayUseful = !this.conn?.open || Date.now() - this.lastRelaySeen < RELAY_FRESH_MS || forceFull;
      if (this.relay?.online && relayUseful)
        this.relay.publish(`${TOPIC(this.r.code)}/g`, JSON.stringify({ c: this.guestClient, m: msg }));
    }
    this.save();
  }

  protected publish() {
    this.room = structuredClone(this.r);
  }

  protected save() {
    if (this.kind !== 'host') return;
    try {
      localStorage.setItem(HOST_SAVE, JSON.stringify({ room: this.r, savedAt: Date.now() }));
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  }

  leave() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.conn?.close();
    this.peer?.destroy();
    this.relay?.close();
    if (this.kind === 'host') {
      try {
        localStorage.removeItem(HOST_SAVE);
      } catch {}
    }
  }

  static savedRoom(): Room | null {
    try {
      const raw = localStorage.getItem(HOST_SAVE);
      if (!raw) return null;
      const { room, savedAt } = JSON.parse(raw);
      if (Date.now() - savedAt > 3 * 3600_000) return null;
      return room as Room;
    } catch {
      return null;
    }
  }
}

// ───────────────────────────── INVITADO ─────────────────────────────

export class GuestSession extends Session {
  readonly me = 'B';
  readonly kind = 'guest' as const;
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private relay: Mqtt | null = null;
  private offset = 0;
  private bestRtt = Infinity;
  private samples: { rtt: number; off: number }[] = [];
  private lastHostSeen = 0;
  private hb: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private connecting = false;
  private queue: Intent[] = [];
  private startedAt = Date.now();
  private events: GEvent[] = [];
  private eventsKey = 0;
  private lastRev = -1;
  private readonly cid = clientId();

  constructor(
    readonly code: string,
    private profile: Profile,
  ) {
    super();
  }

  now() {
    return Date.now() + this.offset;
  }

  start() {
    this.status = 'connecting';
    if (!NO_DIRECT) this.openPeer();
    this.openRelay();
    this.hb = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  private have(): Have {
    return { key: this.eventsKey, id: this.events.length ? this.events[this.events.length - 1].id : 0 };
  }

  // ── ruta directa ──
  private openPeer() {
    const peer = new Peer({ debug: 0 });
    this.peer = peer;
    this.diag = { ...this.diag, direct: 'conectando' };
    peer.on('open', () => this.connect());
    peer.on('disconnected', () => {
      if (!this.closed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
    });
    peer.on('error', (err: any) => {
      if (this.closed) return;
      this.connecting = false;
      if (err?.type === 'peer-unavailable') {
        this.diag = { ...this.diag, direct: 'sala no encontrada' };
        setTimeout(() => this.connect(), 3000);
      } else if (err?.type === 'browser-incompatible') {
        this.diag = { ...this.diag, direct: 'no compatible' };
      } else {
        this.diag = { ...this.diag, direct: 'sin emparejador' };
      }
    });
  }

  private onVisible = () => {
    if (document.visibilityState === 'visible' && !this.conn?.open) this.connect();
  };

  private connect() {
    if (this.closed || this.connecting || !this.peer || this.peer.destroyed) return;
    if (this.peer.disconnected) {
      this.peer.reconnect();
      return;
    }
    this.connecting = true;
    const c = this.peer.connect(PREFIX + this.code, { reliable: true });
    const giveUp = setTimeout(() => {
      if (!c.open) {
        this.connecting = false;
        this.diag = { ...this.diag, direct: 'bloqueada por la red' };
        c.close();
      }
    }, 8000);
    c.on('open', () => {
      clearTimeout(giveUp);
      this.connecting = false;
      this.conn = c;
      this.diag = { ...this.diag, direct: 'conectada' };
      c.send({ k: 'hello', profile: this.profile, clientId: this.cid, have: this.have() } satisfies GuestMsg);
      this.ping();
      this.flushQueue();
    });
    c.on('data', (raw) => this.onHostMsg(raw as HostMsg, 'direct'));
    c.on('close', () => {
      if (c === this.conn) {
        this.conn = null;
        this.diag = { ...this.diag, direct: 'cerrada' };
      }
    });
  }

  // ── ruta de respaldo ──
  private openRelay() {
    const base = TOPIC(this.code);
    const relay = new Mqtt(`nerf-g-${this.code}-${this.cid.slice(0, 6)}-${Math.random().toString(36).slice(2, 6)}`, {
      onState: (st) => {
        this.diag = { ...this.diag, relay: st === 'online' ? 'lista' : st === 'connecting' ? 'conectando' : 'caída' };
        if (st === 'online') this.sendRelay({ k: 'hello', profile: this.profile, clientId: this.cid, have: this.have() });
      },
      onMessage: (_t, payload) => {
        let env: { c: string | null; m: HostMsg };
        try {
          env = JSON.parse(payload);
        } catch {
          return;
        }
        if (env.c && env.c !== this.cid) return; // es para otro invitado
        this.onHostMsg(env.m, 'relay');
      },
    });
    relay.subscribe(`${base}/g`);
    relay.connect();
    this.relay = relay;
  }

  private sendRelay(m: GuestMsg) {
    return this.relay?.publish(`${TOPIC(this.code)}/h`, JSON.stringify({ c: this.cid, m })) ?? false;
  }

  private onHostMsg(msg: HostMsg, via: Route) {
    this.lastHostSeen = Date.now();
    if (msg.k === 'room') {
      if (msg.room.rev < this.lastRev && !msg.full) return; // llegó tarde por la otra ruta
      this.lastRev = msg.room.rev;
      this.applyRoom(msg);
      this.status = 'online';
      this.error = null;
      if (via === 'relay' && !this.conn?.open) this.diag = { ...this.diag, relay: 'en uso' };
    } else if (msg.k === 'pong') {
      const t1 = Date.now();
      const rtt = t1 - msg.t0;
      const off = msg.th - (msg.t0 + t1) / 2;
      this.samples.push({ rtt, off });
      if (this.samples.length > 12) this.samples.shift();
      const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
      if (best.rtt <= this.bestRtt * 1.5 || this.samples.length < 3) this.offset = best.off;
      this.bestRtt = best.rtt;
      this.diag = { ...this.diag, rtt };
    } else if (msg.k === 'full') {
      this.status = 'error';
      this.error = 'La sala ya tiene dos jugadores.';
      this.closed = true;
    }
  }

  /** Reconstruye la sala: estado sin historial + eventos (completos o solo los nuevos) */
  private applyRoom(msg: Extract<HostMsg, { k: 'room' }>) {
    const room = msg.room;
    const g = room.game;
    if (!g) {
      this.events = [];
      this.eventsKey = 0;
      this.room = room;
      return;
    }
    if (msg.evs) {
      if (msg.full || this.eventsKey !== g.startAt) {
        this.events = msg.evs.slice();
        this.eventsKey = g.startAt;
      } else {
        const last = this.events.length ? this.events[this.events.length - 1].id : 0;
        const fresh = msg.evs.filter((e) => e.id > last);
        this.events = this.events.concat(fresh);
      }
    }
    this.room = { ...room, game: { ...g, events: this.events } };
  }

  private ping() {
    const m: GuestMsg = { k: 'ping', t0: Date.now(), have: this.have() };
    if (this.conn?.open) this.conn.send(m);
    else this.sendRelay(m);
  }

  private heartbeat() {
    if (this.closed) return;
    this.ping();
    const direct = !!this.conn?.open;
    const fresh = Date.now() - this.lastHostSeen < TIMEOUT_MS;
    this.route = direct ? 'direct' : fresh ? 'relay' : 'none';
    if (fresh) {
      if (this.status !== 'online' && this.room) this.status = 'online';
    } else {
      // sin noticias del host: (re)saludar por el respaldo (pudo perderse o el host se reinició)
      this.sendRelay({ k: 'hello', profile: this.profile, clientId: this.cid, have: this.have() });
      if (this.room) this.status = 'reconnecting';
      else if (Date.now() - this.startedAt > 25000 && this.status === 'connecting') {
        this.status = 'error';
        this.error = `No encuentro la sala ${this.code}. Revisa el código y que el otro móvil tenga la sala abierta.`;
      }
    }
    if (direct && Date.now() - this.lastHostSeen > TIMEOUT_MS) {
      this.conn?.close();
      this.conn = null;
    }
    if (!direct && !NO_DIRECT) this.connect();
  }

  private flushQueue() {
    for (const it of this.queue.splice(0)) this.send(it);
  }

  send(intent: Intent) {
    const m: GuestMsg = { k: 'intent', intent, have: this.have() };
    if (this.conn?.open) this.conn.send(m);
    else if (!this.sendRelay(m) && (intent.t === 'profile' || intent.t === 'ready')) this.queue.push(intent);
  }

  leave() {
    this.closed = true;
    if (this.hb) clearInterval(this.hb);
    document.removeEventListener('visibilitychange', this.onVisible);
    this.conn?.close();
    this.peer?.destroy();
    this.relay?.close();
  }
}

// ───────────────────────────── PRUEBA (rival simulado) ─────────────────────────────

/** Host local con un segundo jugador simulado ("bot") que se controla con botones. */
export class SoloSession extends HostSession {
  override readonly kind: 'solo' | 'local' = 'solo';

  constructor(profile: Profile, botProfile: Profile, code = 'SOLO') {
    super(code, profile);
    joinGuest(this.r, botProfile);
    this.r.ready = {};
    this.status = 'online';
    this.publish();
  }

  override start() {
    this.status = 'online';
  }

  /** Acciones del segundo jugador. */
  bot(intent: Intent) {
    if (applyIntent(this.r, 'B', intent, Date.now())) this.commit();
  }

  /** El segundo jugador se marca listo automáticamente cuando el primero lo está. */
  override send(intent: Intent) {
    super.send(intent);
    if (intent.t === 'ready' && intent.ready) this.bot({ t: 'ready', ready: true });
  }

  /** Acción de cualquiera de los dos jugadores (para el modo de un móvil) */
  as(pid: string, intent: Intent) {
    if (pid === 'A') super.send(intent);
    else this.bot(intent);
  }
}

// ───────────────────────────── UN MÓVIL PARA LOS DOS ─────────────────────────────

/** Un único móvil hace de árbitro para los dos jugadores. No necesita ninguna conexión. */
export class LocalSession extends SoloSession {
  override readonly kind = 'local' as const;
  constructor(a: Profile, b: Profile) {
    super(a, b, 'LOCAL');
  }
}
