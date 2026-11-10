<script lang="ts">
  // Juego de armas: nivel actual gigante, su forma de disparar y la escalera de 6 niveles.
  import { scale } from 'svelte/transition';
  import type { Game, Player, Room } from '../../lib/types';
  import { LEVELS } from '../../lib/modes';
  import { fx, fmtClock } from '../../lib/fx.svelte';

  let { g, me, gt }: { room: Room; g: Game; me: Player; gt: number } = $props();
  const level = $derived(g.m.level?.[me.id] ?? 1);
  const info = $derived(LEVELS[level - 1]);
  const limit = $derived(Number(g.config.timeLimitSec) * 1000);
</script>

<div class="top">
  {#if g.m.sudden}
    <span class="sd">Muerte súbita</span>
  {:else}
    <span class="tval num">{limit ? fmtClock(Math.max(0, limit - gt)) : fmtClock(gt)}</span>
  {/if}
</div>

<div class="stage">
  {#key level}
    <div class="lv num" in:scale={{ start: 1.6, duration: 380 }}>{level}</div>
  {/key}
  {#key fx.levelKey}
    {#if fx.levelKey}<div class="burst"></div>{/if}
  {/key}
  <div class="how">{info.name}</div>
  <span class="lbl">Nivel {level} de 6</span>
</div>

<div class="ladder">
  {#each LEVELS as l}
    <div class="step" class:done={l.n < level} class:cur={l.n === level} style="height:{30 + l.n * 9}%">
      <span class="num">{l.n}</span>
    </div>
  {/each}
</div>

<style>
  .top {
    text-align: center;
    margin: 4px 0 6px;
  }
  .tval {
    font-size: min(8vh, 64px);
    line-height: 0.9;
    opacity: 0.8;
  }
  .sd {
    font-family: var(--display);
    font-weight: 900;
    font-size: 44px;
    text-transform: uppercase;
    animation: blink 0.8s infinite;
  }
  .stage {
    position: relative;
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
  .lbl {
    font-family: var(--display);
    font-weight: 900;
    font-size: 26px;
    text-transform: uppercase;
    opacity: 0.7;
    line-height: 1;
    margin-top: 6px;
  }
  .lv {
    font-size: max(48px, min(calc(100cqh - 130px), 70cqw, 280px));
    line-height: 0.8;
    margin-bottom: 0.14em;
  }
  .how {
    margin-top: 10px;
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(26px, 4.6vh, 40px);
    text-transform: uppercase;
    line-height: 0.95;
    padding: 0 16px;
  }
  /* Poca altura: el número manda; la descripción se encoge */
  @container (max-height: 230px) {
    .lv {
      font-size: max(48px, min(calc(100cqh - 70px), 70cqw));
    }
    .lbl {
      display: none;
    }
    .how {
      margin-top: 2px;
      font-size: 22px;
    }
  }
  .burst {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 60%;
    aspect-ratio: 1;
    border: 6px solid currentColor;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    animation: burst 0.7s ease-out forwards;
    pointer-events: none;
  }
  @keyframes burst {
    from {
      transform: translate(-50%, -50%) scale(0.3);
      opacity: 1;
    }
    to {
      transform: translate(-50%, -50%) scale(1.8);
      opacity: 0;
    }
  }
  .ladder {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: clamp(56px, 10vh, 84px);
    padding: 0 20px 10px;
  }
  .step {
    flex: 1;
    display: grid;
    place-items: end center;
    padding-bottom: 4px;
    background: currentColor;
    opacity: 0.18;
    transform: skewX(-12deg);
  }
  .step span {
    font-size: 16px;
    transform: skewX(12deg);
    color: transparent;
  }
  .step.done {
    opacity: 0.55;
  }
  .step.cur {
    opacity: 1;
  }
  .step.cur span,
  .step.done span {
    color: var(--me);
  }
  :global(.critical) .step.cur span {
    color: #0d0d0d;
  }
</style>
