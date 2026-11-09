<script lang="ts">
  import { onDestroy } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { voice, speechSupported, voiceDiagnostics } from '../lib/voice/recognizer.svelte';
  import { ALL_COMMANDS, learnAlias, normalize } from '../lib/voice/matcher';
  import { callsignOf } from '../lib/types';
  import { sfx, vibrate } from '../lib/audio/sfx';
  import { say } from '../lib/audio/narrator';
  import NarratorPicker from '../components/NarratorPicker.svelte';

  const profile = app.prefs.profile!;
  const name = app.me?.name ?? profile.name;
  let ok = $state(false);
  let learned = $state<string | null>(null);

  function setup() {
    voice.callsign = callsignOf(app.me ?? profile);
    voice.others = app.opp ? [callsignOf(app.opp)] : [];
    voice.allowed = ALL_COMMANDS;
  }
  setup();

  function success() {
    if (ok) return;
    ok = true;
    sfx.confirm();
    vibrate(60);
    say('Te recibo alto y claro.');
    setTimeout(() => app.voiceTestDone(true), learned ? 3200 : 1800);
  }

  voice.onCommand = (c) => {
    if (c === 'estado') success();
  };

  // Calibración: si el móvil escribe tu nombre de otra forma, se aprende
  voice.onFinal = (text) => {
    if (ok) return;
    const alias = learnAlias(text);
    if (!alias || alias === normalize(name)) return;
    const p = app.prefs.profile!;
    if (!p.aliases.includes(alias)) p.aliases = [...p.aliases, alias].slice(-4);
    app.savePrefs();
    app.session?.send({ t: 'profile', profile: app.profile()! });
    setup();
    learned = alias;
    success();
  };

  onDestroy(() => {
    voice.onFinal = null;
  });

  const needsTap = $derived(voice.state === 'off' || voice.state === 'tap');
  const blocked = $derived(voice.state === 'denied' || voice.state === 'unavailable' || voice.state === 'unsupported');
</script>

<div class="screen vt">
  <div class="head">
    <span class="eyebrow">Prueba de voz</span>
  </div>

  <div class="mid">
    <div class="meter" class:ok class:idle={voice.state !== 'listening'}>
      {#each Array(12) as _, k}
        <i style="height:{8 + Math.max(0, Math.min(1, voice.level * 1.6 - k / 14)) * 90}px"></i>
      {/each}
    </div>

    {#if !speechSupported}
      <h1 class="display">Este navegador no reconoce voz</h1>
      <p class="body">Puedes jugar igual: doble toque = tocado, mantener pulsado = anular.</p>
    {:else if blocked}
      <h1 class="display">{voice.state === 'denied' ? 'Micro bloqueado' : 'Voz no disponible'}</h1>
      <p class="body">{voice.errorMsg}</p>
      <button class="btn small" onclick={() => voice.start()}>Reintentar</button>
    {:else if voice.state === 'loading'}
      <h1 class="display">Preparando la voz</h1>
      <p class="body">Descargando el reconocedor propio (solo la primera vez).</p>
      <div class="dl"><i style="width:{Math.round(voice.progress * 100)}%"></i></div>
      <p class="pct num">{Math.round(voice.progress * 100)}%</p>
    {:else if ok}
      <h1 class="display good">Te oigo</h1>
      {#if learned}
        <p class="body">Tu móvil escribe tu nombre como «{learned}». Lo he aprendido para reconocerte mejor.</p>
      {/if}
    {:else if needsTap}
      <h1 class="display">Activa el micro</h1>
      <p class="body">{voice.errorMsg ?? 'Safari pide que lo actives con un toque. Si te pregunta, pulsa «Permitir».'}</p>
      <button class="btn" onclick={() => voice.start()}>Activar micro</button>
    {:else}
      <span class="eyebrow">{voice.state === 'starting' ? 'Arrancando…' : 'Di en voz alta'}</span>
      <h1 class="display say">{name},<br />estado</h1>
      <p class="heard">
        {#if voice.heard}«{voice.heard.text}»{:else}Escuchando…{/if}
      </p>
      {#if voice.errorMsg}<p class="body small warn">{voice.errorMsg}</p>{/if}
    {/if}
  </div>

  <div class="foot">
    <NarratorPicker />
    {#if speechSupported}
      <button
        class="link engine"
        onclick={() => voice.useEngine(voice.engine === 'web' ? 'vosk' : 'web')}
      >
        Motor: {voice.engine === 'web' ? 'el del móvil' : 'propio de la app'} · cambiar
      </button>
    {/if}
    <div class="diag">
      <b>{voiceDiagnostics()}</b>
      {#each voice.log as l}<span>{l}</span>{/each}
    </div>
    <button class="btn ghost" onclick={() => app.voiceTestDone(false)}>
      {speechSupported && !blocked ? 'Saltar' : 'Seguir sin voz'}
    </button>
  </div>
</div>

<style>
  .vt {
    justify-content: space-between;
  }
  .mid {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .meter {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 100px;
    margin-bottom: 10px;
  }
  .meter i {
    width: 14px;
    background: var(--me);
    transform: skewX(-12deg);
    transition: height 0.08s linear;
  }
  .meter.idle i {
    background: var(--bg-3);
  }
  .meter.ok i {
    background: var(--ok);
  }
  h1 {
    font-size: 64px;
  }
  .say {
    font-size: 96px;
    color: var(--me);
  }
  .good {
    color: var(--ok);
    font-size: 110px;
  }
  .heard {
    margin: 0;
    font-size: 16px;
    color: var(--mute);
    min-height: 22px;
  }
  .small {
    font-size: 13px;
  }
  .warn {
    color: var(--warn);
  }
  .mid .btn {
    align-self: flex-start;
    width: auto;
  }
  .foot {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .engine {
    align-self: flex-start;
    padding: 0;
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .dl {
    height: 10px;
    background: var(--bg-3);
    transform: skewX(-20deg);
    overflow: hidden;
  }
  .dl i {
    display: block;
    height: 100%;
    background: var(--me);
    transition: width 0.2s;
  }
  .pct {
    margin: 0;
    font-size: 40px;
    color: var(--me);
  }
  .diag {
    display: flex;
    flex-direction: column;
    font-size: 10.5px;
    line-height: 1.35;
    color: var(--mute);
    max-height: 22vh;
    overflow: hidden;
    justify-content: flex-end;
  }
  .diag b {
    font-weight: 700;
    color: var(--paper);
    opacity: 0.8;
  }
</style>
