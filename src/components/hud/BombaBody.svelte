<script lang="ts">
  // Bomba: si la llevas, pantalla de alarma; si no, quién la lleva y si puedes alejarte.
  // El tic-tac se acelera con la tensión (el host no revela la mecha exacta).
  import type { Game, Player, Room } from '../../lib/types';
  import { sfx } from '../../lib/audio/sfx';

  let { g, me, opp, gt }: { room: Room; g: Game; me: Player; opp: Player; gt: number } = $props();
  const mine = $derived(g.m.holder === me.id);
  const tension = $derived(Number(g.m.tension ?? 0));
  const protLeft = $derived(Math.max(0, (g.m.protectedUntil ?? 0) - gt));
  const need = $derived(Math.ceil(Number(g.config.bestOf) / 2));
  const speed = $derived(1100 - 850 * Math.min(1, tension));

  // Tic-tac (más fuerte en el móvil de quien la lleva)
  $effect(() => {
    if (g.phase !== 'playing' || !g.m.holder) return;
    const vol = mine ? 1 : 0.35;
    const t = setInterval(() => sfx.tick(vol), speed);
    return () => clearInterval(t);
  });
</script>

<div class="wrap" class:mine>
  <div class="pips">
    {#each [me, opp] as p}
      <div class="pip-row">
        <span class="pn">{p.name}</span>
        {#each Array(need) as _, i}<i class:on={i < (g.roundWins[p.id] ?? 0)}></i>{/each}
      </div>
    {/each}
  </div>

  <div class="stage" style="--spd:{speed}ms">
    <svg class="bomb" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="46" cy="58" r="30" />
      <rect x="54" y="20" width="14" height="14" transform="rotate(35 61 27)" />
      <path class="fuse" d="M66 22c6-8 14-10 20-6" />
      <circle class="spark" cx="87" cy="15" r="5" />
    </svg>
    {#if mine}
      <div class="t1">¡Tienes la bomba!</div>
      {#if protLeft > 0}
        <div class="t2">No puedes devolverla: <b class="num">{Math.ceil(protLeft / 1000)}</b></div>
      {:else}
        <div class="t2">Dale al rival para pasarla</div>
      {/if}
    {:else if g.m.holder}
      <div class="t1">La lleva {opp.name}</div>
      {#if protLeft > 0}
        <div class="t2">¡Aléjate! <b class="num">{Math.ceil(protLeft / 1000)}</b> s sin devolución</div>
      {:else}
        <div class="t2">Que no te dé</div>
      {/if}
    {/if}
  </div>

  <div class="meter"><i style="width:{Math.round(tension * 100)}%"></i></div>
</div>

<style>
  .wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 6px 20px 8px;
    gap: 10px;
  }
  .pips {
    display: flex;
    justify-content: space-between;
  }
  .pip-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .pn {
    font-family: var(--display);
    font-weight: 900;
    font-size: 18px;
    text-transform: uppercase;
    margin-right: 4px;
  }
  .pip-row i {
    width: 16px;
    height: 10px;
    background: currentColor;
    opacity: 0.2;
    transform: skewX(-18deg);
  }
  .pip-row i.on {
    opacity: 1;
  }
  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 6px;
  }
  .bomb {
    width: min(42vh, 70vw, 300px);
    height: auto;
    fill: currentColor;
    opacity: 0.9;
  }
  .mine .bomb {
    fill: #ff2e3a;
    filter: drop-shadow(0 0 30px rgba(255, 46, 58, 0.6));
    animation: pulse var(--spd) ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      transform: scale(1.06);
    }
  }
  .fuse {
    fill: none;
    stroke: currentColor;
    stroke-width: 4;
  }
  .spark {
    fill: #ffd23f;
    animation: blink var(--spd) steps(2) infinite;
  }
  .t1 {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(38px, 7vh, 64px);
    text-transform: uppercase;
    line-height: 0.9;
  }
  .t2 {
    font-size: 16px;
    font-weight: 700;
    opacity: 0.85;
  }
  .t2 b {
    font-size: 28px;
  }
  .meter {
    height: 8px;
    background: rgba(255, 255, 255, 0.12);
    transform: skewX(-20deg);
    overflow: hidden;
  }
  .meter i {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #ffd23f, #ff2e3a);
    transition: width 0.6s;
  }
</style>
