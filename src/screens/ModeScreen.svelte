<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { modeInfo } from '../lib/modes';
  import { configFor } from '../lib/engine/room';
  import type { DuelConfig } from '../lib/types';
  import { sfx } from '../lib/audio/sfx';
  import Avatar from '../components/Avatar.svelte';

  const s = app.session!;
  const room = $derived(s.room!);
  const info = $derived(modeInfo(room.mode));
  const cfg = $derived(configFor(room) as DuelConfig);
  const iAmReady = $derived(!!room.ready[s.me]);
  const oppReady = $derived(!!(app.opp && room.ready[app.opp.id]));
  let more = $state(false);

  function set(patch: Partial<DuelConfig>) {
    sfx.click();
    s.send({ t: 'config', mode: room.mode, config: { ...cfg, ...patch } });
  }

  const times = [
    { v: 180, l: '3′' },
    { v: 300, l: '5′' },
    { v: 600, l: '10′' },
    { v: 0, l: '∞' },
  ];
</script>

<div class="screen modescreen">
  <div class="head">
    <button class="link" onclick={() => s.send({ t: 'toLobby' })}>← Modos</button>
    <span class="eyebrow">{info.category.toLowerCase()}</span>
  </div>

  <div class="intro stagger">
    <h1 class="display">{info.name}</h1>
    <p class="summary">{info.summary}</p>
    <button class="link more" onclick={() => (more = !more)}>{more ? 'Ocultar reglas' : 'Ver reglas completas'}</button>
    {#if more}
      <ol class="details">
        {#each info.details as d}<li>{d}</li>{/each}
      </ol>
    {/if}
  </div>

  <div class="opts">
    <div class="row-set">
      <span><b>Tiempo</b><small>Al acabar gana quien tenga más vidas</small></span>
      <div class="seg">
        {#each times as t}
          <button class:on={cfg.timeLimitSec === t.v} onclick={() => set({ timeLimitSec: t.v })}>{t.l}</button>
        {/each}
      </div>
    </div>
    <button class="row-set" onclick={() => set({ oneInChamber: !cfg.oneInChamber })}>
      <span><b>Una en la recámara</b><small>Un solo dardo. Si fallas, ve a por él.</small></span>
      <span class="toggle" class:on={cfg.oneInChamber}></span>
    </button>
    <button class="row-set" onclick={() => set({ confirmedKill: !cfg.confirmedKill })}>
      <span><b>Baja confirmada</b><small>Solo cuenta si el tirador recoge su dardo. 10 s para anular.</small></span>
      <span class="toggle" class:on={cfg.confirmedKill}></span>
    </button>
  </div>

  <div class="grow"></div>

  <div class="readyrow">
    {#each [app.me, app.opp] as p}
      {#if p}
        <span class="rp" class:ok={room.ready[p.id]}>
          <Avatar icon={p.icon} color={p.color} size={26} />
          {p.name}
          <i>{room.ready[p.id] ? 'listo' : '…'}</i>
        </span>
      {/if}
    {/each}
  </div>
  <button class="btn ready" class:ghost={iAmReady} onclick={() => app.ready(!iAmReady)}>
    {iAmReady ? (oppReady ? '¡Vamos!' : 'Esperando… (cancelar)') : '¡Listo!'}
  </button>
</div>

<style>
  .modescreen {
    gap: 14px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .intro {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h1 {
    font-size: 104px;
    color: var(--me);
  }
  .summary {
    font-size: 21px;
    font-weight: 600;
    line-height: 1.25;
    margin: 0;
    max-width: 26ch;
  }
  .more {
    align-self: flex-start;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .details {
    margin: 0;
    padding-left: 20px;
    font-size: 14px;
    color: var(--mute);
    line-height: 1.55;
  }
  .opts {
    margin-top: 8px;
  }
  .seg {
    display: flex;
    flex: none;
    background: var(--bg-2);
    border-radius: 4px;
    padding: 3px;
  }
  .seg button {
    appearance: none;
    border: none;
    background: none;
    color: var(--mute);
    font-family: var(--display);
    font-weight: 800;
    font-size: 20px;
    min-width: 42px;
    padding: 6px 6px;
    border-radius: 3px;
  }
  .seg button.on {
    background: var(--me);
    color: var(--me-ink);
  }
  .grow {
    flex: 1;
  }
  .readyrow {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .rp {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--display);
    font-weight: 800;
    font-size: 20px;
    text-transform: uppercase;
    opacity: 0.5;
  }
  .rp i {
    font-family: var(--body);
    font-style: normal;
    font-size: 12px;
    font-weight: 600;
    text-transform: none;
    color: var(--mute);
  }
  .rp.ok {
    opacity: 1;
  }
  .rp.ok i {
    color: var(--ok);
  }
  .ready {
    min-height: 84px;
    font-size: 44px;
  }
  .ready.ghost {
    font-size: 26px;
  }
</style>
