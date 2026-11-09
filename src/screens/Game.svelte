<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { app } from '../lib/app.svelte';
  import { fx, fmtClock } from '../lib/fx.svelte';
  import { gameTime } from '../lib/engine/room';
  import { modeInfo } from '../lib/modes';
  import type { DuelConfig } from '../lib/types';
  import { callsignLabel, colorHex } from '../lib/types';
  import type { Command } from '../lib/voice/matcher';
  import { sfx, vibrate } from '../lib/audio/sfx';
  import { say } from '../lib/audio/narrator';
  import { voice } from '../lib/voice/recognizer.svelte';
  import { SoloSession } from '../lib/net/session.svelte';
  import MicIndicator from '../components/MicIndicator.svelte';
  import Lives from '../components/Lives.svelte';
  import Result from './Result.svelte';

  let { onCommand }: { onCommand: (c: Command) => void } = $props();

  const s = app.session!;
  const room = $derived(s.room!);
  const g = $derived(room.game!);
  const cfg = $derived(g.config as DuelConfig);
  const me = $derived(app.me!);
  const opp = $derived(app.opp!);
  const myLives = $derived(g.lives[me.id] ?? 0);
  const oppLives = $derived(g.lives[opp.id] ?? 0);

  // Reloj a 60 fps
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
  const remaining = $derived(cfg.timeLimitSec > 0 ? Math.max(0, cfg.timeLimitSec * 1000 - gt) : null);
  const cd = $derived(g.phase === 'countdown' ? Math.ceil((g.startAt - now) / 1000) : 0);
  const showGo = $derived(now >= g.startAt && now - g.startAt < 900 && g.events.length <= 2);
  const resumeN = $derived(g.phase === 'resuming' && g.resumeAt ? Math.max(1, Math.ceil((g.resumeAt - now) / 1000)) : 0);
  const confirmLeft = $derived(g.phase === 'finalizing' && g.finalizeAt ? Math.max(0, g.finalizeAt - now) : 0);
  const playing = $derived(g.phase === 'playing');
  const critical = $derived((playing || g.phase === 'resuming') && (myLives === 1 || g.suddenDeath));
  const lowTime = $derived(remaining !== null && remaining < 30000 && playing);
  const realClock = $derived(Math.max(0, now - g.startAt)); // reloj real desde ¡YA! (para edición)

  // Cuenta atrás 3-2-1 con pitidos y voz
  let lastCd = 0;
  $effect(() => {
    const n = cd > 3 ? 0 : cd;
    if (n !== lastCd && n >= 1 && n <= 3) {
      sfx.countdown();
      say(['', 'Uno', 'Dos', 'Tres'][n], { interrupt: true, rate: 1.2 });
      vibrate(40);
    }
    lastCd = n;
  });
  let lastResume = 0;
  $effect(() => {
    if (resumeN !== lastResume && resumeN >= 1) sfx.countdown();
    lastResume = resumeN;
  });

  // Latido en estado crítico
  $effect(() => {
    if (!critical) return;
    sfx.heartbeat();
    const t = setInterval(() => {
      sfx.heartbeat();
      vibrate([30, 180, 30]);
    }, 950);
    return () => clearInterval(t);
  });

  // Temblor de pantalla al recibir impacto
  let hud = $state<HTMLElement>();
  let lastHurt = fx.hurtKey;
  $effect(() => {
    const k = fx.hurtKey;
    if (k !== lastHurt && hud) {
      hud.animate(
        [
          { transform: 'translate(0,0)' },
          { transform: 'translate(-14px, 8px) rotate(-1deg)' },
          { transform: 'translate(12px,-10px) rotate(1deg)' },
          { transform: 'translate(-9px, 6px)' },
          { transform: 'translate(7px,-4px)' },
          { transform: 'translate(-3px, 2px)' },
          { transform: 'translate(0,0)' },
        ],
        { duration: 450, easing: 'ease-out' },
      );
    }
    lastHurt = k;
  });

  // ─── Plan B táctil: doble toque = tocado, mantener = anular ───
  let lastTap = 0;
  let press: { x: number; y: number; t: number; timer: ReturnType<typeof setTimeout> } | null = null;
  let holding = $state<{ x: number; y: number } | null>(null);

  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button, .nogesture')) return;
    const x = e.clientX,
      y = e.clientY;
    holding = { x, y };
    press = {
      x,
      y,
      t: Date.now(),
      timer: setTimeout(() => {
        holding = null;
        press = null;
        lastTap = 0;
        onCommand('anular');
      }, 800),
    };
  }
  function up(e: PointerEvent) {
    if (!press) return;
    clearTimeout(press.timer);
    holding = null;
    const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    const short = Date.now() - press.t < 300;
    press = null;
    if (!short || moved > 30) return;
    const t = Date.now();
    if (t - lastTap < 380) {
      lastTap = 0;
      onCommand('tocado');
    } else lastTap = t;
  }
  function cancel() {
    if (press) clearTimeout(press.timer);
    press = null;
    holding = null;
  }

  const bot = s instanceof SoloSession ? s : null;
  const info = $derived(modeInfo(g.mode));
</script>

{#if g.phase === 'ended'}
  <Result />
{:else}
  <div
    class="game"
    class:critical
    style="--me:{colorHex(me.color)};--opp:{colorHex(opp.color)}"
    onpointerdown={down}
    onpointerup={up}
    onpointercancel={cancel}
    onpointerleave={cancel}
    role="application"
  >
    <div class="hud" bind:this={hud}>
      <!-- Barra superior -->
      <div class="topbar">
        <div class="tl">
          <span class="tag">{info.name}</span>
          <span class="clock mono">⏺ {fmtClock(realClock, true)}</span>
        </div>
        <MicIndicator />
      </div>

      <!-- Rival -->
      <div class="opp cut" style="--c:var(--opp)">
        <div class="ol">
          <span class="label">RIVAL</span>
          <span class="ocs">{callsignLabel(opp.callsign)}</span>
          <Lives total={cfg.lives} left={oppLives} size="small" />
        </div>
        <div class="onum">{oppLives}</div>
        {#if !opp.connected}<div class="nosig">SIN SEÑAL</div>{/if}
      </div>

      <!-- Tiempo -->
      <div class="timer" class:low={lowTime}>
        {#if g.suddenDeath}
          <span class="sd">MUERTE SÚBITA</span>
        {:else if remaining !== null}
          <span class="label">TIEMPO</span>
          <span class="tval">{fmtClock(remaining)}</span>
        {:else}
          <span class="label">SIN LÍMITE</span>
          <span class="tval dimv">{fmtClock(gt)}</span>
        {/if}
      </div>

      <!-- Mis vidas -->
      <div class="mine" style="--c:var(--me)">
        <span class="label">{callsignLabel(me.callsign)} // VIDAS</span>
        {#key myLives}
          <div class="mnum" in:scale={{ start: 1.4, duration: 300 }}>{myLives}</div>
        {/key}
        <Lives total={cfg.lives} left={myLives} shatterKey={fx.hurtKey} shatterIndex={fx.shatterIndex} />
        {#if cfg.oneInChamber}<span class="variant">UNA EN LA RECÁMARA</span>{/if}
        {#if cfg.confirmedKill}<span class="variant">BAJA CONFIRMADA</span>{/if}
      </div>

      <!-- Pie -->
      {#if bot}
        <div class="botpanel nogesture">
          <span class="label">BOT ({callsignLabel(opp.callsign)})</span>
          <button onclick={() => bot.bot({ t: 'hit' })}>Le doy</button>
          <button onclick={() => bot.bot({ t: 'undo' })}>Anula</button>
          <button onclick={() => bot.bot({ t: 'pause' })}>Pausa</button>
          <button onclick={() => bot.bot({ t: 'resume' })}>Sigue</button>
        </div>
      {/if}
      <div class="foot">
        <div class="hint mono">2 TOQUES = TOCADO · MANTENER = ANULAR</div>
        <button class="pausebtn" onclick={() => onCommand('pausa')} aria-label="Pausa">
          <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
        </button>
      </div>
    </div>

    <!-- Killfeed -->
    <div class="feed">
      {#each fx.feed as f (f.id)}
        <div class="kf" class:undone={f.undone} in:fly={{ x: 120, duration: 260 }} out:fade>
          <b style="color:{colorHex(room.players.find((p) => p.id === f.shooter)?.color ?? '')}">{app.label(f.shooter)}</b>
          <span class="arrow">▸</span>
          <b style="color:{colorHex(room.players.find((p) => p.id === f.victim)?.color ?? '')}">{app.label(f.victim)}</b>
        </div>
      {/each}
    </div>

    <!-- Efectos -->
    {#if critical}<div class="vignette"></div><div class="noise"></div>{/if}
    {#key fx.hurtKey}{#if fx.hurtKey}<div class="hurtflash"></div>{/if}{/key}
    {#key fx.flashKey}{#if fx.flashKey}<div class="confirmflash"></div>{/if}{/key}
    {#key fx.goKey}{#if fx.goKey}<div class="goflash"></div>{/if}{/key}
    {#key fx.hitKey}
      {#if fx.hitKey}
        <div class="hitmarker">
          <svg viewBox="0 0 100 100"><path d="M20 20l22 22M80 20L58 42M20 80l22-22M80 80L58 58" /></svg>
          <span class="plus">+1</span>
        </div>
      {/if}
    {/key}
    {#if holding}
      <div class="holdring" style="left:{holding.x}px;top:{holding.y}px"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" /></svg></div>
    {/if}

    {#if fx.banner}
      {#key fx.banner.id}
        <div class="banner {fx.banner.tone}" in:fly={{ x: -300, duration: 280 }} out:fly={{ x: 300, duration: 220 }}>
          <div class="btitle">{fx.banner.title}</div>
          {#if fx.banner.sub}<div class="bsub mono">{fx.banner.sub}</div>{/if}
        </div>
      {/key}
    {/if}

    <!-- Cuenta atrás de inicio -->
    {#if g.phase === 'countdown' && cd >= 1 && cd <= 3}
      <div class="overlay count">
        {#key cd}<div class="cdn" in:scale={{ start: 2.2, duration: 380 }}>{cd}</div>{/key}
        <span class="label">PREPARADOS</span>
      </div>
    {:else if g.phase === 'countdown'}
      <div class="overlay count"><span class="label">SINCRONIZANDO…</span></div>
    {/if}
    {#if showGo}
      <div class="overlay go" out:fade={{ duration: 300 }}><div class="cdn">¡YA!</div></div>
    {/if}

    <!-- Pausa -->
    {#if g.phase === 'paused' || g.phase === 'resuming'}
      <div class="overlay pause" transition:fade={{ duration: 160 }}>
        {#if g.phase === 'resuming'}
          {#key resumeN}<div class="cdn" in:scale={{ start: 2, duration: 350 }}>{resumeN}</div>{/key}
          <span class="label">REANUDANDO</span>
        {:else}
          <div class="ptitle">PAUSA</div>
          <span class="label">
            {g.pauseReason === 'desconexión' ? 'CONEXIÓN PERDIDA — ESPERANDO AL RIVAL' : `PAUSADO POR ${app.label([...g.events].reverse().find((e) => e.kind === 'pause')?.by)}`}
          </span>
          {#if opp.connected}
            <button class="btn" style="max-width:320px" onclick={() => onCommand('seguir')}>Seguir</button>
            <span class="mono say">o di «{callsignLabel(me.callsign)}, seguir»</span>
          {:else}
            <span class="mono say">Se reanudará sola cuando vuelva la conexión.</span>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- Confirmación de baja -->
    {#if g.phase === 'finalizing'}
      <div class="confirmbar nogesture">
        <div class="cbfill" style="width:{(confirmLeft / (cfg.confirmedKill ? 10000 : 5000)) * 100}%"></div>
        <span class="mono">
          {g.winner === me.id ? 'BAJA CONFIRMÁNDOSE' : 'ELIMINADO'} · {Math.ceil(confirmLeft / 1000)} s ·
          {g.winner === me.id ? 'el rival puede anular' : `di «${callsignLabel(me.callsign)}, anular» o mantén pulsado`}
        </span>
      </div>
    {/if}

    {#if voice.state === 'off' && (playing || g.phase === 'countdown')}
      <button class="micoff nogesture" onclick={() => voice.start()}>🎙 Activar micro</button>
    {/if}

  </div>
{/if}

<style>
  .game {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
  }
  .hud {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding: calc(var(--sat) + 10px) 16px calc(var(--sab) + 12px);
    gap: 10px;
  }

  /* barra superior */
  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .tl {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tag {
    font-weight: 800;
    font-size: 16px;
    text-transform: uppercase;
    background: var(--me);
    color: var(--bg);
    padding: 2px 8px;
    clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
  }
  .clock {
    font-size: 12px;
    color: var(--text);
  }

  /* rival */
  .opp {
    --cut: 12px;
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--opp) 22%, transparent), var(--panel));
    border-left: 4px solid var(--opp);
  }
  .ol {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ocs {
    font-size: 34px;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--opp);
    line-height: 1;
  }
  .onum {
    font-size: 84px;
    font-weight: 800;
    line-height: 0.85;
    color: var(--opp);
    text-shadow: 0 0 22px color-mix(in srgb, var(--opp) 60%, transparent);
    font-variant-numeric: tabular-nums;
  }
  .nosig {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.7);
    font-family: var(--mono);
    color: var(--warn);
    animation: blink 1s infinite;
  }

  /* tiempo */
  .timer {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .tval {
    font-size: min(17vh, 120px);
    font-weight: 800;
    line-height: 0.85;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
  .dimv {
    color: var(--dim);
  }
  .timer.low .tval {
    color: var(--warn);
    animation: blink 0.5s steps(2) infinite;
  }
  .sd {
    font-size: 54px;
    font-weight: 800;
    color: var(--danger);
    text-shadow: 0 0 24px var(--danger);
    animation: blink 0.8s infinite;
  }

  /* mis vidas */
  .mine {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 0;
  }
  .mnum {
    font-size: min(40vh, 330px);
    font-weight: 800;
    line-height: 0.8;
    color: var(--me);
    text-shadow:
      0 0 40px color-mix(in srgb, var(--me) 55%, transparent),
      0 0 4px var(--me);
    font-variant-numeric: tabular-nums;
  }
  .critical .mnum {
    color: var(--danger);
    text-shadow: 0 0 50px var(--danger);
    animation: beat 0.95s infinite;
  }
  @keyframes beat {
    0%,
    100% {
      transform: scale(1);
    }
    10% {
      transform: scale(1.07);
    }
    25% {
      transform: scale(1.02);
    }
    35% {
      transform: scale(1.06);
    }
  }
  .variant {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    color: var(--warn);
    border: 1px solid var(--warn);
    padding: 3px 8px;
  }

  /* pie */
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .hint {
    font-size: 10px;
    color: var(--faint);
    letter-spacing: 0.1em;
  }
  .pausebtn {
    flex: none;
    width: 64px;
    height: 64px;
    appearance: none;
    border: 2px solid var(--line2);
    background: var(--panel);
    clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
  }
  .pausebtn svg {
    width: 30px;
    fill: var(--text);
  }
  .pausebtn:active {
    background: var(--me);
  }

  /* killfeed */
  .feed {
    position: absolute;
    right: 12px;
    top: calc(var(--sat) + 150px);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    pointer-events: none;
  }
  .kf {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.75);
    border-right: 3px solid var(--text);
    padding: 4px 10px;
    font-size: 20px;
    text-transform: uppercase;
  }
  .kf.undone {
    opacity: 0.4;
    text-decoration: line-through;
  }
  .arrow {
    color: var(--dim);
  }

  /* efectos */
  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 120px 40px rgba(255, 30, 60, 0.55);
    animation: vig 0.95s infinite;
  }
  @keyframes vig {
    0%,
    100% {
      opacity: 0.45;
    }
    12% {
      opacity: 1;
    }
    35% {
      opacity: 0.7;
    }
  }
  .noise {
    position: absolute;
    inset: -50%;
    pointer-events: none;
    opacity: 0.07;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
    animation: grain 0.4s steps(4) infinite;
    mix-blend-mode: screen;
  }
  @keyframes grain {
    0% {
      transform: translate(0, 0);
    }
    25% {
      transform: translate(-6%, 4%);
    }
    50% {
      transform: translate(5%, -3%);
    }
    75% {
      transform: translate(-3%, -6%);
    }
  }
  .hurtflash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(circle, rgba(255, 40, 60, 0.35), rgba(255, 0, 30, 0.85));
    animation: flashout 0.6s ease-out forwards;
  }
  .confirmflash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 0 6px var(--me), inset 0 0 60px color-mix(in srgb, var(--me) 50%, transparent);
    animation: flashout 0.45s ease-out forwards;
  }
  .goflash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: #fff;
    animation: flashout 0.5s ease-out forwards;
    z-index: 40;
  }
  @keyframes flashout {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  .hitmarker {
    position: absolute;
    left: 50%;
    top: 52%;
    width: 180px;
    height: 180px;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .hitmarker svg {
    width: 100%;
    stroke: #fff;
    stroke-width: 7;
    stroke-linecap: square;
    filter: drop-shadow(0 0 10px var(--me));
    animation: hm 0.55s cubic-bezier(0.2, 1.6, 0.4, 1) forwards;
  }
  @keyframes hm {
    0% {
      transform: scale(1.6);
      opacity: 0;
    }
    20% {
      transform: scale(0.9);
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 0;
    }
  }
  .plus {
    position: absolute;
    left: 100%;
    top: 0;
    font-size: 64px;
    font-weight: 800;
    color: var(--me);
    text-shadow: 0 0 20px var(--me);
    animation: plus 1s ease-out forwards;
  }
  @keyframes plus {
    from {
      transform: translate(-30px, 20px) scale(0.6);
      opacity: 0;
    }
    20% {
      opacity: 1;
      transform: translate(0, 0) scale(1.1);
    }
    to {
      transform: translate(10px, -60px) scale(1);
      opacity: 0;
    }
  }
  .holdring {
    position: fixed;
    width: 110px;
    height: 110px;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .holdring circle {
    fill: none;
    stroke: var(--warn);
    stroke-width: 6;
    stroke-dasharray: 277;
    stroke-dashoffset: 277;
    transform: rotate(-90deg);
    transform-origin: center;
    animation: ring 0.8s linear forwards;
  }
  @keyframes ring {
    to {
      stroke-dashoffset: 0;
    }
  }

  /* banners */
  .banner {
    position: absolute;
    left: -10px;
    right: -10px;
    top: 40%;
    padding: 14px 24px;
    text-align: center;
    transform: skewY(-4deg);
    background: var(--me);
    color: var(--bg);
    pointer-events: none;
    z-index: 30;
    box-shadow: 0 0 60px color-mix(in srgb, var(--me) 60%, transparent);
  }
  .banner.danger {
    background: var(--danger);
    box-shadow: 0 0 60px var(--danger);
  }
  .banner.opp {
    background: var(--opp);
  }
  .banner.neutral {
    background: var(--text);
  }
  .btitle {
    font-size: 64px;
    font-weight: 800;
    line-height: 0.9;
  }
  .bsub {
    font-size: 13px;
    font-weight: 700;
    margin-top: 6px;
  }

  /* superposiciones */
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
    text-align: center;
    z-index: 35;
  }
  .count,
  .pause {
    background: rgba(6, 8, 11, 0.9);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  .go {
    pointer-events: none;
  }
  .cdn {
    font-size: min(50vh, 340px);
    font-weight: 800;
    line-height: 0.8;
    color: var(--me);
    text-shadow: 0 0 60px var(--me);
  }
  .go .cdn {
    font-size: min(30vh, 200px);
    color: #fff;
  }
  .ptitle {
    font-size: 110px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .say {
    font-size: 13px;
    color: var(--dim);
  }
  .confirmbar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(var(--sab) + 90px);
    height: 36px;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 32;
    font-size: 11px;
  }
  .cbfill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--danger) 45%, transparent);
  }
  .confirmbar span {
    position: relative;
  }
  .micoff {
    position: absolute;
    top: calc(var(--sat) + 44px);
    right: 12px;
    z-index: 33;
    appearance: none;
    border: 1px solid var(--warn);
    background: rgba(0, 0, 0, 0.8);
    color: var(--warn);
    font-family: var(--mono);
    font-size: 12px;
    padding: 8px 12px;
  }
  .botpanel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    background: rgba(0, 0, 0, 0.75);
    border: 1px dashed var(--opp);
    padding: 8px;
    z-index: 34;
  }
  .botpanel button {
    appearance: none;
    background: var(--opp);
    color: var(--bg);
    border: none;
    font-family: var(--display);
    font-weight: 800;
    font-size: 15px;
    text-transform: uppercase;
    padding: 6px 10px;
  }
</style>
