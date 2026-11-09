<script lang="ts">
  // Buscar y destruir. El móvil del atacante ES la bomba: pantalla de bomba con el botón
  // que el rival debe mantener 5 s. El del desactivador muestra el tiempo que queda.
  import type { Game, Player, Room } from '../../lib/types';
  import { app } from '../../lib/app.svelte';
  import { sfx, vibrate } from '../../lib/audio/sfx';
  import { fmtClock } from '../../lib/fx.svelte';

  let { g, me, opp, gt }: { room: Room; g: Game; me: Player; opp: Player; gt: number } = $props();
  const HOLD_MS = 5000;
  const attacker = $derived(g.m.attacker === me.id);
  const sub = $derived(g.m.sub as string);
  const plantLeft = $derived(Math.max(0, g.m.subStart + Number(g.config.plantSec) * 1000 - gt));
  const bombLeft = $derived(Math.max(0, g.m.subStart + Number(g.config.bombSec) * 1000 - gt));
  const R = $derived(Number(g.config.rounds));

  // Pitido del móvil-bomba: cada 10 s, y cada segundo en los últimos 10
  const beepIdx = $derived(sub === 'bomb' && g.phase === 'playing' ? (bombLeft > 10000 ? Math.floor((gt - g.m.subStart) / 10000) : 1000 + Math.ceil(bombLeft / 1000)) : -1);
  let lastBeep = -1;
  $effect(() => {
    const b = beepIdx;
    if (b !== lastBeep && b >= 0 && lastBeep >= 0 && attacker) {
      sfx.ping();
      vibrate(60);
    }
    lastBeep = b;
  });

  // Botón de desactivar (mantener 5 s)
  let holdStart = $state<number | null>(null);
  let progress = $state(0);
  let raf = 0;
  function startHold(e: PointerEvent) {
    e.preventDefault();
    if (sub !== 'bomb' || g.phase !== 'playing') return;
    holdStart = performance.now();
    sfx.click();
    const loop = () => {
      if (holdStart === null) return;
      progress = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
      if (Math.floor(progress * 10) !== Math.floor((progress - 0.016) * 10)) sfx.click();
      if (progress >= 1) {
        holdStart = null;
        sfx.victory();
        vibrate([100, 50, 300]);
        app.session?.send({ t: 'defuse' });
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  function endHold() {
    if (holdStart !== null && progress < 1) sfx.error();
    holdStart = null;
    cancelAnimationFrame(raf);
    progress = 0;
  }
  const C = 2 * Math.PI * 46;
</script>

<div class="wrap" class:bombphone={attacker && sub === 'bomb'}>
  <div class="pips">
    {#each [me, opp] as p}
      <span><b>{p.name}</b> <span class="num">{g.roundWins[p.id] ?? 0}</span></span>
    {/each}
  </div>

  {#if sub === 'plant'}
    <div class="stage">
      <div class="t1">{attacker ? 'Esconde tu móvil' : 'Mira a la pared'}</div>
      <div class="big num">{Math.ceil(plantLeft / 1000)}</div>
      <div class="t2">
        {attacker ? 'Déjalo boca arriba con la pantalla encendida. Esta pantalla será la bomba.' : `${opp.name} está plantando la bomba`}
      </div>
    </div>
  {:else if sub === 'bomb' && attacker}
    <div class="stage nogesture">
      <div class="armed">Bomba armada</div>
      <div class="clock num" class:hot={bombLeft < 10000}>{fmtClock(bombLeft)}</div>
      <button
        class="defuse nogesture"
        class:on={holdStart !== null}
        onpointerdown={startHold}
        onpointerup={endHold}
        onpointerleave={endHold}
        onpointercancel={endHold}
        oncontextmenu={(e) => e.preventDefault()}
      >
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" class="track" />
          <circle cx="50" cy="50" r="46" class="prog" style="stroke-dasharray:{C};stroke-dashoffset:{C * (1 - progress)}" />
        </svg>
        <span class="lbl">{holdStart !== null ? `${Math.ceil((1 - progress) * 5)}` : 'Mantén para desactivar'}</span>
      </button>
      <div class="t3">Si sueltas, se pierde el progreso</div>
    </div>
  {:else if sub === 'bomb'}
    <div class="stage">
      <div class="t1">{attacker ? '' : 'Encuentra la bomba'}</div>
      <div class="big num" class:hot={bombLeft < 10000}>{fmtClock(bombLeft)}</div>
      <div class="t2">Mantén su botón 5 s. Si te dan, di «{me.name}, tocado».</div>
    </div>
  {:else}
    <div class="stage">
      <div class="t1">{sub === 'defused' ? '¡Desactivada!' : '¡Boom!'}</div>
    </div>
  {/if}
</div>

<style>
  .wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 4px 20px 8px;
  }
  .pips {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    font-size: 14px;
  }
  .pips b {
    font-family: var(--display);
    font-weight: 900;
    text-transform: uppercase;
    font-size: 18px;
  }
  .pips .num {
    font-size: 26px;
  }
  .stage {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 8px;
  }
  .t1 {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(38px, 7vh, 64px);
    text-transform: uppercase;
    line-height: 0.9;
  }
  .big {
    margin: 0.14em 0 0.04em;
    font-size: min(22vh, 40vw, 200px);
    line-height: 0.8;
  }
  .hot {
    animation: blink 0.5s steps(2) infinite;
  }
  .t2 {
    font-size: 15px;
    font-weight: 700;
    opacity: 0.85;
    max-width: 30ch;
  }
  .t3 {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.65;
  }
  .armed {
    font-family: var(--display);
    font-weight: 900;
    font-size: 28px;
    text-transform: uppercase;
    color: #ff2e3a;
    letter-spacing: 0.04em;
  }
  .clock {
    font-size: min(16vh, 30vw, 150px);
    line-height: 0.85;
    color: #ff2e3a;
    text-shadow: 0 0 30px rgba(255, 46, 58, 0.6);
  }
  .defuse {
    appearance: none;
    border: none;
    position: relative;
    width: min(36vh, 64vw, 260px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: #1a1a1a;
    color: #fff;
    display: grid;
    place-items: center;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    transition: transform 0.1s;
  }
  .defuse.on {
    transform: scale(0.96);
    background: #232323;
  }
  .defuse svg {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }
  .track {
    fill: none;
    stroke: rgba(255, 255, 255, 0.12);
    stroke-width: 6;
  }
  .prog {
    fill: none;
    stroke: #19c6d8;
    stroke-width: 6;
    stroke-linecap: round;
  }
  .lbl {
    position: relative;
    font-family: var(--display);
    font-weight: 900;
    font-size: 26px;
    text-transform: uppercase;
    line-height: 0.95;
    padding: 0 20%;
  }
  .defuse.on .lbl {
    font-size: 90px;
  }
</style>
