<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { app } from '../lib/app.svelte';
  import { MODES, modeInfo } from '../lib/modes';
  import { configFor } from '../lib/engine/room';
  import type { ModeConfig } from '../lib/types';
  import { sfx } from '../lib/audio/sfx';
  import Avatar from '../components/Avatar.svelte';
  import ModeIcon from '../components/ModeIcon.svelte';

  const s = app.session!;
  const room = $derived(s.room!);
  const info = $derived(modeInfo(room.mode));
  const cfg = $derived(configFor(room) as ModeConfig);
  const iAmReady = $derived(!!room.ready[s.me]);
  const oppReady = $derived(!!(app.opp && room.ready[app.opp.id]));
  let rules = $state(false);
  let dir = $state(1);

  function set(patch: ModeConfig) {
    sfx.click();
    s.send({ t: 'config', mode: room.mode, config: { ...cfg, ...patch } });
  }

  function step(d: number) {
    sfx.click();
    dir = d;
    const i = MODES.findIndex((m) => m.id === room.mode);
    const next = MODES[(i + d + MODES.length) % MODES.length];
    s.send({ t: 'selectMode', mode: next.id });
  }

  const rows = $derived([
    ...info.facts(cfg).map((f) => ({ k: f.k, label: f.v, v: f.f })),
    ...info.bars.map((b) => ({ k: b.k, label: '', v: b.v })),
  ]);
</script>

<div class="screen ms" style="--mc:{info.color}">
  <div class="top">
    <button class="link" onclick={() => s.send({ t: 'toLobby' })}>← Volver</button>
    <span class="count num">{MODES.findIndex((m) => m.id === room.mode) + 1}/{MODES.length}</span>
    <button class="link" onclick={() => (rules = true)}>Reglas</button>
  </div>

  <!-- Escaparate -->
  <div class="show">
    <button class="arrow l" onclick={() => step(-1)} aria-label="Modo anterior">
      <svg viewBox="0 0 24 40"><path d="M20 2 4 20l16 18" /></svg>
    </button>
    {#key info.id}
      <div class="stage" in:fly={{ x: 80 * dir, duration: 260 }}>
        <div class="disc"></div>
        <span class="art"><ModeIcon d={info.icon} size={120} stroke={3} /></span>
        <h1 class="display" class:long={info.name.length > 8}>{info.name}</h1>
        <p class="tag">{info.available ? info.tag : 'Próximamente'}</p>
      </div>
    {/key}
    <button class="arrow r" onclick={() => step(1)} aria-label="Modo siguiente">
      <svg viewBox="0 0 24 40"><path d="M4 2l16 18L4 38" /></svg>
    </button>
  </div>

  <!-- Panel de estadísticas -->
  <div class="panel">
    {#each rows as r, i}
      <div class="row">
        <span class="k">{r.k}</span>
        {#if r.label}<span class="val num">{r.label}</span>{/if}
        <span class="bar"><i style="width:{Math.round(r.v * 100)}%;animation-delay:{i * 50}ms"></i></span>
      </div>
    {/each}
  </div>

  {#if info.available}
    <div class="opts">
      {#each info.options as o}
        <div class="optrow">
          <span class="ol">{o.label}</span>
          <div class="seg" role="group" aria-label={o.label} style="--n:{o.choices.length}">
            {#each o.choices as ch}
              <button class:on={Number(cfg[o.key]) === ch.v} onclick={() => set({ [o.key]: ch.v })}>{ch.l}</button>
            {/each}
          </div>
        </div>
      {/each}
      {#if info.toggles.length}
        <div class="vars">
          {#each info.toggles as t}
            <button class="var" class:on={!!cfg[t.key]} onclick={() => set({ [t.key]: !cfg[t.key] })}>
              <span class="chk">{cfg[t.key] ? '✓' : '+'}</span><span>{t.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="grow"><p class="sumtxt">{info.summary}</p></div>

  <div class="ready-row">
    {#each [app.me, app.opp] as p}
      {#if p}
        <span class="rp" class:ok={room.ready[p.id]}>
          <Avatar icon={p.icon} color={p.color} size={26} />
          <span>{p.name}</span>
          <b>{room.ready[p.id] ? 'LISTO' : '…'}</b>
        </span>
      {/if}
    {/each}
  </div>
  <button class="btn go" class:ghost={iAmReady} disabled={!info.available} onclick={() => app.ready(!iAmReady)}>
    {!info.available ? 'Pronto' : iAmReady ? (oppReady ? '¡Vamos!' : 'Esperando…') : '¡Listo!'}
  </button>
</div>

{#if rules}
  <div class="sheet" transition:fade={{ duration: 120 }} onclick={() => (rules = false)} role="presentation">
    <div class="card" in:fly={{ y: 60, duration: 220 }}>
      <h2 class="display">{info.name}</h2>
      <p class="sum">{info.summary}</p>
      {#if info.details.length}
        <ul>
          {#each info.details as d}<li>{d}</li>{/each}
          </ul>
      {/if}
      <button class="btn small">Entendido</button>
    </div>
  </div>
{/if}

<style>
  .ms {
    gap: clamp(8px, 1.6vh, 14px);
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .top .link {
    padding: 4px 0;
  }
  .count {
    font-size: 18px;
    color: var(--mute);
  }

  /* Escaparate con flechas */
  .show {
    position: relative;
    display: grid;
    grid-template-columns: 34px 1fr 34px;
    align-items: center;
    height: clamp(170px, 28vh, 250px);
    flex: none;
  }
  .stage {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    text-align: center;
    padding-bottom: 6px;
    grid-column: 2;
    grid-row: 1;
  }
  .disc {
    position: absolute;
    left: 50%;
    bottom: 26%;
    width: 78%;
    aspect-ratio: 3.2;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--mc) 55%, transparent), transparent);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--mc) 80%, transparent),
      0 0 30px color-mix(in srgb, var(--mc) 50%, transparent);
  }
  .art {
    position: absolute;
    left: 50%;
    top: 4%;
    transform: translateX(-50%);
    color: var(--mc);
    filter: drop-shadow(0 0 16px color-mix(in srgb, var(--mc) 60%, transparent));
    animation: hover 2.6s ease-in-out infinite;
  }
  .art :global(svg) {
    width: clamp(78px, 14vh, 120px);
    height: clamp(78px, 14vh, 120px);
  }
  @keyframes hover {
    50% {
      transform: translate(-50%, -6px);
    }
  }
  h1.long {
    font-size: clamp(38px, 6.2vh, 58px);
  }
  .sumtxt {
    margin: 0;
    padding-top: 12px;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
    color: var(--mute);
  }
  h1 {
    position: relative;
    font-size: clamp(46px, 8.5vh, 84px);
    color: var(--paper);
    text-shadow: 0 4px 18px rgba(0, 0, 0, 0.6);
  }
  .tag {
    position: relative;
    margin: 4px 0 0;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mc);
  }
  .arrow {
    appearance: none;
    border: none;
    background: none;
    padding: 0;
    height: 64px;
    z-index: 2;
  }
  .arrow.l {
    grid-column: 1;
    grid-row: 1;
  }
  .arrow.r {
    grid-column: 3;
    grid-row: 1;
  }
  .arrow svg {
    width: 22px;
    height: 40px;
    fill: none;
    stroke: var(--me);
    stroke-width: 5;
  }
  .arrow:active svg {
    transform: scale(0.85);
  }

  /* Panel de estadísticas */
  .panel {
    background: var(--bg-2);
    border-radius: 6px;
    border-top: 3px solid var(--mc);
    padding: 6px 12px 8px;
    display: flex;
    flex-direction: column;
  }
  .row {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto 6px;
    align-items: end;
    column-gap: 8px;
    padding: 4px 0;
  }
  .k {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--mute);
  }
  .val {
    font-size: 20px;
    line-height: 1;
  }
  .bar {
    grid-column: 1 / -1;
    height: 6px;
    background: var(--bg-3);
    margin-top: 3px;
    transform: skewX(-20deg);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--mc);
    animation: fill 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    transform-origin: left;
  }
  @keyframes fill {
    from {
      transform: scaleX(0);
    }
  }

  .opts {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .optrow {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ol {
    flex: none;
    width: 30%;
    font-family: var(--display);
    font-weight: 900;
    font-size: 18px;
    text-transform: uppercase;
    line-height: 1;
  }
  .seg {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(var(--n), 1fr);
    background: var(--bg-2);
    border-radius: 6px;
    padding: 4px;
    gap: 4px;
  }
  .seg button {
    appearance: none;
    border: none;
    background: none;
    color: var(--mute);
    font-family: var(--display);
    font-weight: 900;
    font-size: 20px;
    height: 38px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .seg button.on {
    background: var(--me);
    color: var(--me-ink);
  }
  .vars {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .var {
    appearance: none;
    border: 2px solid var(--bg-3);
    background: transparent;
    color: var(--paper);
    border-radius: 6px;
    height: 46px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    font-family: var(--display);
    font-weight: 800;
    font-size: 18px;
    text-transform: uppercase;
    text-align: left;
    line-height: 1;
  }
  .var.on {
    border-color: var(--me);
    background: color-mix(in srgb, var(--me) 18%, transparent);
  }
  .chk {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    display: grid;
    place-items: center;
    background: var(--bg-3);
    font-size: 15px;
  }
  .var.on .chk {
    background: var(--me);
    color: var(--me-ink);
  }
  .grow {
    flex: 1;
    min-height: 0;
  }
  .ready-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .rp {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-family: var(--display);
    font-weight: 900;
    font-size: 19px;
    text-transform: uppercase;
    opacity: 0.45;
    transition: opacity 0.2s;
  }
  .rp span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rp b {
    font-size: 12px;
    color: var(--mute);
  }
  .rp.ok {
    opacity: 1;
  }
  .rp.ok b {
    color: var(--ok);
  }
  .go {
    min-height: clamp(62px, 10vh, 84px);
    font-size: 42px;
    flex: none;
  }
  .go.ghost {
    font-size: 26px;
  }
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 120;
    background: rgba(10, 10, 10, 0.88);
    display: flex;
    align-items: flex-end;
  }
  .card {
    width: 100%;
    background: var(--bg-2);
    border-radius: 12px 12px 0 0;
    padding: 20px 20px calc(var(--sab) + 20px);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h2 {
    font-size: 44px;
    color: var(--mc);
  }
  .sum {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    font-size: 15px;
    line-height: 1.5;
    color: var(--paper);
  }
</style>
