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
  private closed = false;
  private buf = new Uint8Array(0);
  private pid = 1;
  online = false;
  broker = '';

  constructor(
    private clientId: string,
    private h: MqttHandlers,
  ) {}

  connect() {
    if (this.closed) return;
    const url = BROKERS[this.brokerIdx % BROKERS.length];
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
    this.retry = setTimeout(() => this.connect(), 1500);
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
