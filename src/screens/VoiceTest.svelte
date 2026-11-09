<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { voice, speechSupported } from '../lib/voice/recognizer.svelte';
  import { ALL_COMMANDS } from '../lib/voice/matcher';
  import { callsignLabel } from '../lib/types';
  import { sfx, vibrate } from '../lib/audio/sfx';
  import { say } from '../lib/audio/narrator';
  import { isIOS, isStandalone } from '../lib/device';
  import MicIndicator from '../components/MicIndicator.svelte';

  const cs = app.me?.callsign ?? app.prefs.profile?.callsign ?? 'lobo';
  let ok = $state(false);

  voice.callsign = cs;
  voice.others = app.opp ? [app.opp.callsign] : [];
  voice.allowed = ALL_COMMANDS;
  voice.onCommand = (c) => {
    if (c === 'estado' && !ok) {
      ok = true;
      sfx.confirm();
      vibrate(60);
      say('Te recibo alto y claro.');
      setTimeout(() => app.voiceTestDone(true), 1800);
    }
  };
  if (voice.state === 'off') voice.start();
</script>

<div class="screen vt">
  <div class="head">
    <span class="label">PRUEBA DE VOZ</span>
    <MicIndicator showText={false} />
  </div>

  <div class="mid">
    <div class="ring" class:ok>
      <svg viewBox="0 0 100 100"><rect x="38" y="16" width="24" height="44" rx="12" /><path d="M26 48c0 14 10 24 24 24s24-10 24-24M50 72v14" /></svg>
      <span class="pulse" style="transform:scale({1 + voice.level * 0.6})"></span>
    </div>
    {#if !speechSupported}
      <h1>Este navegador no tiene reconocimiento de voz</h1>
      <p>Puedes jugar con el plan B táctil: doble toque = tocado, mantener = anular.</p>
    {:else if voice.state === 'denied'}
      <h1>Micrófono bloqueado</h1>
      <p>{voice.errorMsg} Revisa los permisos del navegador y vuelve a intentarlo.</p>
    {:else if ok}
      <h1 class="good">¡Te entiendo!</h1>
    {:else}
      <span class="label">Di en voz alta</span>
      <h1 class="say">«{callsignLabel(cs)}, estado»</h1>
      <div class="heard">
        {#if voice.heard}«{voice.heard.text}»{:else}Escuchando…{/if}
      </div>
      {#if isIOS && isStandalone}
        <p class="small">En iPhone, si no te oye desde la app instalada, ábrela en Safari.</p>
      {/if}
      {#if voice.errorMsg}<p class="small warn">{voice.errorMsg}</p>{/if}
    {/if}
  </div>

  <div class="foot">
    <button class="btn ghost" onclick={() => app.voiceTestDone(false)}>
      {speechSupported && voice.state !== 'denied' ? 'Saltar' : 'Continuar sin voz'}
    </button>
  </div>
</div>

<style>
  .vt {
    justify-content: space-between;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .mid {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 14px;
  }
  .ring {
    position: relative;
    width: 150px;
    height: 150px;
    display: grid;
    place-items: center;
  }
  .ring svg {
    width: 90px;
    fill: none;
    stroke: var(--me);
    stroke-width: 4;
    z-index: 1;
  }
  .pulse {
    position: absolute;
    inset: 0;
    border: 2px solid var(--me);
    border-radius: 50%;
    box-shadow: 0 0 30px color-mix(in srgb, var(--me) 50%, transparent);
    transition: transform 0.08s;
  }
  .ring.ok .pulse {
    border-color: var(--ok);
    background: color-mix(in srgb, var(--ok) 15%, transparent);
  }
  h1 {
    font-size: 40px;
  }
  .say {
    font-size: 56px;
    color: var(--me);
  }
  .good {
    color: var(--ok);
    font-size: 64px;
  }
  .heard {
    font-family: var(--mono);
    font-size: 14px;
    color: var(--dim);
    min-height: 20px;
  }
  p {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--dim);
    max-width: 320px;
    line-height: 1.5;
  }
  .small {
    font-size: 11px;
  }
  .warn {
    color: var(--warn);
  }
</style>
