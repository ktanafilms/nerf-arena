<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { modeInfo } from '../lib/modes';
  import { configFor } from '../lib/engine/room';
  import type { DuelConfig } from '../lib/types';
  import { callsignLabel } from '../lib/types';
  import { sfx } from '../lib/audio/sfx';

  const s = app.session!;
  const room = $derived(s.room!);
  const info = $derived(modeInfo(room.mode));
  const cfg = $derived(configFor(room) as DuelConfig);
  const iAmReady = $derived(!!room.ready[s.me]);
  const oppReady = $derived(!!(app.opp && room.ready[app.opp.id]));
  let more = $state(false);

  function set(patch: Partial<DuelConfig>) {
    sfx.click();
    const next = { ...cfg, ...patch };
    // Las dos variantes de dardos son excluyentes entre sí? No: se pueden combinar.
    s.send({ t: 'config', mode: room.mode, config: next });
  }

  const times = [
    { v: 180, l: '3 min' },
    { v: 300, l: '5 min' },
    { v: 600, l: '10 min' },
    { v: 0, l: '∞' },
  ];
</script>

<div class="screen modescreen">
  <div class="head">
    <button class="link" onclick={() => s.send({ t: 'toLobby' })}>‹ Modos</button>
    <span class="label">{info.category} // {info.code}</span>
  </div>

  <h1 class="title">{info.name}</h1>
  <p class="summary">{info.summary}</p>
  <button class="link more" onclick={() => (more = !more)}>{more ? '− Ocultar' : '+ Ver más'}</button>
  {#if more}
    <ul class="details">
      {#each info.details as d}<li>{d}</li>{/each}
    </ul>
  {/if}

  <div class="opts">
    <div class="switch">
      <span>Tiempo límite<small>Si se acaba, gana quien tenga más vidas</small></span>
      <div class="seg">
        {#each times as t}
          <button class:on={cfg.timeLimitSec === t.v} onclick={() => set({ timeLimitSec: t.v })}>{t.l}</button>
        {/each}
      </div>
    </div>
    <button class="switch asbtn" onclick={() => set({ oneInChamber: !cfg.oneInChamber })}>
      <span>Una en la recámara<small>Empezáis con 1 dardo. Si fallas, ve a por él.</small></span>
      <span class="toggle" class:on={cfg.oneInChamber}></span>
    </button>
    <button class="switch asbtn" onclick={() => set({ confirmedKill: !cfg.confirmedKill })}>
      <span>Baja confirmada<small>Solo cuenta si el tirador recoge su dardo. 10 s para anular.</small></span>
      <span class="toggle" class:on={cfg.confirmedKill}></span>
    </button>
  </div>

  <div class="grow"></div>

  <div class="readyrow">
    <span class:ok={iAmReady}>{iAmReady ? '■' : '□'} {callsignLabel(app.me?.callsign ?? '')}</span>
    <span class:ok={oppReady}>{oppReady ? '■' : '□'} {callsignLabel(app.opp?.callsign ?? '')}</span>
  </div>
  <button class="btn ready" class:ghost={iAmReady} onclick={() => app.ready(!iAmReady)}>
    {iAmReady ? (oppReady ? '¡Vamos!' : 'Esperando rival… (cancelar)') : '¡Listo!'}
  </button>
</div>

<style>
  .modescreen {
    gap: 10px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .head .link {
    padding-left: 0;
  }
  .title {
    font-size: 78px;
    color: var(--me);
    text-shadow: 0 0 28px color-mix(in srgb, var(--me) 55%, transparent);
  }
  .summary {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.1;
    margin: 0;
  }
  .more {
    align-self: flex-start;
    padding-left: 0;
  }
  .details {
    margin: 0;
    padding-left: 18px;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--dim);
    line-height: 1.6;
  }
  .opts {
    margin-top: 6px;
  }
  .asbtn {
    width: 100%;
    appearance: none;
    background: none;
    border: none;
    border-bottom: 1px solid var(--line);
    color: var(--text);
    font-family: var(--display);
    text-align: left;
  }
  .seg {
    display: flex;
    flex: none;
  }
  .seg button {
    appearance: none;
    border: 1px solid var(--line2);
    background: none;
    color: var(--dim);
    font-family: var(--mono);
    font-size: 12px;
    padding: 8px 8px;
    margin-left: -1px;
  }
  .seg button.on {
    background: var(--me);
    color: var(--bg);
    border-color: var(--me);
  }
  .grow {
    flex: 1;
  }
  .readyrow {
    display: flex;
    justify-content: space-between;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--dim);
    text-transform: uppercase;
  }
  .readyrow .ok {
    color: var(--ok);
  }
  .ready {
    min-height: 84px;
    font-size: 36px;
  }
  .ready.ghost {
    font-size: 22px;
  }
</style>
