<script lang="ts">
  // "Un móvil para los dos": pantalla neutral con el marcador de ambos, el estado del modo
  // y botones grandes para cada jugador. Funciona sin ninguna conexión.
  import { fade, fly, scale } from 'svelte/transition';
  import { app } from '../lib/app.svelte';
  import { fx, fmtClock } from '../lib/fx.svelte';
  import { gameTime } from '../lib/engine/room';
  import { LOGIC } from '../lib/engine/logic';
  import { modeInfo } from '../lib/modes';
  import { colorDef } from '../lib/types';
  import type { Command } from '../lib/voice/matcher';
  import { sfx, vibrate } from '../lib/audio/sfx';
  import { say } from '../lib/audio/narrator';
  import Avatar from '../components/Avatar.svelte';
  import MicIndicator from '../components/MicIndicator.svelte';
  import Result from './Result.svelte';

  let { onCommand }: { onCommand: (c: Command, pid?: string) => void } = $props();
  const s = app.session!;
  const room = $derived(s.room!);
  const g = $derived(room.game!);
  const [pa, pb] = $derived(room.players);
  const name = (pid?: string | null) => room.players.find((p) => p.id === pid)?.name ?? '';

  let now = $state(s.now());
  $effect(() => {
    let raf = 0;
    const loop = () => {
      now = s.now();
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  });
  const gt = $derived(gameTime(g, now));
  const sb = $derived(LOGIC[g.mode].scoreboard(room, g));
  const info = $derived(modeInfo(g.mode));
  const clock = $derived(
    sb.clock.kind === 'down' ? fmtClock(Math.max(0, sb.clock.ref - gt) + 999) : sb.clock.kind === 'up' ? fmtClock(Math.max(0, gt - sb.clock.ref)) : '',
  );
  const cd = $derived(g.phase === 'countdown' ? Math.ceil((g.startAt - now) / 1000) : 0);
  const resumeN = $derived(g.phase === 'resuming' && g.resumeAt ? Math.max(1, Math.ceil((g.resumeAt - now) / 1000)) : 0);
  const interLeft = $derived(g.phase === 'intermission' && g.interUntil !== null ? Math.max(0, g.interUntil - gt) : 0);
  const confirmLeft = $derived(g.phase === 'finalizing' && g.finalizeAt ? Math.max(0, g.finalizeAt - now) : 0);
  const realClock = $derived(Math.max(0, now - g.startAt));

  // Cuenta atrás con pitidos
  let lastN = 0;
  $effect(() => {
    const n = cd > 3 ? 0 : cd || (interLeft > 0 && interLeft <= 3000 ? Math.ceil(interLeft / 1000) : 0) || resumeN;
    if (n !== lastN && n >= 1 && n <= 3) {
      sfx.countdown();
      if (!resumeN) say(['', 'Uno', 'Dos', 'Tres'][n], { interrupt: true, rate: 1.2 });
    }
    lastN = n;
  });

  // Tic-tac de la bomba y pitidos de localización (el móvil va con la presa / es la bomba)
  $effect(() => {
    if (g.mode !== 'bomba' || g.phase !== 'playing') return;
    const t = setInterval(() => sfx.tick(1), 1100 - 850 * Math.min(1, Number(g.m.tension ?? 0)));
    return () => clearInterval(t);
  });
  const pingIdx = $derived.by(() => {
    if (g.phase !== 'playing') return -1;
    if (g.mode === 'cazador' && g.m.sub === 'hunt') {
      const el = gt - g.m.subStart;
      const max = Number(g.config.maxSec) * 1000;
      const fast = Math.max(0, max - 60000);
      return el < fast ? Math.floor(el / 20000) : 100 + Math.floor((el - fast) / 10000);
    }
    if (g.mode === 'buscar' && g.m.sub === 'bomb') return Math.floor((gt - g.m.subStart) / 10000);
    return -1;
  });
  let lastPing = -1;
  $effect(() => {
    const p = pingIdx;
    if (p !== lastPing && p > 0 && lastPing >= 0) {
      sfx.ping();
      vibrate(80);
    }
    lastPing = p;
  });

  // Botón de desactivar (Buscar y destruir: este móvil ES la bomba)
  let holdStart = $state<number | null>(null);
  let holdP = $state(0);
  let raf = 0;
  function startHold(e: PointerEvent) {
    e.preventDefault();
    holdStart = performance.now();
    const loop = () => {
      if (holdStart === null) return;
      holdP = Math.min(1, (performance.now() - holdStart) / 5000);
      if (holdP >= 1) {
        holdStart = null;
        sfx.victory();
        (s as any).as?.(g.m.attacker, { t: 'defuse' });
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  function endHold() {
    holdStart = null;
    cancelAnimationFrame(raf);
    holdP = 0;
  }

  const status = $derived.by(() => {
    const m = g.m;
    switch (g.mode) {
      case 'duelo':
      case 'armas':
        return m.sudden ? 'Muerte súbita: el siguiente acierto gana' : '';
      case 'bomba': {
        const prot = Math.max(0, (m.protectedUntil ?? 0) - gt);
        return m.holder ? `La lleva ${name(m.holder)}${prot > 0 ? ` · sin devolución ${Math.ceil(prot / 1000)} s` : ''}` : '';
      }
      case 'cazador':
        return m.sub === 'hide' ? `${name(m.prey)} se esconde con el móvil · ${name(m.hunter)} mira a la pared` : `${name(m.prey)} aguanta · ${name(m.hunter)} caza`;
      case 'buscar':
        return m.sub === 'plant' ? `${name(m.attacker)} esconde este móvil · ${name(m.defuser)} mira a la pared` : m.sub === 'bomb' ? `${name(m.defuser)}: mantén el botón 5 s` : '';
      case 'blanco':
        return `Lata bomba: ${m.bombCan}`;
    }
    return '';
  });
  const actions = $derived(g.mode === 'blanco' ? (['mia', 'bomba'] as Command[]) : (['tocado'] as Command[]));
  const label: Record<string, string> = { tocado: 'Tocado', mia: '¡Mía!', bomba: 'Lata bomba' };
  const lastRound = $derived([...g.events].reverse().find((e) => e.kind === 'roundend'));
</script>

{#if g.phase === 'ended'}
  <Result />
{:else}
  <div class="tv" style="--mc:{info.color}">
    <!-- Marcador -->
    <div class="board">
      {#each [pa, pb] as p, i}
        {@const c = colorDef(p.color)}
        {@const side = i === 0 ? sb.A : sb.B}
        <div class="half" style="--c:{c.hex};--i:{c.ink}">
          <div class="who"><Avatar icon={p.icon} color={p.color} size={30} /><span>{p.name}</span></div>
          {#key side.main}<div class="main num" in:scale={{ start: 1.4, duration: 300 }}>{side.main}</div>{/key}
          <div class="sub">{side.sub}</div>
        </div>
      {/each}
    </div>

    <div class="meta">
      <span class="num rec">● {fmtClock(realClock, true)}</span>
      <MicIndicator />
    </div>

    <!-- Centro -->
    <div class="mid">
      {#if g.mode === 'blanco' && g.m.sub === 'live'}
        {#key g.m.callNum}<div class="call num" in:scale={{ start: 2, duration: 260 }}>{g.m.callNum}</div>{/key}
      {:else if g.mode === 'buscar' && g.m.sub === 'bomb'}
        <div class="clock num hot">{clock}</div>
        <button class="defuse" onpointerdown={startHold} onpointerup={endHold} onpointerleave={endHold} onpointercancel={endHold}>
          <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="track" /><circle cx="50" cy="50" r="46" class="prog" style="stroke-dasharray:289;stroke-dashoffset:{289 * (1 - holdP)}" /></svg>
          <span>{holdStart !== null ? Math.ceil((1 - holdP) * 5) : 'Mantén para desactivar'}</span>
        </button>
      {:else if clock}
        <div class="clock num">{clock}</div>
      {:else}
        <div class="clock num dim">{g.mode === 'blanco' ? 'Atentos…' : g.mode === 'bomba' && g.m.holder ? name(g.m.holder) : info.name}</div>
        {#if sb.center}<span class="eyebrow">{sb.center}</span>{/if}
      {/if}
      {#if status}<p class="status">{status}</p>{/if}
    </div>

    <!-- Feed -->
    <div class="feed">
      {#each fx.feed as f (f.id)}
        <div class="kf" class:undone={f.undone} in:fly={{ x: -100, duration: 220 }} out:fade={{ duration: 160 }}>
          <b style="background:{colorDef(room.players.find((p) => p.id === f.shooter)?.color ?? '').hex}">{name(f.shooter)}</b> ▸
          <b style="background:{colorDef(room.players.find((p) => p.id === f.victim)?.color ?? '').hex}">{name(f.victim)}</b>
        </div>
      {/each}
    </div>

    <!-- Botones de cada jugador -->
    <div class="controls">
      {#each [pa, pb] as p}
        {@const c = colorDef(p.color)}
        <div class="col" style="--c:{c.hex};--i:{c.ink}">
          {#each actions as a}
            <button class="act" disabled={g.phase !== 'playing'} onclick={() => onCommand(a, p.id)}>
              <small>{p.name}</small>{label[a]}
            </button>
          {/each}
          <button class="undo" onclick={() => onCommand('anular', p.id)}>Anular</button>
        </div>
      {/each}
    </div>
    <button class="pause" onclick={() => onCommand('pausa')} aria-label="Pausa">
      <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
    </button>

    <!-- Efectos y superposiciones -->
    {#key fx.goKey}{#if fx.goKey}<div class="goflash"></div>{/if}{/key}
    {#key fx.boomKey}{#if fx.boomKey}<div class="boomflash"></div>{/if}{/key}
    {#if fx.banner}
      {#key fx.banner.id}
        <div class="banner" in:fly={{ x: -300, duration: 240 }} out:fade={{ duration: 160 }}>{fx.banner.title}</div>
      {/key}
    {/if}
    {#if g.phase === 'countdown'}
      <div class="ov"><span class="eyebrow">{info.name}</span>{#if cd >= 1 && cd <= 3}{#key cd}<div class="big num" in:scale={{ start: 1.8, duration: 340 }}>{cd}</div>{/key}{/if}</div>
    {/if}
    {#if g.phase === 'paused' || g.phase === 'resuming'}
      <div class="ov" transition:fade={{ duration: 150 }}>
        {#if resumeN}{#key resumeN}<div class="big num">{resumeN}</div>{/key}{:else}
          <div class="ptitle">Pausa</div>
          <button class="btn" style="max-width:300px" onclick={() => onCommand('seguir')}>Seguir</button>
        {/if}
      </div>
    {/if}
    {#if g.phase === 'intermission'}
      <div class="ov" transition:fade={{ duration: 150 }}>
        {#if interLeft <= 3000 && interLeft > 0}
          <div class="big num">{Math.ceil(interLeft / 1000)}</div>
          <span class="eyebrow">Ronda {g.round + 1}</span>
        {:else}
          <span class="eyebrow">Fin de la ronda {g.round}</span>
          <div class="ptitle small">{lastRound?.by ? `Ronda para ${name(lastRound.by)}` : 'Siguiente ronda'}</div>
        {/if}
      </div>
    {/if}
    {#if g.phase === 'finalizing'}
      <div class="confirm"><i style="width:{(confirmLeft / 5000) * 100}%"></i><span>{Math.ceil(confirmLeft / 1000)} s para anular</span></div>
    {/if}
  </div>
{/if}

<style>
  .tv {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #101010;
    color: var(--paper);
    padding-bottom: calc(var(--sab) + 10px);
    overflow: hidden;
  }
  .board {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: clamp(150px, 27vh, 240px);
  }
  .half {
    background: var(--c);
    color: var(--i);
    padding: calc(var(--sat) + 10px) 14px 10px;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .half:first-child {
    clip-path: polygon(0 0, 100% 0, 92% 100%, 0 100%);
  }
  .half:last-child {
    clip-path: polygon(8% 0, 100% 0, 100% 100%, 0 100%);
    margin-left: -8%;
    padding-left: calc(8% + 14px);
    align-items: flex-end;
    text-align: right;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 26px;
    text-transform: uppercase;
    line-height: 1;
  }
  .half:last-child .who {
    flex-direction: row-reverse;
  }
  .who :global(.av) {
    background: var(--i) !important;
  }
  .who :global(.av svg) {
    fill: var(--c) !important;
  }
  .main {
    flex: 1;
    display: flex;
    align-items: center;
    font-size: clamp(64px, 13vh, 130px);
    line-height: 0.8;
  }
  .sub {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
  }
  .rec {
    font-size: 18px;
  }
  .mid {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-align: center;
    padding: 0 16px;
  }
  .clock {
    font-size: clamp(64px, 13vh, 130px);
    line-height: 0.85;
  }
  .clock.dim {
    font-size: clamp(44px, 9vh, 84px);
    color: var(--mc);
    text-transform: uppercase;
  }
  .hot {
    color: #ff2e3a;
  }
  .call {
    font-size: clamp(120px, 26vh, 260px);
    line-height: 0.8;
    color: var(--mc);
  }
  .status {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: var(--mc);
  }
  .defuse {
    appearance: none;
    border: none;
    position: relative;
    width: min(28vh, 50vw, 200px);
    aspect-ratio: 1;
    border-radius: 50%;
    background: #1d1d1d;
    color: #fff;
    display: grid;
    place-items: center;
    font-family: var(--display);
    font-weight: 900;
    font-size: 20px;
    text-transform: uppercase;
    touch-action: none;
  }
  .defuse svg {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }
  .defuse span {
    position: relative;
    padding: 0 18%;
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
  }
  .feed {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 16px 6px;
    min-height: 26px;
  }
  .kf {
    font-family: var(--display);
    font-weight: 900;
    font-size: 18px;
    text-transform: uppercase;
  }
  .kf b {
    padding: 0 6px;
    color: #0d0d0d;
  }
  .kf.undone {
    opacity: 0.4;
    text-decoration: line-through;
  }
  .controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 0 12px;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .act {
    appearance: none;
    border: none;
    min-height: clamp(64px, 10vh, 90px);
    background: var(--c);
    color: var(--i);
    border-radius: 6px;
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(26px, 4.4vh, 36px);
    text-transform: uppercase;
    line-height: 0.95;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .act small {
    font-family: var(--body);
    font-size: 11px;
    font-weight: 800;
    opacity: 0.8;
    margin-bottom: 6px;
    line-height: 1;
  }
  .act:active {
    transform: scale(0.97);
  }
  .act:disabled {
    opacity: 0.4;
  }
  .undo {
    appearance: none;
    border: 2px solid var(--c);
    background: transparent;
    color: var(--paper);
    border-radius: 6px;
    height: 38px;
    font-family: var(--display);
    font-weight: 800;
    font-size: 17px;
    text-transform: uppercase;
  }
  .pause {
    position: absolute;
    left: 50%;
    top: calc(clamp(150px, 27vh, 240px) - 30px);
    transform: translateX(-50%);
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 4px solid #101010;
    background: var(--paper);
    display: grid;
    place-items: center;
    z-index: 5;
  }
  .pause svg {
    width: 22px;
    fill: #101010;
  }
  .ov {
    position: absolute;
    inset: 0;
    z-index: 30;
    background: rgba(13, 13, 13, 0.95);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    text-align: center;
    padding: 20px;
  }
  .big {
    font-size: min(50vh, 380px);
    line-height: 0.78;
    color: var(--mc);
  }
  .ptitle {
    font-family: var(--display);
    font-weight: 900;
    font-size: 110px;
    text-transform: uppercase;
    line-height: 0.85;
  }
  .ptitle.small {
    font-size: 56px;
  }
  .banner {
    position: absolute;
    left: -10px;
    right: -10px;
    top: 46%;
    z-index: 20;
    background: var(--paper);
    color: #0d0d0d;
    padding: 14px 20px;
    transform: rotate(-4deg);
    text-align: center;
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(30px, 6vh, 52px);
    text-transform: uppercase;
    line-height: 0.95;
    pointer-events: none;
  }
  .confirm {
    position: absolute;
    left: 0;
    right: 0;
    top: 44%;
    height: 40px;
    z-index: 25;
    background: #0d0d0d;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
  }
  .confirm i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--danger);
  }
  .confirm span {
    position: relative;
  }
  .goflash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: #fff;
    z-index: 40;
    animation: out 0.5s ease-out forwards;
  }
  .boomflash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 41;
    background: radial-gradient(circle, #fff 0%, #ffd23f 25%, #ff5a1f 55%, transparent 80%);
    animation: out 0.9s ease-out forwards;
  }
  @keyframes out {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
</style>
