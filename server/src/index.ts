// API de Nerf Arena: cuentas, rivalidades, guerra diaria, kebabs y notificaciones.
// Se ejecuta en Cloudflare Workers (plan gratuito) con una base de datos D1.

import { sendPush, b64u, type PushMessage, type PushSub } from './push';

export interface Env {
  DB: D1Database;
  ORIGINS: string;
  APP_URL: string;
  TZ: string;
  VAPID_PUBLIC?: string;
  VAPID_PRIVATE?: string;
  /** Solo en local: habilita /dev/* para probar sin esperar al día siguiente */
  DEV?: string;
}

// ───────────── reglas ─────────────
const WAR_FROM_H = 10; // la guerra puede empezar desde las 10:00…
const WAR_TO_H = 21; // …hasta las 21:00 (hora de España)
const CLAIM_MS = 15 * 60_000; // «le he dado» sin respuesta del otro: cuenta a los 15 min
const LOCK_AFTER = 8; // intentos de entrada fallidos seguidos…
const LOCK_MS = 15 * 60_000; // …y se bloquea la cuenta 15 min
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ───────────── utilidades ─────────────
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, msg: string): never => {
  throw new HttpError(status, msg);
};

async function sha256(s: string): Promise<string> {
  return b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
const normCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Igual que en la app: solo letras, primera en mayúscula, 2-12 letras */
function cleanName(raw: unknown): string {
  const only = String(raw ?? '')
    .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, '')
    .slice(0, 12);
  return only ? only[0].toUpperCase() + only.slice(1).toLowerCase() : '';
}
const nameKey = (n: string) =>
  n
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const COLORS = ['naranja', 'azul', 'verde', 'rosa', 'amarillo', 'violeta'];
const safeId = (v: unknown, fallback: string) => (typeof v === 'string' && /^[a-z0-9-]{1,24}$/.test(v) ? v : fallback);

// ── hora de España ──
function localParts(t: number, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(t))
      .map((x) => [x.type, x.value]),
  );
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
const dayOf = (t: number, tz: string) => {
  const p = localParts(t, tz);
  return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
};
/** ms UTC de una hora local concreta de un día (AAAA-MM-DD) */
function localTime(day: string, h: number, mi: number, tz: string): number {
  const [y, mo, d] = day.split('-').map(Number);
  let t = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = localParts(t, tz);
    const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    t -= asUtc - Date.UTC(y, mo - 1, d, h, mi);
  }
  return t;
}
const nextDay = (day: string) => {
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + 1)).toISOString().slice(0, 10);
};

// ───────────── tipos de filas ─────────────
interface User {
  id: number;
  name: string;
  color: string;
  icon: string;
}
interface Rivalry {
  id: number;
  a: number;
  b: number;
  status: 'pending' | 'active' | 'ended';
  created: number;
  updated: number;
}
interface War {
  id: number;
  rivalry_id: number;
  day: string;
  starts: number;
  ends: number;
  status: 'scheduled' | 'live' | 'claimed' | 'done' | 'expired';
  hitter: number | null;
  victim: number | null;
  claimed_by: number | null;
  claimed_at: number | null;
  resolved_at: number | null;
  paid_at: number | null;
}

const publicUser = (u: User) => ({ id: u.id, name: u.name, color: u.color, icon: u.icon });

// ───────────── notificaciones ─────────────
async function notify(env: Env, userIds: number[], msg: PushMessage): Promise<number> {
  if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE || !userIds.length) return 0;
  const subs = await env.DB.prepare(
    `SELECT endpoint, p256dh, auth FROM push_subs WHERE user_id IN (${userIds.map(() => '?').join(',')})`,
  )
    .bind(...userIds)
    .all<PushSub>();
  const vapid = { publicKey: env.VAPID_PUBLIC, privateJwk: env.VAPID_PRIVATE, subject: env.APP_URL };
  let ok = 0;
  await Promise.all(
    subs.results.map(async (s) => {
      const r = await sendPush(s, { url: env.APP_URL + '?rivales', ...msg }, vapid);
      if (r === 'ok') ok++;
      if (r === 'gone') await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
    }),
  );
  return ok;
}

// ───────────── guerras ─────────────
const randInt = (a: number, b: number) => a + Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (b - a + 1));

/** Programa (si falta) la guerra de hoy o de mañana de una rivalidad activa */
async function scheduleWar(env: Env, r: Rivalry, now: number) {
  const tz = env.TZ;
  let day = dayOf(now, tz);
  const exists = await env.DB.prepare('SELECT id FROM wars WHERE rivalry_id = ? AND day = ?').bind(r.id, day).first();
  if (exists) return;
  let from = Math.max(localTime(day, WAR_FROM_H, 0, tz), now + 15 * 60_000);
  let to = localTime(day, WAR_TO_H, 0, tz);
  if (from > to) {
    // Hoy ya es tarde: la primera guerra será mañana (la de mañana se programa mañana)
    day = nextDay(day);
    const again = await env.DB.prepare('SELECT id FROM wars WHERE rivalry_id = ? AND day = ?').bind(r.id, day).first();
    if (again) return;
    from = localTime(day, WAR_FROM_H, 0, tz);
    to = localTime(day, WAR_TO_H, 0, tz);
  }
  const starts = randInt(from, to);
  const ends = localTime(nextDay(day), 0, 0, tz) - 1000; // hasta las 23:59:59
  await env.DB.prepare('INSERT OR IGNORE INTO wars (rivalry_id, day, starts, ends, status) VALUES (?, ?, ?, ?, ?)')
    .bind(r.id, day, starts, ends, 'scheduled')
    .run();
}

async function usersOf(env: Env, r: Rivalry): Promise<[User, User]> {
  const rows = await env.DB.prepare('SELECT id, name, color, icon FROM users WHERE id IN (?, ?)').bind(r.a, r.b).all<User>();
  const a = rows.results.find((u) => u.id === r.a)!;
  const b = rows.results.find((u) => u.id === r.b)!;
  return [a, b];
}

async function startWar(env: Env, w: War) {
  const r = await env.DB.prepare('SELECT * FROM rivalries WHERE id = ?').bind(w.rivalry_id).first<Rivalry>();
  const upd = await env.DB.prepare("UPDATE wars SET status = 'live' WHERE id = ? AND status = 'scheduled'").bind(w.id).run();
  if (!r || r.status !== 'active' || !upd.meta.changes) return;
  const [a, b] = await usersOf(env, r);
  const body = 'Hasta medianoche. El primero que reciba un dardo paga el kebab.';
  await Promise.all([
    notify(env, [a.id], { title: `Guerra contra ${b.name}`, body, tag: `war-${w.id}`, urgent: true }),
    notify(env, [b.id], { title: `Guerra contra ${a.name}`, body, tag: `war-${w.id}`, urgent: true }),
  ]);
}

/** Cierra la guerra con un ganador del kebab */
async function resolveWar(env: Env, w: War, hitter: number, victim: number, now: number) {
  const upd = await env.DB.prepare(
    "UPDATE wars SET status = 'done', hitter = ?, victim = ?, resolved_at = ? WHERE id = ? AND status IN ('live', 'claimed')",
  )
    .bind(hitter, victim, now, w.id)
    .run();
  if (!upd.meta.changes) return;
  const r = (await env.DB.prepare('SELECT * FROM rivalries WHERE id = ?').bind(w.rivalry_id).first<Rivalry>())!;
  const [a, b] = await usersOf(env, r);
  const H = a.id === hitter ? a : b;
  const V = a.id === victim ? a : b;
  await Promise.all([
    notify(env, [H.id], { title: `Le has dado a ${V.name}`, body: `${V.name} te debe un kebab.`, tag: `war-${w.id}` }),
    notify(env, [V.id], { title: `Te ha dado ${H.name}`, body: `Le debes un kebab a ${H.name}.`, tag: `war-${w.id}` }),
  ]);
}

/** Tarea programada: cada 10 minutos */
async function tick(env: Env, now = Date.now()) {
  const active = await env.DB.prepare("SELECT * FROM rivalries WHERE status = 'active'").all<Rivalry>();
  for (const r of active.results) await scheduleWar(env, r, now);

  const due = await env.DB.prepare("SELECT * FROM wars WHERE status = 'scheduled' AND starts <= ?").bind(now).all<War>();
  for (const w of due.results) {
    if (w.ends <= now) await env.DB.prepare("UPDATE wars SET status = 'expired' WHERE id = ?").bind(w.id).run();
    else await startWar(env, w);
  }

  // «Le he dado» sin respuesta: cuenta
  const claims = await env.DB.prepare("SELECT * FROM wars WHERE status = 'claimed' AND claimed_at <= ?").bind(now - CLAIM_MS).all<War>();
  for (const w of claims.results) {
    const r = await env.DB.prepare('SELECT a, b FROM rivalries WHERE id = ?').bind(w.rivalry_id).first<{ a: number; b: number }>();
    if (r && w.claimed_by) await resolveWar(env, w, w.claimed_by, w.claimed_by === r.a ? r.b : r.a, now);
  }

  // Medianoche sin dardos: tablas
  const over = await env.DB.prepare("SELECT * FROM wars WHERE status = 'live' AND ends <= ?").bind(now).all<War>();
  for (const w of over.results) {
    await env.DB.prepare("UPDATE wars SET status = 'expired', resolved_at = ? WHERE id = ? AND status = 'live'").bind(now, w.id).run();
  }
}

// ───────────── sesiones ─────────────
async function newSession(env: Env, userId: number): Promise<string> {
  const token = b64u(crypto.getRandomValues(new Uint8Array(32)));
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created, seen) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now)
    .run();
  return token;
}

async function authUser(env: Env, req: Request): Promise<User & { tokenHash: string }> {
  const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') ?? '');
  if (!m) fail(401, 'Tienes que entrar en tu cuenta');
  const tokenHash = await sha256(m![1]);
  const u = await env.DB.prepare(
    'SELECT u.id, u.name, u.color, u.icon, s.seen FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
  )
    .bind(tokenHash)
    .first<User & { seen: number }>();
  if (!u) fail(401, 'La sesión ha caducado: vuelve a entrar');
  if (Date.now() - u!.seen > 3600_000) {
    await env.DB.prepare('UPDATE sessions SET seen = ? WHERE token_hash = ?').bind(Date.now(), tokenHash).run();
  }
  return { ...u!, tokenHash };
}

// ───────────── estado para la app ─────────────
async function state(env: Env, me: User) {
  const now = Date.now();
  const rivs = await env.DB.prepare(
    "SELECT * FROM rivalries WHERE (a = ? OR b = ?) AND status != 'ended' ORDER BY updated DESC",
  )
    .bind(me.id, me.id)
    .all<Rivalry>();
  const today = dayOf(now, env.TZ);
  const rivals = [];
  for (const r of rivs.results) {
    const [a, b] = await usersOf(env, r);
    const rival = a.id === me.id ? b : a;
    const wars = await env.DB.prepare('SELECT * FROM wars WHERE rivalry_id = ? ORDER BY day DESC LIMIT 30').bind(r.id).all<War>();
    const counts = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status = 'done' AND victim = ? AND paid_at IS NULL THEN 1 ELSE 0 END) AS iOwe,
         SUM(CASE WHEN status = 'done' AND hitter = ? AND paid_at IS NULL THEN 1 ELSE 0 END) AS theyOwe,
         SUM(CASE WHEN status = 'done' AND hitter = ? THEN 1 ELSE 0 END) AS won,
         SUM(CASE WHEN status = 'done' AND victim = ? THEN 1 ELSE 0 END) AS lost,
         SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS draws
       FROM wars WHERE rivalry_id = ?`,
    )
      .bind(me.id, me.id, me.id, me.id, r.id)
      .first<Record<string, number | null>>();
    // La hora de la guerra programada es secreta: solo se ve cuando empieza
    const cur = wars.results.find((w) => w.day === today && w.status !== 'scheduled') ?? null;
    rivals.push({
      id: r.id,
      status: r.status,
      invitedByMe: r.a === me.id,
      rival: publicUser(rival),
      today: cur ? warView(cur) : wars.results.some((w) => w.status === 'scheduled') ? { status: 'scheduled' } : null,
      history: wars.results.filter((w) => w.status === 'done' || w.status === 'expired').slice(0, 15).map(warView),
      kebabs: {
        iOwe: counts?.iOwe ?? 0,
        theyOwe: counts?.theyOwe ?? 0,
        won: counts?.won ?? 0,
        lost: counts?.lost ?? 0,
        draws: counts?.draws ?? 0,
      },
    });
  }
  const subs = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?').bind(me.id).first<{ n: number }>();
  return { user: publicUser(me), rivals, pushDevices: subs?.n ?? 0, now };
}

function warView(w: War) {
  return {
    id: w.id,
    day: w.day,
    status: w.status,
    starts: w.status === 'scheduled' ? null : w.starts,
    ends: w.ends,
    hitter: w.hitter,
    victim: w.victim,
    claimedBy: w.claimed_by,
    claimedAt: w.claimed_at,
    paid: !!w.paid_at,
  };
}

async function rivalryFor(env: Env, id: number, me: User): Promise<Rivalry> {
  const r = await env.DB.prepare('SELECT * FROM rivalries WHERE id = ? AND (a = ? OR b = ?)').bind(id, me.id, me.id).first<Rivalry>();
  if (!r) fail(404, 'Esa rivalidad no existe');
  return r!;
}

// ───────────── rutas ─────────────
async function route(req: Request, env: Env): Promise<unknown> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = req.method;
  const body = method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, any>) : {};
  const now = Date.now();
  const seg = path.split('/').filter(Boolean);

  if (method === 'GET' && path === '/push/key') return { key: env.VAPID_PUBLIC ?? null };

  // ── cuentas ──
  if (method === 'POST' && path === '/auth/signup') {
    const name = cleanName(body.name);
    if (name.length < 2) fail(400, 'Escribe un nombre de al menos 2 letras');
    const code = randomCode();
    const res = await env.DB.prepare(
      'INSERT OR IGNORE INTO users (name, name_key, code_hash, color, icon, created) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(name, nameKey(name), await sha256(normCode(code)), COLORS.includes(body.color) ? body.color : 'naranja', safeId(body.icon, 'rayo'), now)
      .run();
    if (!res.meta.changes) fail(409, `Ya hay una cuenta llamada ${name}. Si es tuya, entra con tu código.`);
    const id = res.meta.last_row_id as number;
    return { token: await newSession(env, id), code, user: { id, name } };
  }
  if (method === 'POST' && path === '/auth/login') {
    const name = cleanName(body.name);
    const u = await env.DB.prepare('SELECT * FROM users WHERE name_key = ?')
      .bind(nameKey(name))
      .first<User & { code_hash: string; fails: number; locked_until: number }>();
    if (!u) fail(404, `No hay ninguna cuenta llamada ${name || '…'}`);
    if (u!.locked_until > now) fail(429, 'Demasiados intentos. Espera 15 minutos.');
    if ((await sha256(normCode(String(body.code ?? '')))) !== u!.code_hash) {
      const fails = u!.fails + 1;
      await env.DB.prepare('UPDATE users SET fails = ?, locked_until = ? WHERE id = ?')
        .bind(fails >= LOCK_AFTER ? 0 : fails, fails >= LOCK_AFTER ? now + LOCK_MS : 0, u!.id)
        .run();
      fail(403, 'Ese código no es correcto');
    }
    await env.DB.prepare('UPDATE users SET fails = 0, locked_until = 0 WHERE id = ?').bind(u!.id).run();
    return { token: await newSession(env, u!.id), user: publicUser(u!) };
  }

  // ── a partir de aquí, con sesión ──
  const me = await authUser(env, req);

  if (method === 'GET' && path === '/me') return state(env, me);
  if (method === 'POST' && path === '/auth/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(me.tokenHash).run();
    if (body.endpoint) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(body.endpoint, me.id).run();
    return { ok: true };
  }
  if (method === 'POST' && path === '/auth/profile') {
    await env.DB.prepare('UPDATE users SET color = ?, icon = ? WHERE id = ?')
      .bind(COLORS.includes(body.color) ? body.color : me.color, safeId(body.icon, me.icon), me.id)
      .run();
    return { ok: true };
  }
  if (method === 'POST' && path === '/auth/delete') {
    for (const sql of [
      'DELETE FROM wars WHERE rivalry_id IN (SELECT id FROM rivalries WHERE a = ?1 OR b = ?1)',
      'DELETE FROM rivalries WHERE a = ?1 OR b = ?1',
      'DELETE FROM push_subs WHERE user_id = ?1',
      'DELETE FROM sessions WHERE user_id = ?1',
      'DELETE FROM users WHERE id = ?1',
    ])
      await env.DB.prepare(sql).bind(me.id).run();
    return { ok: true };
  }

  // ── notificaciones ──
  if (method === 'POST' && path === '/push/subscribe') {
    const ep = String(body.endpoint ?? '');
    if (!/^https:\/\//.test(ep) || !body.keys?.p256dh || !body.keys?.auth) fail(400, 'Suscripción no válida');
    await env.DB.prepare(
      'INSERT INTO push_subs (endpoint, user_id, p256dh, auth, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth',
    )
      .bind(ep, me.id, String(body.keys.p256dh), String(body.keys.auth), now)
      .run();
    return { ok: true };
  }
  if (method === 'POST' && path === '/push/unsubscribe') {
    await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(String(body.endpoint ?? ''), me.id).run();
    return { ok: true };
  }
  if (method === 'POST' && path === '/push/test') {
    const sent = await notify(env, [me.id], { title: 'Nerf Arena', body: 'Las notificaciones funcionan. Te avisaremos cuando haya guerra.', tag: 'test' });
    return { sent };
  }

  // ── rivalidades ──
  if (method === 'POST' && path === '/rivals') {
    const name = cleanName(body.name);
    const other = await env.DB.prepare('SELECT id, name, color, icon FROM users WHERE name_key = ?').bind(nameKey(name)).first<User>();
    if (!other) fail(404, `No hay ninguna cuenta llamada ${name || '…'}`);
    if (other!.id === me.id) fail(400, 'No puedes declararte la guerra a ti mismo');
    const open = await env.DB.prepare(
      "SELECT * FROM rivalries WHERE status != 'ended' AND ((a = ?1 AND b = ?2) OR (a = ?2 AND b = ?1))",
    )
      .bind(me.id, other!.id)
      .first<Rivalry>();
    if (open?.status === 'active') fail(409, `Ya tienes rivalidad con ${other!.name}`);
    if (open?.status === 'pending' && open.a === other!.id) {
      // Los dos se han invitado a la vez: queda aceptada
      await env.DB.prepare("UPDATE rivalries SET status = 'active', updated = ? WHERE id = ?").bind(now, open.id).run();
      await scheduleWar(env, { ...open, status: 'active' }, now);
      return { ok: true, accepted: true };
    }
    if (open) fail(409, `Ya has invitado a ${other!.name}`);
    await env.DB.prepare("INSERT INTO rivalries (a, b, status, created, updated) VALUES (?, ?, 'pending', ?, ?)").bind(me.id, other!.id, now, now).run();
    await notify(env, [other!.id], { title: `${me.name} te declara la rivalidad`, body: 'Acéptala en Nerf Arena › Rivales. Cada día habrá una guerra por un kebab.', tag: 'invite' });
    return { ok: true };
  }
  if (method === 'POST' && seg[0] === 'rivals' && seg.length === 3) {
    const r = await rivalryFor(env, Number(seg[1]), me);
    const otherId = r.a === me.id ? r.b : r.a;
    switch (seg[2]) {
      case 'accept': {
        if (r.status !== 'pending' || r.b !== me.id) fail(400, 'No hay nada que aceptar');
        await env.DB.prepare("UPDATE rivalries SET status = 'active', updated = ? WHERE id = ?").bind(now, r.id).run();
        await scheduleWar(env, { ...r, status: 'active' }, now);
        await notify(env, [otherId], { title: `${me.name} acepta la rivalidad`, body: 'Desde hoy, una guerra al día. El que reciba el dardo paga el kebab.', tag: 'invite' });
        return { ok: true };
      }
      case 'decline':
      case 'end': {
        await env.DB.prepare("UPDATE rivalries SET status = 'ended', updated = ? WHERE id = ?").bind(now, r.id).run();
        await env.DB.prepare("DELETE FROM wars WHERE rivalry_id = ? AND status = 'scheduled'").bind(r.id).run();
        return { ok: true };
      }
      case 'paid': {
        // Lo marca quien cobra: «ya me ha pagado un kebab»
        const w = await env.DB.prepare(
          "SELECT id FROM wars WHERE rivalry_id = ? AND status = 'done' AND hitter = ? AND paid_at IS NULL ORDER BY day LIMIT 1",
        )
          .bind(r.id, me.id)
          .first<{ id: number }>();
        if (!w) fail(400, 'No te debe ningún kebab');
        await env.DB.prepare('UPDATE wars SET paid_at = ? WHERE id = ?').bind(now, w!.id).run();
        return { ok: true };
      }
    }
  }

  // ── guerra: dardo ──
  if (method === 'POST' && seg[0] === 'wars' && seg.length === 3) {
    const w = await env.DB.prepare('SELECT * FROM wars WHERE id = ?').bind(Number(seg[1])).first<War>();
    if (!w) fail(404, 'Esa guerra no existe');
    const r = await rivalryFor(env, w!.rivalry_id, me);
    const otherId = r.a === me.id ? r.b : r.a;
    if (seg[2] === 'hit') {
      if (w!.status !== 'live' || now > w!.ends) fail(400, 'Esta guerra ya no está en marcha');
      if (body.who === 'me') {
        // «Me ha dado»: cuenta al momento
        await resolveWar(env, w!, otherId, me.id, now);
      } else {
        // «Le he dado»: el otro tiene que confirmarlo (o cuenta en 15 min)
        await env.DB.prepare("UPDATE wars SET status = 'claimed', claimed_by = ?, claimed_at = ? WHERE id = ? AND status = 'live'")
          .bind(me.id, now, w!.id)
          .run();
        await notify(env, [otherId], {
          title: `${me.name} dice que te ha dado`,
          body: 'Confírmalo o niégalo en la app. Si no contestas en 15 minutos, cuenta.',
          tag: `war-${w!.id}`,
          urgent: true,
        });
      }
      return { ok: true };
    }
    if (seg[2] === 'confirm') {
      if (w!.status !== 'claimed' || w!.claimed_by === me.id) fail(400, 'No hay nada que confirmar');
      if (body.ok) await resolveWar(env, w!, otherId, me.id, now);
      else {
        await env.DB.prepare("UPDATE wars SET status = 'live', claimed_by = NULL, claimed_at = NULL WHERE id = ? AND status = 'claimed'").bind(w!.id).run();
        await notify(env, [otherId], { title: `${me.name} dice que no le diste`, body: 'La guerra sigue hasta medianoche.', tag: `war-${w!.id}` });
      }
      return { ok: true };
    }
  }

  // ── solo en local: forzar una guerra o el reloj para probar ──
  if (env.DEV === '1' && method === 'POST' && seg[0] === 'dev') {
    if (seg[1] === 'war') {
      const r = await rivalryFor(env, Number(body.rivalry), me);
      const day = dayOf(now, env.TZ);
      await env.DB.prepare('DELETE FROM wars WHERE rivalry_id = ? AND day = ?').bind(r.id, day).run();
      await env.DB.prepare("INSERT INTO wars (rivalry_id, day, starts, ends, status) VALUES (?, ?, ?, ?, 'scheduled')")
        .bind(r.id, day, now - 1000, now + 3600_000)
        .run();
      await tick(env, now);
      return { ok: true };
    }
    if (seg[1] === 'tick') {
      await tick(env, Number(body.now) || now);
      return { ok: true };
    }
  }

  fail(404, 'Ruta desconocida');
}

function cors(env: Env, req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = env.ORIGINS.split(',').map((s) => s.trim());
  return allowed.includes(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : {};
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const headers = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      const data = await route(req, env);
      return Response.json(data, { headers: { ...headers, 'Cache-Control': 'no-store' } });
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      const error = e instanceof HttpError ? e.message : 'Error del servidor';
      if (!(e instanceof HttpError)) console.error(e);
      return Response.json({ error }, { status, headers });
    }
  },
  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(tick(env));
  },
} satisfies ExportedHandler<Env>;

// Para las pruebas
export { tick, dayOf, localTime };
