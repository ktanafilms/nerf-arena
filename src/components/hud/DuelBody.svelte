<script lang="ts">
  // Duelo: tiempo arriba y el número de vidas como un dorsal gigante.
  import { scale } from 'svelte/transition';
  import type { Game, Player, Room } from '../../lib/types';
  import { fx, fmtClock } from '../../lib/fx.svelte';
  import Lives from '../Lives.svelte';

  let { g, me, gt }: { room: Room; g: Game; me: Player; gt: number } = $props();
  const lives = $derived(g.m.lives?.[me.id] ?? 0);
  const limit = $derived(Number(g.config.timeLimitSec) * 1000);
  const remaining = $derived(limit ? Math.max(0, limit - gt) : null);
  const low = $derived(remaining !== null && remaining < 30000 && g.phase === 'playing');
</script>

<div class="timer" class:low>
  {#if g.m.sudden}
    <span class="sd">Muerte súbita</span>
  {:else if remaining !== null}
    <span class="tval num">{fmtClock(remaining)}</span>
  {:else}
    <span class="tval num dimv">{fmtClock(gt)}</span>
  {/if}
</div>

<div class="dorsal">
  {#key lives}
    <div class="mnum num" in:scale={{ start: 1.35, duration: 320 }}>{lives}</div>
  {/key}
  <Lives total={Number(g.config.lives)} left={lives} shatterKey={fx.hurtKey} shatterIndex={fx.shatterIndex} />
</div>

<div class="mine">
  <span class="myname">{me.name}</span>
  {#if g.config.oneInChamber}<span class="variant">Un solo dardo</span>{/if}
  {#if g.config.confirmedKill}<span class="variant">Baja confirmada</span>{/if}
</div>

<style>
  .timer {
    text-align: center;
    margin: 4px 0 10px;
  }
  .tval {
    font-size: min(12vh, 108px);
    line-height: 0.85;
  }
  .dimv {
    opacity: 0.6;
  }
  .low .tval {
    animation: blink 0.5s steps(2) infinite;
  }
  .sd {
    font-family: var(--display);
    font-weight: 900;
    font-size: 54px;
    text-transform: uppercase;
    animation: blink 0.8s infinite;
  }
  .dorsal {
    flex: 1;
    min-height: 0;
    container-type: size;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }
  .mnum {
    font-size: min(40vh, 360px);
    font-size: max(48px, min(calc((100cqh - 40px) / 0.8), 80cqw, 380px));
    line-height: 0.76;
    letter-spacing: -0.03em;
  }
  :global(.critical) .mnum {
    animation: beat 0.95s infinite;
  }
  @keyframes beat {
    0%,
    100% {
      transform: scale(1);
    }
    10% {
      transform: scale(1.06);
    }
    25% {
      transform: scale(1.01);
    }
    35% {
      transform: scale(1.05);
    }
  }
  .mine {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding-bottom: 8px;
  }
  .myname {
    font-family: var(--display);
    font-weight: 900;
    font-size: 40px;
    text-transform: uppercase;
    line-height: 1;
  }
  .variant {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border: 2px solid currentColor;
    padding: 2px 8px;
  }
</style>
