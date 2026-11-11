<script lang="ts">
  // Rivales: cuenta personal, rivalidades, la guerra diaria y la cuenta de kebabs.
  import { app } from '../lib/app.svelte';
  import { account, accountsEnabled, kebabs, timeLeft, type RivalView, type WarView } from '../lib/account.svelte';
  import { cleanName } from '../lib/names';
  import { colorDef } from '../lib/types';
  import { isIOS } from '../lib/device';
  import { sfx } from '../lib/audio/sfx';
  import Avatar from '../components/Avatar.svelte';

  let tab = $state<'new' | 'login'>(account.code ? 'login' : 'new');
  let name = $state(app.prefs.profile?.name ?? '');
  let code = $state('');
  let rivalName = $state('');
  let showCode = $state(false);
  let justCreated = $state(false);
  let sure = $state<string | null>(null); // confirmación de acciones con dos toques

  // Reloj para las cuentas atrás y refresco periódico mientras la pantalla está abierta
  let now = $state(account.now());
  $effect(() => {
    account.refresh();
    const tick = setInterval(() => (now = account.now()), 1000);
    const poll = setInterval(() => account.refresh(), 20000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  });

  const me = $derived(account.me?.user ?? null);
  const active = $derived(account.me?.rivals.filter((r) => r.status === 'active') ?? []);
  const incoming = $derived(account.me?.rivals.filter((r) => r.status === 'pending' && !r.invitedByMe) ?? []);
  const outgoing = $derived(account.me?.rivals.filter((r) => r.status === 'pending' && r.invitedByMe) ?? []);
  const wars = $derived(active.filter((r) => r.today && (r.today.status === 'live' || r.today.status === 'claimed')));

  const live = (r: RivalView) => r.today as WarView;
  const twice = (key: string, fn: () => void) => {
    if (sure === key) {
      sure = null;
      fn();
    } else {
      sure = key;
      setTimeout(() => sure === key && (sure = null), 3000);
    }
  };

  async function create() {
    const p = app.prefs.profile;
    if (await account.signup(name, p?.color ?? 'naranja', p?.icon ?? 'rayo')) {
      justCreated = true;
      sfx.confirm();
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(`Nerf Arena · ${me?.name} · ${account.code}`);
      app.showToast('Código copiado');
    } catch {
      app.showToast('No se pudo copiar: apúntalo');
    }
  }

  function todayText(r: RivalView): string {
    const t = r.today;
    if (!t) return 'Mañana habrá guerra';
    if (t.status === 'scheduled') return 'Hoy hay guerra a una hora secreta';
    if (t.status === 'expired') return 'Hoy nadie dio: tablas';
    if (t.status === 'done') return (t as WarView).hitter === me?.id ? `Hoy le diste: te debe el kebab` : `Hoy te dio: le debes el kebab`;
    return 'Guerra en marcha';
  }
</script>

<div class="screen rv">
  <div class="head">
    <h1 class="display">Rivales</h1>
    <button class="link" onclick={() => (app.screen = 'home')}>Volver</button>
  </div>

  {#if !accountsEnabled}
    <p class="body">Las rivalidades se activan en cuanto el servidor esté publicado. Vuelve en un rato.</p>
  {:else if !account.loggedIn}
    <!-- ───── Sin cuenta ───── -->
    <p class="body">
      Con una cuenta puedes declarar la rivalidad a otro jugador. Cada día, a una hora al azar, os llega a los dos un aviso de
      <b>guerra</b>: el primero que reciba un dardo paga el kebab.
    </p>
    <div class="seg2">
      <button class:on={tab === 'new'} onclick={() => (tab = 'new')}>Crear cuenta</button>
      <button class:on={tab === 'login'} onclick={() => (tab = 'login')}>Ya tengo cuenta</button>
    </div>
    <label class="eyebrow" for="acc-name">Nombre de jugador</label>
    <input
      id="acc-name"
      value={name}
      oninput={(e) => {
        name = cleanName((e.target as HTMLInputElement).value);
        (e.target as HTMLInputElement).value = name;
      }}
      maxlength="12"
      autocomplete="username"
      autocapitalize="words"
      spellcheck="false"
      placeholder="Pablo"
    />
    {#if tab === 'login'}
      <label class="eyebrow" for="acc-code">Código de acceso</label>
      <input
        id="acc-code"
        class="code"
        bind:value={code}
        autocomplete="current-password"
        autocapitalize="characters"
        autocorrect="off"
        spellcheck="false"
        placeholder="XXXX-XXXX"
        maxlength="9"
      />
    {:else}
      <p class="hintp">Te daremos un código de acceso para entrar desde otro móvil. Sin contraseñas ni correos.</p>
    {/if}
    {#if account.error}<p class="err">{account.error}</p>{/if}
    <span class="grow"></span>
    {#if tab === 'new'}
      <button class="btn" disabled={name.length < 2 || account.busy} onclick={create}>Crear cuenta</button>
    {:else}
      <button class="btn" disabled={name.length < 2 || code.replace(/[^A-Za-z0-9]/g, '').length < 8 || account.busy} onclick={() => account.login(name, code)}>
        Entrar
      </button>
    {/if}
  {:else if !me}
    <p class="body">{account.error ?? 'Cargando…'}</p>
    {#if account.error}<button class="btn ghost" onclick={() => account.refresh()}>Reintentar</button>{/if}
  {:else}
    <!-- ───── Con cuenta ───── -->
    {#if justCreated && account.code}
      <div class="codecard">
        <span class="eyebrow">Tu código de acceso</span>
        <b class="num">{account.code}</b>
        <p>Apúntalo: con tu nombre y este código entras desde cualquier móvil (también desde el icono de la pantalla de inicio).</p>
        <div class="row2">
          <button class="btn small" onclick={copyCode}>Copiar</button>
          <button class="btn small ghost" onclick={() => (justCreated = false)}>Ya lo tengo</button>
        </div>
      </div>
    {/if}

    <!-- Guerra en marcha -->
    {#each wars as r (r.id)}
      {@const w = live(r)}
      {@const c = colorDef(r.rival.color)}
      <div class="war" style="--c:{c.hex};--i:{c.ink}">
        <span class="wlabel">Guerra en marcha · quedan {timeLeft(w.ends - now)}</span>
        <div class="wtitle">Contra {r.rival.name}</div>
        <p class="wrule">El primero que reciba un dardo paga el kebab.</p>
        {#if w.status === 'claimed' && w.claimedBy === me.id}
          <p class="wnote">Esperando a que {r.rival.name} lo confirme. Si no contesta, cuenta en {timeLeft((w.claimedAt ?? now) + 15 * 60000 - now)}.</p>
        {:else if w.status === 'claimed'}
          <p class="wnote"><b>{r.rival.name} dice que te ha dado.</b></p>
          <div class="row2">
            <button class="btn small danger" disabled={account.busy} onclick={() => account.confirm(w.id, true)}>Es verdad</button>
            <button class="btn small ghost" disabled={account.busy} onclick={() => account.confirm(w.id, false)}>No me dio</button>
          </div>
        {:else}
          <div class="row2">
            <button class="btn small danger" disabled={account.busy} onclick={() => twice(`me${w.id}`, () => account.hit(w.id, 'me'))}>
              {sure === `me${w.id}` ? '¿Seguro? Pagas tú' : 'Me ha dado'}
            </button>
            <button class="btn small win" disabled={account.busy} onclick={() => twice(`them${w.id}`, () => account.hit(w.id, 'them'))}>
              {sure === `them${w.id}` ? 'Toca otra vez' : 'Le he dado'}
            </button>
          </div>
        {/if}
      </div>
    {/each}

    <!-- Notificaciones -->
    {#if account.push !== 'on'}
      <div class="note">
        {#if account.push === 'install'}
          <b>Para recibir los avisos de guerra</b>
          <p>En iPhone, añade la app a la pantalla de inicio: en Safari, botón Compartir › «Añadir a pantalla de inicio». Ábrela desde el icono y entra con tu nombre y tu código.</p>
        {:else if account.push === 'denied'}
          <b>Notificaciones bloqueadas</b>
          <p>{isIOS ? 'Actívalas en Ajustes › Notificaciones › Nerf Arena.' : 'Permítelas en los ajustes del sitio del navegador (candado de la barra de direcciones).'}</p>
        {:else if account.push === 'unsupported'}
          <b>Este navegador no admite notificaciones</b>
          <p>Usa Chrome en Android o la app instalada en iPhone.</p>
        {:else}
          <b>Activa los avisos de guerra</b>
          <p>Si no, no te enterarás de cuándo empieza.</p>
          <button class="btn small" disabled={account.push === 'working'} onclick={() => account.enablePush()}>
            {account.push === 'working' ? 'Activando…' : 'Activar notificaciones'}
          </button>
        {/if}
      </div>
    {/if}

    {#if account.error}<p class="err">{account.error}</p>{/if}

    <!-- Invitaciones recibidas -->
    {#each incoming as r (r.id)}
      <div class="inv">
        <Avatar icon={r.rival.icon} color={r.rival.color} size={34} />
        <span class="grow"><b>{r.rival.name}</b> te declara la rivalidad</span>
        <button class="pill ok" disabled={account.busy} onclick={() => account.rivalry(r.id, 'accept')}>Aceptar</button>
        <button class="pill" disabled={account.busy} onclick={() => account.rivalry(r.id, 'decline')}>No</button>
      </div>
    {/each}

    <!-- Mis rivales -->
    <div class="list">
      {#each active as r (r.id)}
        {@const c = colorDef(r.rival.color)}
        {@const k = r.kebabs}
        <div class="rival" style="--c:{c.hex}">
          <div class="rtop">
            <Avatar icon={r.rival.icon} color={r.rival.color} size={36} />
            <span class="rname">{r.rival.name}</span>
            <span class="score num" title="ganadas · perdidas">{k.won}–{k.lost}</span>
          </div>
          <div class="kb">
            {#if k.theyOwe > 0}
              <span class="plus">Te debe {kebabs(k.theyOwe)}</span>
              <button class="pill ok" disabled={account.busy} onclick={() => account.rivalry(r.id, 'paid')}>Me ha pagado uno</button>
            {:else if k.iOwe > 0}
              <span class="minus">Le debes {kebabs(k.iOwe)}</span>
            {:else}
              <span class="even">En paz{k.draws ? ` · ${k.draws} ${k.draws === 1 ? 'tablas' : 'tablas'}` : ''}</span>
            {/if}
          </div>
          <div class="rfoot">
            <span>{todayText(r)}</span>
            <button class="link tiny" class:danger={sure === `end${r.id}`} onclick={() => twice(`end${r.id}`, () => account.rivalry(r.id, 'end'))}>
              {sure === `end${r.id}` ? 'Toca otra vez para terminarla' : 'Terminar'}
            </button>
          </div>
        </div>
      {/each}
      {#each outgoing as r (r.id)}
        <div class="inv dim">
          <Avatar icon={r.rival.icon} color={r.rival.color} size={30} />
          <span class="grow">Esperando a que <b>{r.rival.name}</b> acepte</span>
          <button class="pill" disabled={account.busy} onclick={() => account.rivalry(r.id, 'end')}>Cancelar</button>
        </div>
      {/each}
      {#if !active.length && !outgoing.length && !incoming.length}
        <p class="body">Aún no tienes rivales. Escribe el nombre de cuenta de tu rival para declararle la rivalidad.</p>
      {/if}
    </div>

    <!-- Declarar rivalidad -->
    <div class="newriv">
      <input
        value={rivalName}
        oninput={(e) => {
          rivalName = cleanName((e.target as HTMLInputElement).value);
          (e.target as HTMLInputElement).value = rivalName;
        }}
        placeholder="Nombre de tu rival"
        maxlength="12"
        autocapitalize="words"
        spellcheck="false"
        onkeydown={(e) => e.key === 'Enter' && rivalName.length >= 2 && account.invite(rivalName).then((ok) => ok && (rivalName = ''))}
      />
      <button class="btn small" disabled={rivalName.length < 2 || account.busy} onclick={() => account.invite(rivalName).then((ok) => ok && (rivalName = ''))}>
        Retar
      </button>
    </div>

    <div class="acc">
      <span>Cuenta: <b>{me.name}</b></span>
      {#if account.code}<button class="link tiny" onclick={() => (showCode = !showCode)}>{showCode ? account.code : 'Ver código'}</button>{/if}
      {#if account.push === 'on'}<button class="link tiny" onclick={() => account.testPush().then((ok) => ok && app.showToast('Notificación enviada'))}>Probar aviso</button>{/if}
      <button class="link tiny" onclick={() => twice('logout', () => account.logout())}>{sure === 'logout' ? '¿Salir?' : 'Salir'}</button>
    </div>
  {/if}
</div>

<style>
  .rv {
    gap: 12px;
  }
  .rv > * {
    flex: none;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h1 {
    font-size: clamp(48px, 9vh, 64px);
  }
  .body b {
    color: var(--paper);
  }
  .grow {
    flex: 1;
  }
  .seg2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    background: var(--bg-2);
    border-radius: 6px;
    padding: 4px;
  }
  .seg2 button {
    appearance: none;
    border: none;
    background: none;
    color: var(--mute);
    font-family: var(--display);
    font-weight: 900;
    font-size: 18px;
    text-transform: uppercase;
    height: 42px;
    border-radius: 4px;
  }
  .seg2 button.on {
    background: var(--me);
    color: var(--me-ink);
  }
  input {
    width: 100%;
    appearance: none;
    border: 2px solid var(--bg-3);
    background: var(--bg-2);
    color: var(--paper);
    border-radius: 6px;
    padding: 12px 14px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 26px;
    text-transform: uppercase;
    user-select: text;
    -webkit-user-select: text;
  }
  input:focus {
    outline: none;
    border-color: var(--me);
  }
  input.code {
    letter-spacing: 0.12em;
  }
  .hintp {
    margin: 0;
    font-size: 13px;
    color: var(--mute);
  }
  .err {
    margin: 0;
    color: var(--danger);
    font-weight: 700;
    font-size: 14px;
  }
  .codecard {
    background: var(--paper);
    color: var(--bg);
    border-radius: 8px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .codecard .eyebrow {
    color: #5a5752;
  }
  .codecard b {
    font-size: 54px;
    letter-spacing: 0.08em;
    line-height: 1;
  }
  .codecard p {
    margin: 0;
    font-size: 13px;
    line-height: 1.4;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .war {
    background: var(--c);
    color: var(--i);
    padding: 14px;
    clip-path: polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      filter: brightness(1.12);
    }
  }
  .wlabel {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .wtitle {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(40px, 8vh, 60px);
    text-transform: uppercase;
    line-height: 0.85;
  }
  .wrule,
  .wnote {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .war .btn.danger {
    background: #0d0d0d;
    color: #fff;
  }
  .war .btn.win {
    background: var(--i);
    color: var(--c);
  }
  .war .btn.ghost {
    background: rgba(0, 0, 0, 0.18);
    color: var(--i);
  }
  .note {
    background: var(--bg-2);
    border-radius: 6px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: inset 4px 0 0 var(--warn);
  }
  .note b {
    font-family: var(--display);
    font-weight: 900;
    font-size: 20px;
    text-transform: uppercase;
  }
  .note p {
    margin: 0;
    font-size: 13px;
    color: var(--mute);
    line-height: 1.4;
  }
  .inv {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--bg-2);
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 14px;
  }
  .inv.dim {
    opacity: 0.7;
  }
  .pill {
    appearance: none;
    border: none;
    background: var(--bg-3);
    color: var(--paper);
    font-family: var(--display);
    font-weight: 900;
    font-size: 15px;
    text-transform: uppercase;
    padding: 7px 12px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .pill.ok {
    background: var(--ok);
    color: #06140d;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .rival {
    background: var(--bg-2);
    border-radius: 6px;
    padding: 10px 12px;
    box-shadow: inset 4px 0 0 var(--c);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rtop {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .rname {
    flex: 1;
    font-family: var(--display);
    font-weight: 900;
    font-size: 28px;
    text-transform: uppercase;
    line-height: 1;
    color: var(--c);
  }
  .score {
    font-size: 30px;
  }
  .kb {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 20px;
    text-transform: uppercase;
  }
  .plus {
    color: var(--ok);
  }
  .minus {
    color: var(--danger);
  }
  .even {
    color: var(--mute);
  }
  .rfoot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--mute);
  }
  .tiny {
    font-size: 12px;
    padding: 4px 0;
  }
  .tiny.danger {
    color: var(--danger);
  }
  .newriv {
    display: flex;
    gap: 8px;
  }
  .newriv input {
    flex: 1;
    min-width: 0;
    font-size: 20px;
    padding: 8px 12px;
  }
  .newriv .btn {
    width: auto;
  }
  .acc {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 14px;
    font-size: 13px;
    color: var(--mute);
    padding-bottom: 8px;
  }
  .acc b {
    color: var(--paper);
  }
</style>
