// Envío de notificaciones Web Push sin librerías: cifrado del mensaje (RFC 8291, aes128gcm)
// y firma VAPID (RFC 8292), todo con WebCrypto.

export interface PushSub {
  endpoint: string;
  p256dh: string; // clave pública del navegador (base64url, 65 bytes)
  auth: string; // secreto de autenticación (base64url, 16 bytes)
}

export interface Vapid {
  publicKey: string; // base64url, 65 bytes sin comprimir
  privateJwk: string; // JWK de la clave privada ECDSA P-256
  subject: string; // https://… o mailto:…
}

const enc = new TextEncoder();

export function b64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8);
  return new Uint8Array(bits);
}

/** Cifra el mensaje para una suscripción concreta (formato aes128gcm de un solo bloque). */
export async function encrypt(sub: PushSub, payload: string): Promise<Uint8Array> {
  const uaPublic = unb64u(sub.p256dh);
  const authSecret = unb64u(sub.auth);
  // Clave efímera del servidor para este mensaje
  const eph = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', eph.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, eph.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 = último bloque
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));

  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

const jwtCache = new Map<string, { jwt: string; exp: number }>();

/** Cabecera Authorization VAPID para el servicio push del endpoint */
async function vapidAuth(endpoint: string, v: Vapid): Promise<string> {
  const aud = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const hit = jwtCache.get(aud);
  if (hit && hit.exp - now > 3600) return `vapid t=${hit.jwt}, k=${v.publicKey}`;
  const exp = now + 12 * 3600;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp, sub: v.subject })));
  const key = await crypto.subtle.importKey('jwk', JSON.parse(v.privateJwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // WebCrypto ya devuelve la firma en el formato de JWS (r||s, 64 bytes)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  const jwt = `${head}.${body}.${b64u(sig)}`;
  jwtCache.set(aud, { jwt, exp });
  return `vapid t=${jwt}, k=${v.publicKey}`;
}

export interface PushMessage {
  title: string;
  body: string;
  tag?: string; // misma etiqueta = sustituye a la anterior
  url?: string; // dónde abrir la app al tocarla
  urgent?: boolean;
}

/** Envía. Devuelve 'gone' si la suscripción ya no existe (hay que borrarla). */
export async function sendPush(sub: PushSub, msg: PushMessage, v: Vapid): Promise<'ok' | 'gone' | 'error'> {
  try {
    const body = await encrypt(sub, JSON.stringify(msg));
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidAuth(sub.endpoint, v),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(msg.urgent ? 3 * 3600 : 24 * 3600),
        Urgency: msg.urgent ? 'high' : 'normal',
        ...(msg.tag ? { Topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) } : {}),
      },
      body,
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}
