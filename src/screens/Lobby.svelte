<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { app } from '../lib/app.svelte';
  import { MODES } from '../lib/modes';
  import { nameIssue } from '../lib/names';
  import { colorDef } from '../lib/types';
  import { sfx } from '../lib/audio/sfx';
  import { voice } from '../lib/voice/recognizer.svelte';
  import QR from '../components/QR.svelte';
  import Avatar from '../components/Avatar.svelte';
  import ModeIcon from '../components/ModeIcon.svelte';
  import NetSheet from '../components/NetSheet.svelte';

  const s = app.session!;
  const room = $derived(s.room!);
  const me = $derived(app.me);
  const opp = $derived(app.opp);
  const joinUrl = $derived(`${location.origin}${location.pathname}?sala=${room.code}`);
  const clash = $derived(me && opp ? nameIssue(me.name, opp.name) : null);
  const blocked = $derived(!opp?.connected || clash?.level === 'error');
  const waiting = $derived(s.kind === 'host' && !opp?.connected);
  let showQR = $state(false);
  let net = $state(false);
  const qrOpen = $derived(waiting || showQR);

  const mc = $derived(colorDef(me?.color ?? 'naranja'));
  const oc = $derived(colorDef(opp?.color ?? 'azul'));

  function pick(id: (typeof MODES)[number]['id'], available: boolean) {
    if (!available) {
      sfx.error();
      app.showToast('Este modo llegará pronto', 1500);
      return;
    }
    if (blocked) return;
    sfx.click();
    app.unlock();
    s.send({ t: 'selectMode', mode: id });
  }
</script>

<div class="screen lobby">
  <!-- Barra superior -->
  <div class="top">
    <button class="chip" onclick={() => (showQR = true)} disabled={s.kind !== 'host'}>
      <span class="k">{s.kind === 'solo' ? 'Prueba' : s.kind === 'local' ? 'Un móvil para los dos' : 'Sala'}</span>
      {#if s.kind === 'host' || s.kind === 'guest'}<span class="code num">{room.code}</span>{/if}
    </button>
    {#if s.kind === 'host' || s.kind === 'guest'}
      <button class="net" class:ok={s.route === 'direct'} class:mid={s.route === 'relay'} onclick={() => (net = true)}>
        <i></i>{s.route === 'direct' ? 'Directa' : s.route === 'relay' ? 'Por servidor' : s.status === 'online' ? 'Esperando' : 'Conectando'}
      </button>
    {/if}
    <span class="grow"></span>
    <button class="link" onclick={() => app.leave()}>Salir</button>
  </div>

  <!-- VS -->
  <div class="vs">
    <button class="side left" style="--c:{mc.hex};--i:{mc.ink}" onclick={() => app.editProfile()}>
      {#if me}
        <Avatar icon={me.icon} color={me.color} size={44} />
        <span class="pname">{me.name}</span>
        <span class="wins num">{room.wins[me.id] ?? 0}</span>
      {/if}
    </button>
    <div class="badge">VS</div>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="side right" class:empty={!opp} onclick={() => s.kind === 'local' && app.editProfile2()} style="--c:{opp ? oc.hex : 'var(--bg-2)'};--i:{opp ? oc.ink : 'var(--mute)'}">
      {#if opp}
        <Avatar icon={opp.icon} color={opp.color} size={44} />
        <span class="pname">{opp.name}</span>
        <span class="wins num">{room.wins[opp.id] ?? 0}</span>
        {#if !opp.connected}<span class="off">Sin conexión</span>{/if}
      {:else}
        <span class="pname">¿?</span>
      {/if}
    </div>
  </div>

  {#if clash && opp}
    <p class="clash" class:err={clash.level === 'error'}>
      {clash.msg} <button class="link" onclick={() => app.editProfile()}>Cambiar nombre</button>
    </p>
  {/if}

  <!-- Modos -->
  <div class="label">Elige modo</div>
  <div class="grid stagger">
    {#each MODES as m}
      <button
        class="card-mode"
        class:locked={!m.available}
        class:off={m.available && blocked}
        style="--mc:{m.color}"
        onclick={() => pick(m.id, m.available)}
      >
        <span class="art"><ModeIcon d={m.icon} size={120} stroke={3} /></span>
        <span class="mname">{m.name}</span>
        <span class="mtag">{m.available ? m.tag : 'Pronto'}</span>
        {#if !m.available}
          <svg class="lock" viewBox="0 0 24 24"><path d="M7 11V8a5 5 0 0 1 10 0v3h1v10H6V11zm2 0h6V8a3 3 0 0 0-6 0z" /></svg>
        {/if}
      </button>
    {/each}
  </div>

  <div class="foot">
    <button class="link" onclick={() => app.editProfile()}>Perfil</button>
    <button
      class="recbtn"
      class:on={app.prefs.recordingMode}
      onclick={() => {
        app.prefs.recordingMode = !app.prefs.recordingMode;
        app.savePrefs();
        app.showToast(app.prefs.recordingMode ? 'Modo grabación: la partida solo muestra lo que aporta en vídeo' : 'Modo grabación desactivado', 2600);
      }}><i></i>Modo grabación</button
    >
    <button
      class="link"
      onclick={() => {
        app.voiceTestThen = null;
        voice.start();
        app.screen = 'voicetest';
      }}>Probar voz</button
    >
  </div>
</div>

<!-- Esperando rival: código y QR a pantalla completa -->
{#if qrOpen && s.kind === 'host'}
  <div class="sheet" transition:fade={{ duration: 150 }}>
    <div class="card" in:fly={{ y: 40, duration: 260 }}>
      <span class="eyebrow">{waiting ? 'Esperando rival' : 'Código de sala'}</span>
      <div class="bigcode num">{room.code}</div>
      <div class="qrbox"><QR text={joinUrl} size={200} /></div>
      <p>Que tu rival lo escanee con la cámara o escriba el código en «Unirse».</p>
      <p class="tip">Consejo: auricular con micro y el brillo alto.</p>
      {#if s.error}<p class="warn">{s.error}</p>{/if}
      {#if waiting}
        <div class="scan"><i></i></div>
        <button class="link" onclick={() => app.leave()}>Cancelar</button>
      {:else}
        <button class="btn small" onclick={() => (showQR = false)}>Cerrar</button>
      {/if}
    </div>
  </div>
{/if}

{#if net}
  <NetSheet onclose={() => (net = false)} />
{/if}

<style>
  .lobby {
    gap: clamp(8px, 1.6vh, 14px);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .grow {
    flex: 1;
  }
  .chip {
    appearance: none;
    border: none;
    background: var(--bg-2);
    color: var(--paper);
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 4px;
  }
  .chip .k {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--mute);
  }
  .chip .code {
    font-size: 26px;
    letter-spacing: 0.08em;
    line-height: 1;
  }
  .net {
    appearance: none;
    border: none;
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-2);
    color: var(--paper);
    font-family: var(--body);
    font-weight: 700;
    font-size: 12px;
    padding: 7px 10px;
    border-radius: 999px;
  }
  .net i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--mute);
    animation: blink 1s infinite;
  }
  .net.ok i {
    background: var(--ok);
    animation: none;
  }
  .net.mid i {
    background: var(--warn);
    animation: none;
  }

  /* VS */
  .vs {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: clamp(104px, 17vh, 150px);
    flex: none;
  }
  .side {
    appearance: none;
    border: none;
    position: relative;
    background: var(--c);
    color: var(--i);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 4px;
    padding: 12px;
    text-align: left;
    overflow: hidden;
    min-width: 0;
  }
  .left {
    clip-path: polygon(0 0, 100% 0, 88% 100%, 0 100%);
    padding-right: 22%;
    animation: from-left 0.4s 0.1s cubic-bezier(0.2, 0.9, 0.2, 1) both;
  }
  .right {
    clip-path: polygon(12% 0, 100% 0, 100% 100%, 0 100%);
    align-items: flex-end;
    text-align: right;
    padding-left: 22%;
    margin-left: -12%;
    animation: from-right 0.4s 0.1s cubic-bezier(0.2, 0.9, 0.2, 1) both;
  }
  .right.empty {
    animation:
      from-right 0.4s 0.1s cubic-bezier(0.2, 0.9, 0.2, 1) both,
      blink 1.4s 0.5s infinite;
  }
  @keyframes from-left {
    from {
      transform: translateX(-100%);
    }
  }
  @keyframes from-right {
    from {
      transform: translateX(100%);
    }
  }
  .side :global(.av) {
    position: absolute;
    top: 12px;
    background: var(--i) !important;
  }
  .side :global(.av svg) {
    fill: var(--c) !important;
  }
  .right :global(.av) {
    right: 12px;
  }
  .pname {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(26px, 4.4vh, 38px);
    text-transform: uppercase;
    line-height: 0.9;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wins {
    position: absolute;
    top: 6px;
    font-size: clamp(40px, 7vh, 62px);
    line-height: 1;
    opacity: 0.9;
  }
  .left .wins {
    right: 24%;
  }
  .right .wins {
    left: 24%;
  }
  .off {
    font-size: 11px;
    font-weight: 700;
  }
  .badge {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) skewX(-10deg);
    background: var(--paper);
    color: var(--bg);
    font-family: var(--display);
    font-weight: 900;
    font-size: 30px;
    padding: 2px 12px;
    z-index: 2;
    animation: pop 0.3s 0.45s both;
  }
  .clash {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--warn);
  }
  .clash.err {
    color: var(--danger);
  }
  .clash .link {
    padding: 0;
    color: var(--paper);
    text-decoration: underline;
    font-size: 13px;
  }

  /* Modos */
  .label {
    font-family: var(--display);
    font-weight: 900;
    font-size: 22px;
    text-transform: uppercase;
    line-height: 1;
  }
  .grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: 1fr 1fr;
    gap: 6px;
  }
  /* Ficha vertical: color del modo, icono gigante de fondo, nombre al centro y franja inferior */
  .card-mode {
    appearance: none;
    border: none;
    position: relative;
    overflow: hidden;
    min-height: 0;
    border-radius: 4px;
    padding: 0;
    color: #fff;
    background:
      repeating-linear-gradient(-55deg, rgba(255, 255, 255, 0.05) 0 2px, transparent 2px 9px),
      linear-gradient(160deg, color-mix(in srgb, var(--mc) 85%, #000) 0%, color-mix(in srgb, var(--mc) 35%, #0d0d0d) 70%, #0d0d0d 100%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    transition: transform 0.1s, filter 0.15s;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  .card-mode:not(.locked):active {
    transform: scale(0.95);
    filter: brightness(1.2);
  }
  .card-mode.off {
    opacity: 0.45;
  }
  .art {
    position: absolute;
    left: 50%;
    top: 38%;
    transform: translate(-50%, -50%) rotate(-8deg);
    color: #fff;
    opacity: 0.16;
    pointer-events: none;
  }
  .art :global(svg) {
    width: clamp(80px, 15vh, 130px);
    height: clamp(80px, 15vh, 130px);
  }
  .mname {
    position: relative;
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(22px, 3.6vh, 32px);
    text-transform: uppercase;
    line-height: 0.9;
    padding: 0 6px;
    margin-bottom: 18%;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
    overflow-wrap: anywhere;
  }
  .mtag {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 6px 6px 7px;
    background: rgba(0, 0, 0, 0.55);
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: rgba(255, 255, 255, 0.85);
  }
  .locked {
    filter: grayscale(1) brightness(0.55);
  }
  .lock {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 16px;
    fill: #fff;
    opacity: 0.8;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .recbtn {
    appearance: none;
    border: none;
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-2);
    color: var(--mute);
    font-family: var(--body);
    font-weight: 700;
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 999px;
  }
  .recbtn i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--mute);
  }
  .recbtn.on {
    color: var(--paper);
    background: #3a0608;
  }
  .recbtn.on i {
    background: var(--danger);
    animation: blink 1s infinite;
  }
  .foot .link {
    padding: 4px 0;
  }

  /* Espera / QR */
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 120;
    background: rgba(10, 10, 10, 0.92);
    display: grid;
    place-items: center;
    padding: 18px;
  }
  .card {
    width: 100%;
    max-width: 380px;
    background: var(--bg-2);
    border-radius: 8px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
  }
  .bigcode {
    font-size: clamp(64px, 11vh, 96px);
    letter-spacing: 0.08em;
    line-height: 0.85;
    color: var(--me);
  }
  .qrbox {
    background: var(--paper);
    padding: 8px;
    border-radius: 6px;
    line-height: 0;
  }
  .qrbox :global(svg) {
    width: clamp(140px, 26vh, 200px);
    height: auto;
  }
  .card p {
    margin: 0;
    font-size: 14px;
    color: var(--mute);
    max-width: 30ch;
  }
  .card .tip {
    font-size: 12px;
  }
  .warn {
    color: var(--warn) !important;
  }
  .scan {
    width: 70%;
    height: 4px;
    background: var(--bg-3);
    overflow: hidden;
  }
  .scan i {
    display: block;
    width: 30%;
    height: 100%;
    background: var(--me);
    animation: scan 1.1s ease-in-out infinite alternate;
  }
  @keyframes scan {
    to {
      transform: translateX(233%);
    }
  }
</style>
