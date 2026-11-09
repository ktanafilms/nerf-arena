<script lang="ts">
  // Tiro al blanco: número cantado gigante, botón "¡Mía!" y tiempos de reacción.
  import { scale } from 'svelte/transition';
  import type { Game, Player, Room } from '../../lib/types';
  import type { Command } from '../../lib/voice/matcher';

  let {
    g,
    me,
    opp,
    onCommand,
  }: { room: Room; g: Game; me: Player; opp: Player; now: number; onCommand: (c: Command) => void } = $props();
  const R = $derived(Number(g.config.rounds));
  const live = $derived(g.m.sub === 'live' && g.phase === 'playing');
  const lastResult = $derived([...g.events].reverse().find((e) => ['claim', 'tie', 'nocall'].includes(e.kind)));
  const best = (pid: string) => {
    const r: number[] = g.m.reactions?.[pid] ?? [];
    return r.length ? Math.min(...r) : null;
  };
  const resultText = $derived.by(() => {
    const e = lastResult;
    if (!e) return '';
    if (e.kind === 'tie') return 'Empate · no puntúa';
    if (e.kind === 'nocall') return 'Nadie la tumbó';
    return `${e.by === me.id ? 'Tuya' : `Para ${opp.name}`} · ${e.value} ms`;
  });
</script>

<div class="wrap">
  <div class="top">
    <span class="bombchip">Lata bomba <b class="num">{g.m.bombCan}</b></span>
  </div>

  <div class="stage">
    {#if live}
      {#key g.m.callNum}
        <div class="call num" in:scale={{ start: 2.2, duration: 260 }}>{g.m.callNum}</div>
      {/key}
      <div class="t1">¡Lata {g.m.callNum}!</div>
    {:else}
      <div class="wait">Atentos…</div>
      {#if resultText}<div class="res">{resultText}</div>{/if}
    {/if}
  </div>

  <button class="mia" class:live disabled={!live} onclick={() => onCommand('mia')}>¡Mía!</button>

  <div class="score">
    {#each [me, opp] as p}
      <div class="ps">
        <span class="pn">{p.name}</span>
        <span class="pts num">{g.m.points?.[p.id] ?? 0}</span>
        <span class="best">{best(p.id) !== null ? `mejor ${best(p.id)} ms` : '—'}</span>
      </div>
    {/each}
  </div>
  <button class="oops" onclick={() => onCommand('bomba')}>He tumbado la lata bomba (−1)</button>
</div>

<style>
  .wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 4px 20px 8px;
    gap: 8px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .bombchip {
    background: #0d0d0d;
    color: #ff2e3a;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 4px 10px;
    border-radius: 4px;
  }
  .bombchip b {
    font-size: 20px;
    margin-left: 4px;
  }
  .stage {
    flex: 1;
    min-height: 0;
    container-type: size;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    overflow: hidden;
  }
  .call {
    font-size: min(calc((100cqh - 60px) / 0.8), 70cqw, 360px);
    line-height: 0.78;
  }
  .t1 {
    font-family: var(--display);
    font-weight: 900;
    font-size: 34px;
    text-transform: uppercase;
  }
  .wait {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(48px, 9vh, 84px);
    text-transform: uppercase;
    animation: blink 1.4s ease-in-out infinite;
  }
  .res {
    font-size: 18px;
    font-weight: 700;
    margin-top: 8px;
  }
  .mia {
    appearance: none;
    border: none;
    height: clamp(64px, 10vh, 88px);
    border-radius: 6px;
    background: #0d0d0d;
    color: rgba(255, 255, 255, 0.3);
    font-family: var(--display);
    font-weight: 900;
    font-size: 44px;
    text-transform: uppercase;
    transition: transform 0.08s;
  }
  .mia.live {
    background: #fff;
    color: #0d0d0d;
    animation: glow 0.6s ease-in-out infinite alternate;
  }
  .mia:active {
    transform: scale(0.97);
  }
  @keyframes glow {
    to {
      box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.35);
    }
  }
  .score {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .ps {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(0, 0, 0, 0.18);
    border-radius: 6px;
    padding: 6px;
  }
  .pn {
    font-family: var(--display);
    font-weight: 900;
    font-size: 18px;
    text-transform: uppercase;
  }
  .pts {
    font-size: 40px;
    line-height: 0.9;
  }
  .best {
    font-size: 11px;
    font-weight: 700;
    opacity: 0.75;
  }
  .oops {
    appearance: none;
    border: none;
    background: none;
    color: inherit;
    opacity: 0.7;
    font-family: var(--body);
    font-weight: 700;
    font-size: 13px;
    text-decoration: underline;
    padding: 2px;
  }
</style>
