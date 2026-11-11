// Publica el servidor de rivales en Cloudflare y conecta la app con él. Se puede repetir sin miedo.
//   1. Crea la base de datos D1 (si no existe) y aplica las tablas.
//   2. Publica el Worker.
//   3. Genera las claves de notificaciones (solo la primera vez) y las guarda como secretos.
//   4. Escribe la dirección de la API en ../.env.production y publica la app (GitHub Pages).
// Requisito: haber entrado en Cloudflare con «npx wrangler login».
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const run = (cmd, opts = {}) => execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
const step = (t) => console.log(`\n▸ ${t}`);
const wr = 'npx wrangler';

step('Cuenta de Cloudflare');
const who = run(`${wr} whoami 2>&1`);
if (/not authenticated/i.test(who)) {
  console.error('No has entrado en Cloudflare. Ejecuta: npx wrangler login');
  process.exit(1);
}
console.log(who.split('\n').find((l) => /email|account/i.test(l)) ?? 'ok');

step('Base de datos');
const toml = readFileSync('wrangler.toml', 'utf8');
let dbId = /database_id = "([0-9a-f-]{36})"/.exec(toml)?.[1];
const list = JSON.parse(run(`${wr} d1 list --json`));
const found = list.find((d) => d.name === 'nerf-arena');
if (found) dbId = found.uuid;
else {
  const out = run(`${wr} d1 create nerf-arena 2>&1`);
  dbId = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/.exec(out)?.[1];
  if (!dbId) throw new Error('No se pudo crear la base de datos:\n' + out);
}
writeFileSync('wrangler.toml', toml.replace(/database_id = "[^"]*"/, `database_id = "${dbId}"`));
run(`${wr} d1 execute nerf-arena --remote --file=schema.sql -y 2>&1`);
console.log(`nerf-arena (${dbId})`);

step('Servidor');
const dep = run(`${wr} deploy 2>&1`);
const url = /(https:\/\/[a-z0-9.-]+\.workers\.dev)/.exec(dep)?.[1];
if (!url) {
  console.error(dep);
  console.error('\nSi pide registrar un subdominio workers.dev: entra en https://dash.cloudflare.com › Workers y Pages, elige un nombre y vuelve a ejecutar esto.');
  process.exit(1);
}
console.log(url);

step('Claves de notificaciones');
const secrets = run(`${wr} secret list --format json 2>/dev/null || echo []`);
if (!secrets.includes('VAPID_PUBLIC') || !secrets.includes('VAPID_PRIVATE')) {
  const { subtle } = webcrypto;
  const kp = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = Buffer.from(await subtle.exportKey('raw', kp.publicKey)).toString('base64url');
  const priv = JSON.stringify(await subtle.exportKey('jwk', kp.privateKey));
  for (const [k, v] of [['VAPID_PUBLIC', pub], ['VAPID_PRIVATE', priv]]) {
    const r = spawnSync('npx', ['wrangler', 'secret', 'put', k], { input: v, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`No se pudo guardar ${k}:\n${r.stdout}${r.stderr}`);
  }
  console.log('creadas');
} else console.log('ya estaban');

step('Comprobación');
const key = await fetch(`${url}/push/key`).then((r) => r.json());
console.log(key.key ? 'API en marcha con notificaciones' : 'API en marcha (sin claves de notificaciones aún)');

step('App');
writeFileSync('../.env.production', `VITE_API_URL=${url}\n`);
if (!process.argv.includes('--no-app')) {
  execSync('npm run deploy', { cwd: '..', stdio: 'inherit' });
}
console.log(`\nListo. API: ${url}`);
