<script lang="ts">
  // Cazador y presa. Presa: sigilo y tiempo aguantado; su móvil pita para delatarla.
  // Cazador: radar decorativo que reacciona a cada pitido (no hay posición real).
  import type { Game, Player, Room } from '../../lib/types';
  import { sfx, vibrate } from '../../lib/audio/sfx';
  import { fmtClock } from '../../lib/fx.svelte';

  let { g, me, opp, gt }: { room: Room; g: Game; me: Player; opp: Player; gt: number } = $props();
  const prey = $derived(g.m.prey === me.id);
  const hiding = $derived(g.m.sub === 'hide');
  const hideLeft = $derived(Math.max(0, g.m.subStart + Number(g.config.hideSec) * 1000 - gt));
  const max = $derived(Number(g.config.maxSec) * 1000);
  const elapsed = $derived(hiding ? 0 : Math.max(0, gt - g.m.subStart));

  /** Momentos de pitido: cada 20 s y, en el último minuto, cada 10 s */
  const schedule = $derived.by(() => {
    const fast = Math.max(0, max - 60000);
    const out: number[] = [];
    for (let t = 20000; t < fast; t += 20000) out.push(t);
    for (let t = fast || 10000; t < max; t += 10000) if (!out.includes(t)) out.push(t);
    return out;
  });
  const pings = (t: number) => schedule.filter((x) => x <= t).length;
  const nextPing = (t: number) => (schedule.find((x) => x > t) ?? max) - t;
  const count = $derived(hiding || g.phase !== 'playing' ? -1 : pings(elapsed));
  let last = -1;
  let blip = $state({ k: 0, a: 0, r: 0.5 });
  $effect(() => {
    const c = count;
    if (c > last && last >= 0) {
      if (prey) {
        sfx.ping();
        vibrate(120);
      } else {
        sfx.sweep();
        blip = { k: blip.k + 1, a: Math.random() * 360, r: 0.3 + Math.random() * 0.55 };
      }
    }
    last = c;
  });
</script>

<div class="wrap">
  {#if hiding}
    <div class="stage">
      <div class="t1">{prey ? '¡Escóndete!' : 'Mira a la pared'}</div>
      <div class="big num">{Math.ceil(hideLeft / 1000)}</div>
      <div class="t2">{prey ? 'El cazador no mira' : `${opp.name} se está escondiendo`}</div>
    </div>
  {:else if prey}
    <div class="stage stealth">
      <div class="t1">Aguanta</div>
      <div class="big num">{fmtClock(elapsed)}</div>
      <div class="t2">Tu móvil pitará en <b class="num">{Math.ceil(nextPing(elapsed) / 1000)}</b> s</div>
      <div class="bar"><i style="width:{Math.min(100, (elapsed / max) * 100)}%"></i></div>
      <div class="t3">Máximo {fmtClock(max)}</div>
    </div>
  {:else}
    <div class="stage">
      <div class="radar">
        <div class="sweep"></div>
        <i class="ring r1"></i><i class="ring r2"></i><i class="ring r3"></i>
        {#key blip.k}
          {#if blip.k}
            <span class="blip" style="--a:{blip.a}deg;--r:{blip.r}"></span>
          {/if}
        {/key}
      </div>
      <div class="hud2">
        <span class="num t1s">{fmtClock(elapsed)}</span>
        <span class="t3">8 dardos · sin recoger</span>
      </div>
    </div>
  {/if}

  <div class="rounds">
    {#each [me, opp] as p}
      <span><b>{p.name}</b> {g.m.survived?.[p.id] != null ? fmtClock(g.m.survived[p.id]) : '—'}</span>
    {/each}
  </div>
</div>

<style>
  .wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 4px 20px 8px;
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
  .t1 {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(40px, 7.5vh, 68px);
    text-transform: uppercase;
    line-height: 0.9;
    color: var(--me);
  }
  .big {
    margin: 0.14em 0 0.04em;
    font-size: min(24vh, 46vw, 220px);
    line-height: 0.8;
  }
  .t2 {
    font-size: 16px;
    font-weight: 700;
    opacity: 0.85;
  }
  .t2 b {
    font-size: 24px;
  }
  .t3 {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.6;
  }
  .bar {
    width: 80%;
    height: 8px;
    background: rgba(255, 255, 255, 0.12);
    transform: skewX(-20deg);
    overflow: hidden;
    margin-top: 8px;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--me);
  }
  .radar {
    position: relative;
    width: min(48vh, 78vw, 340px);
    aspect-ratio: 1;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--me) 70%, transparent);
    background: radial-gradient(circle, color-mix(in srgb, var(--me) 14%, transparent), transparent 70%);
    overflow: hidden;
  }
  .ring {
    position: absolute;
    left: 50%;
    top: 50%;
    border: 1px solid color-mix(in srgb, var(--me) 35%, transparent);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }
  .r1 {
    width: 33%;
    height: 33%;
  }
  .r2 {
    width: 66%;
    height: 66%;
  }
  .r3 {
    width: 2px;
    height: 100%;
    border: none;
    background: color-mix(in srgb, var(--me) 25%, transparent);
  }
  .sweep {
    position: absolute;
    inset: 0;
    background: conic-gradient(from 0deg, color-mix(in srgb, var(--me) 55%, transparent), transparent 60deg);
    animation: spin 2.4s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .blip {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 18px;
    height: 18px;
    margin: -9px;
    border-radius: 50%;
    background: var(--me);
    box-shadow: 0 0 20px var(--me);
    transform: rotate(var(--a)) translateY(calc(var(--r) * -50 * min(48vh, 78vw, 340px) / 100));
    animation: blipfade 2.5s ease-out forwards;
  }
  @keyframes blipfade {
    to {
      opacity: 0;
    }
  }
  .hud2 {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .t1s {
    font-size: 56px;
    line-height: 0.9;
  }
  .rounds {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    opacity: 0.8;
  }
  .rounds b {
    font-family: var(--display);
    font-weight: 900;
    text-transform: uppercase;
    font-size: 18px;
  }
</style>
