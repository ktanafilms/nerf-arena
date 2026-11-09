// Cliente MQTT 3.1.1 mínimo sobre WebSocket (solo lo necesario: conectar, suscribirse,
// publicar QoS 0 y mantener viva la conexión). Sirve de ruta de respaldo cuando la
// conexión directa entre móviles (WebRTC) no es posible.

export const BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

const enc = new TextEncoder();
const dec = new TextDecoder();

function varLen(n: number): number[] {
  const out: number[] = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}
const str = (s: string) => {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 0xff, ...b];
};
function packet(type: number, flags: number, body: number[] | Uint8Array): Uint8Array {
  const b = body instanceof Uint8Array ? body : Uint8Array.from(body);
  const head = [(type << 4) | flags, ...varLen(b.length)];
  const out = new Uint8Array(head.length + b.length);
  out.set(head);
  out.set(b, head.length);
  return out;
}

export interface MqttHandlers {
  onMessage(topic: string, payload: string): void;
  onState(state: 'connecting' | 'online' | 'offline', broker?: string): void;
}

export class Mqtt {
  private ws: WebSocket | null = null;
  private subs = new Set<string>();
  private ping: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private brokerIdx = 0;
  private fails = 0;
  private closed = false;
  private buf = new Uint8Array(0);
  private pid = 1;
  online = false;
  broker = '';

  constructor(
    private clientId: string,
    private h: MqttHandlers,
    /** Servidores a probar por turnos (uno solo = siempre el mismo) */
    private brokers: string[] = BROKERS,
  ) {}

  connect() {
    if (this.closed) return;
    const url = this.brokers[this.brokerIdx % this.brokers.length];
    this.broker = url;
    this.h.onState('connecting', url);
    let ws: WebSocket;
    try {
      ws = new WebSocket(url, 'mqtt');
    } catch {
      return this.fail();
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    const giveUp = setTimeout(() => {
      if (!this.online) ws.close();
    }, 6000);
    ws.onopen = () => {
      // CONNECT: protocolo MQTT v4, sesión limpia, keepalive 30 s
      const body = [...str('MQTT'), 4, 0x02, 0, 30, ...str(this.clientId)];
      ws.send(packet(1, 0, body));
    };
    ws.onmessage = (e) => this.feed(new Uint8Array(e.data as ArrayBuffer), giveUp);
    ws.onclose = () => {
      clearTimeout(giveUp);
      if (this.ws === ws) this.fail();
    };
    ws.onerror = () => {};
  }

  private fail() {
    this.online = false;
    this.ws = null;
    if (this.ping) clearInterval(this.ping);
    this.h.onState('offline', this.broker);
    if (this.closed) return;
    this.brokerIdx++; // probar el siguiente servidor
    this.fails++;
    this.retry = setTimeout(() => this.connect(), Math.min(1500 * this.fails, 10000));
  }

  private feed(chunk: Uint8Array, giveUp: ReturnType<typeof setTimeout>) {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    for (;;) {
      if (this.buf.length < 2) return;
      let len = 0,
        mul = 1,
        i = 1,
        byte: number;
      do {
        if (i >= this.buf.length) return;
        byte = this.buf[i++];
        len += (byte & 0x7f) * mul;
        mul *= 128;
      } while (byte & 0x80);
      if (this.buf.length < i + len) return;
      const type = this.buf[0] >> 4;
      const body = this.buf.slice(i, i + len);
      this.buf = this.buf.slice(i + len);
      if (type === 2) {
        // CONNACK
        clearTimeout(giveUp);
        if (body[1] !== 0) {
          this.ws?.close();
          return;
        }
        this.online = true;
        this.fails = 0;
        this.h.onState('online', this.broker);
        for (const t of this.subs) this.sendSub(t);
        this.ping = setInterval(() => this.ws?.readyState === 1 && this.ws.send(packet(12, 0, [])), 20000);
      } else if (type === 3) {
        // PUBLISH (QoS 0)
        const tl = (body[0] << 8) | body[1];
        const topic = dec.decode(body.slice(2, 2 + tl));
        const payload = dec.decode(body.slice(2 + tl));
        this.h.onMessage(topic, payload);
      }
    }
  }

  private sendSub(topic: string) {
    const id = this.pid++ & 0xffff;
    this.ws?.send(packet(8, 2, [id >> 8, id & 0xff, ...str(topic), 0]));
  }

  subscribe(topic: string) {
    this.subs.add(topic);
    if (this.online) this.sendSub(topic);
  }

  publish(topic: string, payload: string): boolean {
    if (!this.online || this.ws?.readyState !== 1) return false;
    const body = new Uint8Array([...str(topic), ...enc.encode(payload)]);
    this.ws.send(packet(3, 0, body));
    return true;
  }

  close() {
    this.closed = true;
    if (this.ping) clearInterval(this.ping);
    if (this.retry) clearTimeout(this.retry);
    try {
      this.ws?.send(packet(14, 0, []));
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.online = false;
  }
}

/**
 * Varios servidores a la vez. Cada móvil se conecta a todos y publica en todos los que
 * tenga abiertos: así los dos coinciden siempre en alguno, aunque otro falle o tarde.
 * (Con un solo servidor por móvil, cada uno podía acabar en uno distinto y no verse nunca.)
 * Los mensajes repetidos que llegan por más de un servidor se entregan una sola vez.
 */
export class MqttPool {
  private clients: Mqtt[];
  private recent = new Map<string, number>();

  constructor(clientId: string, private h: MqttHandlers, brokers: string[] = BROKERS) {
    this.clients = brokers.map(
      (url) =>
        new Mqtt(
          clientId,
          {
            onMessage: (topic, payload) => this.receive(topic, payload),
            // Se avisa cuando un servidor se abre y, de los fallos, solo si no queda ninguno abierto
            onState: (st) => {
              if (st === 'online' || !this.online) this.h.onState(st, url);
            },
          },
          [url],
        ),
    );
  }

  /** Servidores abiertos ahora mismo */
  get count() {
    return this.clients.filter((c) => c.online).length;
  }
  get total() {
    return this.clients.length;
  }
  get online() {
    return this.clients.some((c) => c.online);
  }

  private receive(topic: string, payload: string) {
    const now = Date.now();
    let h = 5381;
    for (let i = 0; i < payload.length; i++) h = ((h << 5) + h + payload.charCodeAt(i)) | 0;
    const key = `${topic}:${payload.length}:${h}`;
    const seen = this.recent.get(key);
    this.recent.set(key, now);
    if (this.recent.size > 200) for (const [k, t] of this.recent) if (now - t > 5000) this.recent.delete(k);
    if (seen !== undefined && now - seen < 5000) return; // ya llegó por otro servidor
    this.h.onMessage(topic, payload);
  }

  subscribe(topic: string) {
    for (const c of this.clients) c.subscribe(topic);
  }

  connect() {
    for (const c of this.clients) c.connect();
  }

  /** Publica en todos los servidores abiertos. false si no hay ninguno. */
  publish(topic: string, payload: string): boolean {
    let sent = false;
    for (const c of this.clients) if (c.publish(topic, payload)) sent = true;
    return sent;
  }

  close() {
    for (const c of this.clients) c.close();
  }
}
