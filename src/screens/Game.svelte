<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { app } from '../lib/app.svelte';
  import { fx, fmtClock } from '../lib/fx.svelte';
  import { gameTime } from '../lib/engine/room';
  import { modeInfo } from '../lib/modes';
  import type { DuelConfig } from '../lib/types';
  import { colorDef } from '../lib/types';
  import Avatar from '../components/Avatar.svelte';
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
  const showGo = $derived(now >= g.startAt && now - g.startAt < 900);
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
  const mc = $derived(colorDef(me.color));
  const oc = $derived(colorDef(opp.color));
  const pcolor = (pid: string) => colorDef(room.players.find((p) => p.id === pid)?.color ?? '');
</script>

{#if g.phase === 'ended'}
  <Result />
{:else}
  <div
    class="game"
    class:critical
    style="--me:{mc.hex};--me-ink:{mc.ink};--opp:{oc.hex};--opp-ink:{oc.ink}"
    onpointerdown={down}
    onpointerup={up}
    onpointercancel={cancel}
    onpointerleave={cancel}
    role="application"
  >
    <div class="hud" bind:this={hud}>
      <!-- Rival: franja superior en su color -->
      <div class="oppband">
        <div class="obl">
          <div class="oname">
            <Avatar icon={opp.icon} color={opp.color} size={34} />
            <span>{opp.name}</span>
          </div>
          <Lives total={cfg.lives} left={oppLives} size="small" />
        </div>
        <div class="onum num">{oppLives}</div>
        {#if !opp.connected}<div class="nosig">Sin conexión</div>{/if}
      </div>

      <!-- Datos -->
      <div class="meta">
        <span class="rec num">● {fmtClock(realClock, true)}</span>
        <MicIndicator />
      </div>

      <!-- Tiempo -->
      <div class="timer" class:low={lowTime}>
        {#if g.suddenDeath}
          <span class="sd">Muerte súbita</span>
        {:else if remaining !== null}
          <span class="tval num">{fmtClock(remaining)}</span>
        {:else}
          <span class="tval num dimv">{fmtClock(gt)}</span>
        {/if}
      </div>

      <!-- Dorsal: mis vidas -->
      <div class="dorsal">
        {#key myLives}
          <div class="mnum num" in:scale={{ start: 1.35, duration: 320 }}>{myLives}</div>
        {/key}
        <Lives total={cfg.lives} left={myLives} shatterKey={fx.hurtKey} shatterIndex={fx.shatterIndex} />
      </div>

      <div class="mine">
        <span class="myname">{me.name}</span>
        {#if cfg.oneInChamber}<span class="variant">Una en la recámara</span>{/if}
        {#if cfg.confirmedKill}<span class="variant">Baja confirmada</span>{/if}
      </div>

      {#if bot}
        <div class="botpanel nogesture">
          <span>Rival simulado</span>
          <button onclick={() => bot.bot({ t: 'hit' })}>Le doy</button>
          <button onclick={() => bot.bot({ t: 'undo' })}>Anula</button>
          <button onclick={() => bot.bot({ t: 'pause' })}>Pausa</button>
          <button onclick={() => bot.bot({ t: 'resume' })}>Sigue</button>
        </div>
      {/if}

      <div class="foot">
        {#if fx.feed.length}
          <div class="feed">
            {#each fx.feed as f (f.id)}
              {@const a = pcolor(f.shooter)}
              {@const b = pcolor(f.victim)}
              <div class="kf" class:undone={f.undone} in:fly={{ x: -140, duration: 260 }} out:fade={{ duration: 200 }}>
                <span style="background:{a.hex};color:{a.ink}">{app.label(f.shooter)}</span>
                <svg viewBox="0 0 24 24"><path d="M4 12h12M12 6l6 6-6 6" /></svg>
                <span style="background:{b.hex};color:{b.ink}">{app.label(f.victim)}</span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="hint">Doble toque: tocado<br />Mantener: anular</div>
        {/if}
        <button class="pausebtn" onclick={() => onCommand('pausa')} aria-label="Pausa">
          <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
        </button>
      </div>
    </div>

    <!-- Efectos -->
    {#if critical}<div class="vignette"></div>{/if}
    {#key fx.hurtKey}{#if fx.hurtKey}<div class="hurtflash"></div>{/if}{/key}
    {#key fx.flashKey}{#if fx.flashKey}<div class="confirmflash"></div>{/if}{/key}
    {#key fx.goKey}{#if fx.goKey}<div class="goflash"></div>{/if}{/key}
    {#key fx.hitKey}
      {#if fx.hitKey}
        <div class="hitmarker">
          <svg viewBox="0 0 100 100"><path d="M18 18l24 24M82 18L58 42M18 82l24-24M82 82L58 58" /></svg>
          <span class="plus num">+1</span>
        </div>
      {/if}
    {/key}
    {#if holding}
      <div class="holdring" style="left:{holding.x}px;top:{holding.y}px"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" /></svg></div>
    {/if}

    {#if fx.banner}
      {#key fx.banner.id}
        <div class="banner {fx.banner.tone}" in:fly={{ x: -320, duration: 260 }} out:fly={{ x: 320, duration: 200 }}>
          <div class="btitle">{fx.banner.title}</div>
          {#if fx.banner.sub}<div class="bsub">{fx.banner.sub}</div>{/if}
        </div>
      {/key}
    {/if}

    <!-- Cuenta atrás de inicio -->
    {#if g.phase === 'countdown'}
      <div class="overlay dark">
        {#if cd >= 1 && cd <= 3}
          {#key cd}<div class="cdn num" in:scale={{ start: 1.8, duration: 360 }}>{cd}</div>{/key}
        {/if}
        <span class="eyebrow">{cd > 3 ? 'Sincronizando' : 'Preparados'}</span>
      </div>
    {/if}
    {#if showGo}
      <div class="overlay go" out:fade={{ duration: 300 }}><div class="gotext">¡Ya!</div></div>
    {/if}

    <!-- Pausa -->
    {#if g.phase === 'paused' || g.phase === 'resuming'}
      <div class="overlay dark" transition:fade={{ duration: 160 }}>
        {#if g.phase === 'resuming'}
          {#key resumeN}<div class="cdn num" in:scale={{ start: 1.8, duration: 340 }}>{resumeN}</div>{/key}
          <span class="eyebrow">Seguimos</span>
        {:else}
          <div class="ptitle">Pausa</div>
          <p class="pwho">
            {g.pauseReason === 'desconexión'
              ? 'Se ha perdido la conexión con el otro móvil'
              : `La ha pedido ${app.label([...g.events].reverse().find((e) => e.kind === 'pause')?.by)}`}
          </p>
          {#if opp.connected}
            <button class="btn" style="max-width:320px" onclick={() => onCommand('seguir')}>Seguir</button>
            <span class="say">o di «{me.name}, seguir»</span>
          {:else}
            <span class="say">Seguirá sola cuando vuelva la conexión.</span>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- Confirmación de baja -->
    {#if g.phase === 'finalizing'}
      <div class="confirmbar nogesture">
        <div class="cbfill" style="width:{(confirmLeft / (cfg.confirmedKill ? 10000 : 5000)) * 100}%"></div>
        <span>
          {Math.ceil(confirmLeft / 1000)} s ·
          {g.winner === me.id ? 'el rival aún puede anular' : `di «${me.name}, anular» o mantén pulsado`}
        </span>
      </div>
    {/if}

    {#if (voice.state === 'off' || voice.state === 'tap') && (playing || g.phase === 'countdown')}
      <button class="micoff nogesture" onclick={() => voice.start()}>Toca para activar el micro</button>
    {:else if (voice.state === 'denied' || voice.state === 'unavailable') && g.phase === 'countdown'}
      <div class="micoff nogesture">{voice.errorMsg}</div>
    {/if}
  </div>
{/if}

<style>
  .game {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    background: var(--me);
    color: var(--me-ink);
    transition:
      background 0.4s,
      color 0.4s;
  }
  .game.critical {
    background: #0d0d0d;
    color: var(--danger);
  }
  .hud {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }

  /* franja del rival */
  .oppband {
    position: relative;
    background: var(--opp);
    color: var(--opp-ink);
    padding: calc(var(--sat) + 12px) 20px 22px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    clip-path: polygon(0 0, 100% 0, 100% 78%, 0 100%);
  }
  .obl {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .oname {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 34px;
    text-transform: uppercase;
    line-height: 1;
    min-width: 0;
  }
  .oname span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .oname :global(.av) {
    background: var(--opp-ink) !important;
  }
  .oname :global(.av svg) {
    fill: var(--opp) !important;
  }
  .onum {
    font-size: 96px;
    line-height: 0.75;
    margin-bottom: -4px;
  }
  .nosig {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.75);
    color: var(--warn);
    font-weight: 800;
    text-transform: uppercase;
    animation: blink 1s infinite;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 20px 0;
    gap: 12px;
  }
  .rec {
    font-size: 20px;
    letter-spacing: 0.02em;
  }

  .timer {
    text-align: center;
    margin-top: 4px;
    margin-bottom: 10px;
  }
  .tval {
    font-size: min(12vh, 108px);
    line-height: 0.85;
  }
  .dimv {
    opacity: 0.6;
  }
  .timer.low .tval {
    animation: blink 0.5s steps(2) infinite;
  }
  .sd {
    font-family: var(--display);
    font-weight: 900;
    font-size: 54px;
    text-transform: uppercase;
    animation: blink 0.8s infinite;
  }

  /* dorsal */
  .dorsal {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }
  .mnum {
    font-size: min(40vh, 360px);
    line-height: 0.76;
    letter-spacing: -0.03em;
  }
  .critical .mnum {
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

  .foot {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px;
    padding: 0 20px calc(var(--sab) + 16px);
  }
  .hint {
    font-size: 12px;
    font-weight: 600;
    opacity: 0.6;
    line-height: 1.4;
  }
  .pausebtn {
    flex: none;
    width: 68px;
    height: 68px;
    appearance: none;
    border: none;
    border-radius: 50%;
    background: currentColor;
    display: grid;
    place-items: center;
  }
  .pausebtn svg {
    width: 30px;
    fill: var(--me);
  }
  .critical .pausebtn svg {
    fill: #0d0d0d;
  }
  .pausebtn:active {
    transform: scale(0.94);
  }

  /* killfeed */
  .feed {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    pointer-events: none;
    min-width: 0;
  }
  .kf {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #0d0d0d;
    padding: 3px;
    color: var(--paper);
  }
  .kf span {
    font-family: var(--display);
    font-weight: 900;
    font-size: 20px;
    text-transform: uppercase;
    padding: 1px 8px;
    line-height: 1.1;
  }
  .kf svg {
    width: 18px;
    fill: none;
    stroke: var(--paper);
    stroke-width: 3;
  }
  .kf.undone {
    opacity: 0.45;
  }
  .kf.undone span {
    text-decoration: line-through;
  }

  /* efectos */
  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 140px 50px rgba(255, 46, 58, 0.5);
    animation: vig 0.95s infinite;
  }
  @keyframes vig {
    0%,
    100% {
      opacity: 0.4;
    }
    12% {
      opacity: 1;
    }
    35% {
      opacity: 0.7;
    }
  }
  .hurtflash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: var(--danger);
    animation: hurt 0.6s ease-out forwards;
    mix-blend-mode: normal;
  }
  @keyframes hurt {
    0% {
      opacity: 1;
      background: #fff;
    }
    12% {
      opacity: 1;
      background: var(--danger);
    }
    100% {
      opacity: 0;
    }
  }
  .confirmflash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 0 10px currentColor;
    animation: out 0.4s ease-out forwards;
  }
  .goflash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: #fff;
    animation: out 0.5s ease-out forwards;
    z-index: 40;
  }
  @keyframes out {
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
    top: 56%;
    width: 200px;
    height: 200px;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .hitmarker svg {
    width: 100%;
    stroke: currentColor;
    stroke-width: 9;
    stroke-linecap: square;
    animation: hm 0.55s cubic-bezier(0.2, 1.6, 0.4, 1) forwards;
  }
  @keyframes hm {
    0% {
      transform: scale(1.7);
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
    left: 92%;
    top: -6%;
    font-size: 84px;
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
      transform: translate(10px, -70px) scale(1);
      opacity: 0;
    }
  }
  .holdring {
    position: fixed;
    width: 120px;
    height: 120px;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .holdring circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 8;
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
    left: -20px;
    right: -20px;
    top: 42%;
    padding: 16px 30px 18px;
    text-align: center;
    transform: rotate(-6deg);
    background: #0d0d0d;
    color: var(--paper);
    pointer-events: none;
    z-index: 30;
  }
  .banner.danger {
    background: var(--danger);
    color: #fff;
  }
  .banner.me {
    background: #0d0d0d;
    color: var(--me);
  }
  .banner.neutral {
    background: var(--paper);
    color: #0d0d0d;
  }
  .btitle {
    font-family: var(--display);
    font-weight: 900;
    font-size: 76px;
    text-transform: uppercase;
    line-height: 0.85;
  }
  .bsub {
    font-size: 14px;
    font-weight: 700;
    margin-top: 8px;
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
  .dark {
    background: rgba(13, 13, 13, 0.96);
    color: var(--paper);
  }
  .go {
    pointer-events: none;
  }
  .cdn {
    font-size: min(60vh, 460px);
    line-height: 0.76;
    color: var(--me);
  }
  .gotext {
    font-family: var(--display);
    font-weight: 900;
    font-size: min(34vh, 240px);
    text-transform: uppercase;
    line-height: 0.8;
    color: #0d0d0d;
  }
  .ptitle {
    font-family: var(--display);
    font-weight: 900;
    font-size: 140px;
    text-transform: uppercase;
    line-height: 0.8;
  }
  .pwho {
    margin: 0;
    font-size: 15px;
    color: var(--mute);
  }
  .say {
    font-size: 14px;
    color: var(--mute);
  }
  .confirmbar {
    position: absolute;
    left: 0;
    right: 0;
    top: 62%;
    height: 40px;
    background: #0d0d0d;
    color: var(--paper);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 32;
    font-size: 13px;
    font-weight: 700;
  }
  .cbfill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--danger);
  }
  .confirmbar span {
    position: relative;
  }
  .micoff {
    position: absolute;
    top: calc(var(--sat) + 140px);
    left: 20px;
    right: 20px;
    text-align: center;
    z-index: 33;
    appearance: none;
    border: none;
    background: #0d0d0d;
    color: var(--paper);
    font-family: var(--body);
    font-weight: 700;
    font-size: 13px;
    padding: 9px 14px;
    border-radius: 4px;
  }
  .botpanel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0 20px 12px;
    padding: 8px;
    background: #0d0d0d;
    color: var(--paper);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
  }
  .botpanel span {
    flex: 1 0 100%;
    color: var(--mute);
  }
  .botpanel button {
    flex: 1;
    appearance: none;
    background: var(--opp);
    color: var(--opp-ink);
    border: none;
    font-family: var(--display);
    font-weight: 900;
    font-size: 18px;
    text-transform: uppercase;
    padding: 8px 6px;
    border-radius: 3px;
  }
</style>
