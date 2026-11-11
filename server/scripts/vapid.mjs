// Genera el par de claves VAPID para las notificaciones push.
// Uso: npm run vapid   → imprime los dos valores para guardarlos como secretos.
const { subtle } = globalThis.crypto;
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = b64u(await subtle.exportKey('raw', kp.publicKey));
const priv = JSON.stringify(await subtle.exportKey('jwk', kp.privateKey));
console.log(`VAPID_PUBLIC=${pub}`);
console.log(`VAPID_PRIVATE=${priv}`);
