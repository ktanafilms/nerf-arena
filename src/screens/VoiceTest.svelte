<script lang="ts">
  import { onDestroy } from 'svelte';
  import { app } from '../lib/app.svelte';
  import { voice, speechSupported } from '../lib/voice/recognizer.svelte';
  import { ALL_COMMANDS, learnAlias, normalize } from '../lib/voice/matcher';
  import { callsignOf } from '../lib/types';
  import { sfx, vibrate } from '../lib/audio/sfx';
  import { say } from '../lib/audio/narrator';
  import { isIOS, isStandalone } from '../lib/device';

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

  if (voice.state === 'off') voice.start();
</script>

<div class="screen vt">
  <div class="head">
    <span class="eyebrow">Prueba de voz</span>
  </div>

  <div class="mid">
    <div class="meter" class:ok>
      {#each Array(12) as _, k}
        <i style="height:{8 + Math.max(0, Math.min(1, voice.level * 1.6 - k / 14)) * 90}px"></i>
      {/each}
    </div>

    {#if !speechSupported}
      <h1 class="display">Este navegador no reconoce voz</h1>
      <p class="body">Puedes jugar igual: doble toque = tocado, mantener pulsado = anular.</p>
    {:else if voice.state === 'denied'}
      <h1 class="display">Micrófono bloqueado</h1>
      <p class="body">{voice.errorMsg} Revisa los permisos del navegador y vuelve a intentarlo.</p>
    {:else if ok}
      <h1 class="display good">Te oigo</h1>
      {#if learned}
        <p class="body">Tu móvil escribe tu nombre como «{learned}». Lo he aprendido para reconocerte mejor.</p>
      {/if}
    {:else}
      <span class="eyebrow">Di en voz alta</span>
      <h1 class="display say">{name},<br />estado</h1>
      <p class="heard">
        {#if voice.heard}«{voice.heard.text}»{:else}Escuchando…{/if}
      </p>
      {#if isIOS && isStandalone}
        <p class="body small">Si en iPhone no te oye desde la app instalada, ábrela en Safari.</p>
      {/if}
      {#if voice.errorMsg}<p class="body small warn">{voice.errorMsg}</p>{/if}
    {/if}
  </div>

  <button class="btn ghost" onclick={() => app.voiceTestDone(false)}>
    {speechSupported && voice.state !== 'denied' ? 'Saltar' : 'Seguir sin voz'}
  </button>
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
</style>
