<script lang="ts">
  import { fly, fade, scale } from 'svelte/transition';
  import { app } from '../lib/app.svelte';
  import { fx, fmtClock } from '../lib/fx.svelte';
  import { gameTime } from '../lib/engine/room';
  import { LOGIC } from '../lib/engine/logic';
  import { modeInfo } from '../lib/modes';
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
  import DuelBody from '../components/hud/DuelBody.svelte';
  import ArmasBody from '../components/hud/ArmasBody.svelte';
  import BombaBody from '../components/hud/BombaBody.svelte';
  import CazadorBody from '../components/hud/CazadorBody.svelte';
  import BuscarBody from '../components/hud/BuscarBody.svelte';
  import BlancoBody from '../components/hud/BlancoBody.svelte';

  let { onCommand }: { onCommand: (c: Command) => void } = $props();

  const s = app.session!;
  const room = $derived(s.room!);
  const g = $derived(room.game!);
  const me = $derived(app.me!);
  const opp = $derived(app.opp!);

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
  const sb = $derived(LOGIC[g.mode].scoreboard(room, g));
  const oppSide = $derived(room.players[0]?.id === opp.id ? sb.A : sb.B);
  const cd = $derived(g.phase === 'countdown' ? Math.ceil((g.startAt - now) / 1000) : 0);
  const showGo = $derived(now >= g.startAt && now - g.startAt < 900);
  const resumeN = $derived(g.phase === 'resuming' && g.resumeAt ? Math.max(1, Math.ceil((g.resumeAt - now) / 1000)) : 0);
  const confirmLeft = $derived(g.phase === 'finalizing' && g.finalizeAt ? Math.max(0, g.finalizeAt - now) : 0);
  const confirmWindow = $derived(g.mode === 'duelo' && g.config.confirmedKill ? 10000 : 5000);
  const lastActor = $derived([...g.events].reverse().find((e) => ['hit', 'levelup'].includes(e.kind))?.by);
  const playing = $derived(g.phase === 'playing');
  const live = $derived(playing || g.phase === 'resuming' || g.phase === 'finalizing');
  const realClock = $derived(Math.max(0, now - g.startAt)); // reloj real desde ¡YA! (para edición)
  const interLeft = $derived(g.phase === 'intermission' && g.interUntil !== null ? Math.max(0, g.interUntil - gt) : 0);
  const interN = $derived(interLeft > 0 && interLeft <= 3000 ? Math.ceil(interLeft / 1000) : 0);
  const lastRound = $derived([...g.events].reverse().find((e) => e.kind === 'roundend'));

  // Aspecto general según el modo y la situación
  const skin = $derived.by(() => {
    const m = g.m;
    switch (g.mode) {
      case 'duelo':
        return live && (m.lives?.[me.id] === 1 || m.sudden) ? 'critical' : 'me';
      case 'armas':
        return live && (m.level?.[me.id] === 6 || m.sudden) ? 'critical' : 'me';
      case 'bomba':
        return live && m.holder === me.id ? 'alarm' : 'dark';
      case 'cazador':
        return 'dark';
      case 'buscar':
        return m.sub === 'bomb' && m.attacker === me.id ? 'alarm' : m.sub === 'bomb' ? 'me' : 'dark';
      default:
        return 'me';
    }
  });
  const critical = $derived(skin === 'critical');
  const bombPhone = $derived(g.mode === 'buscar' && g.m.attacker === me.id && g.m.sub === 'bomb');

  // Cuenta atrás 3-2-1 con pitidos y voz (inicio y entre rondas)
  let lastCd = 0;
  $effect(() => {
    const n = cd > 3 ? 0 : cd || interN;
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

  // Racha UAV del rival: mi móvil pita para delatarme
  const uavOnMe = $derived(g.phase === 'playing' && g.m.uav?.target === me.id && gt < (g.m.uav?.until ?? 0));
  $effect(() => {
    if (!uavOnMe) return;
    const t = setInterval(() => sfx.ping(), 1500);
    return () => clearInterval(t);
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

  // Temblor de pantalla al recibir impacto o explosión
  let hud = $state<HTMLElement>();
  let lastShake = fx.hurtKey + fx.boomKey * 1000;
  $effect(() => {
    const k = fx.hurtKey + fx.boomKey * 1000;
    if (k !== lastShake && hud) {
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
    lastShake = k;
  });

  // ─── Plan B táctil: doble toque = tocado (o "mía"), mantener = anular ───
  const tapCommand: Command = $derived(g.mode === 'blanco' ? 'mia' : 'tocado');
  let lastTap = 0;
  let press: { x: number; y: number; t: number; timer: ReturnType<typeof setTimeout> } | null = null;
  let holding = $state<{ x: number; y: number } | null>(null);

  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest('button, .nogesture')) return;
    if (bombPhone) return; // el móvil-bomba lo toca el rival: sin gestos
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
      onCommand(tapCommand);
    } else lastTap = t;
  }
  function cancel() {
    if (press) clearTimeout(press.timer);
    press = null;
    holding = null;
  }

  // Terminar la partida a medias (desde la pausa): pide un segundo toque
  let endArmed = $state(false);
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  function endGame() {
    if (!endArmed) {
      endArmed = true;
      endTimer = setTimeout(() => (endArmed = false), 3000);
      return;
    }
    if (endTimer) clearTimeout(endTimer);
    endArmed = false;
    s.send({ t: 'abandon' });
  }
  const offline = $derived(s.kind === 'guest' && s.status !== 'online');

  const bot = s instanceof SoloSession ? s : null;
  const info = $derived(modeInfo(g.mode));
  const mc = $derived(colorDef(me.color));
  const oc = $derived(colorDef(opp.color));
  const pcolor = (pid: string) => colorDef(room.players.find((p) => p.id === pid)?.color ?? '');
  const winnerName = (pid?: string) => room.players.find((p) => p.id === pid)?.name ?? '';
</script>

{#if g.phase === 'ended'}
  <Result />
{:else}
  <div
    class="game skin-{skin}"
    class:critical
    class:recmode={app.prefs.recordingMode}
    style="--me:{mc.hex};--me-ink:{mc.ink};--opp:{oc.hex};--opp-ink:{oc.ink};--mc:{info.color}"
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
          {#if g.mode === 'duelo'}
            <Lives total={Number(g.config.lives)} left={g.m.lives?.[opp.id] ?? 0} size="small" />
          {:else}
            <span class="osub">{oppSide.sub}</span>
          {/if}
        </div>
        <div class="onum num">{oppSide.main}</div>
        {#if !opp.connected}<div class="nosig">Sin conexión</div>{/if}
      </div>

      <!-- Datos -->
      <div class="meta">
        <span class="rec num">● {fmtClock(realClock, true)}</span>
        {#if uavOnMe}<span class="center uav">¡Te delata el UAV!</span>{:else if sb.center}<span class="center">{sb.center}</span>{/if}
        <MicIndicator />
      </div>

      <!-- Cuerpo propio de cada modo -->
      <div class="modebody">
        {#if g.mode === 'duelo'}
          <DuelBody {room} {g} {me} {gt} />
        {:else if g.mode === 'armas'}
          <ArmasBody {room} {g} {me} {gt} />
        {:else if g.mode === 'bomba'}
          <BombaBody {room} {g} {me} {opp} {gt} />
        {:else if g.mode === 'cazador'}
          <CazadorBody {room} {g} {me} {opp} {gt} />
        {:else if g.mode === 'buscar'}
          <BuscarBody {room} {g} {me} {opp} {gt} />
        {:else if g.mode === 'blanco'}
          <BlancoBody {room} {g} {me} {opp} {now} {onCommand} />
        {/if}
      </div>

      {#if bot}
        <div class="botpanel nogesture">
          {#if g.mode !== 'blanco'}<button onclick={() => bot.bot({ t: 'hit' })}>Le doy</button>{/if}
          {#if g.mode === 'blanco'}
            <button onclick={() => bot.bot({ t: 'claim', at: s.now() })}>Mía</button>
            <button onclick={() => bot.bot({ t: 'bombcan' })}>Bomba</button>
          {/if}
          {#if g.mode === 'buscar' && g.m.attacker === opp.id}
            <button onclick={() => bot.bot({ t: 'defuse' })}>Desactivo</button>
          {/if}
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
        {:else if !bombPhone}
          <div class="hint">Doble toque: {g.mode === 'blanco' ? '¡mía!' : 'tocado'}<br />Mantener: anular</div>
        {:else}
          <span></span>
        {/if}
        <button class="pausebtn" onclick={() => onCommand('pausa')} aria-label="Pausa">
          <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
        </button>
      </div>
    </div>

    <!-- Efectos -->
    {#if critical}<div class="vignette"></div>{/if}
    {#key fx.hurtKey}{#if fx.hurtKey}<div class="hurtflash"></div>{/if}{/key}
    {#key fx.boomKey}{#if fx.boomKey}<div class="boomflash"></div>{/if}{/key}
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
        <span class="eyebrow">{info.name}</span>
        {#if cd >= 1 && cd <= 3}
          {#key cd}<div class="cdn num" in:scale={{ start: 1.8, duration: 360 }}>{cd}</div>{/key}
        {/if}
        <span class="eyebrow">{cd > 3 ? 'Sincronizando' : 'Preparados'}</span>
      </div>
    {/if}
    {#if showGo}
      <div class="overlay go" out:fade={{ duration: 300 }}><div class="gotext">¡Ya!</div></div>
    {/if}

    <!-- Entre rondas -->
    {#if g.phase === 'intermission'}
      <div class="overlay dark inter" transition:fade={{ duration: 200 }}>
        {#if interN}
          {#key interN}<div class="cdn num" in:scale={{ start: 1.8, duration: 340 }}>{interN}</div>{/key}
          <span class="eyebrow">Ronda {g.round + 1}</span>
        {:else}
          <span class="eyebrow">Fin de la ronda {g.round}</span>
          <div class="ititle">
            {#if lastRound?.by}{lastRound.by === me.id ? 'Ronda para ti' : `Ronda para ${winnerName(lastRound.by)}`}{:else}Siguiente ronda{/if}
          </div>
          {#if lastRound?.reason}<p class="pwho">{lastRound.reason}</p>{/if}
          <div class="iscore">
            <span style="color:{mc.hex}">{me.name}</span>
            <b class="num">{g.mode === 'cazador' ? (g.m.survived?.[me.id] != null ? fmtClock(g.m.survived[me.id]) : '–') : (g.roundWins[me.id] ?? 0)}</b>
            <span class="dash">–</span>
            <b class="num">{g.mode === 'cazador' ? (g.m.survived?.[opp.id] != null ? fmtClock(g.m.survived[opp.id]) : '–') : (g.roundWins[opp.id] ?? 0)}</b>
            <span style="color:{oc.hex}">{opp.name}</span>
          </div>
        {/if}
      </div>
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
          <div class="pexit">
            {#if !offline}
              <button class="link" class:armed={endArmed} onclick={endGame}>{endArmed ? 'Toca otra vez para terminarla' : 'Terminar partida'}</button>
            {/if}
            {#if !opp.connected || offline}
              <button class="link" onclick={() => app.leave()}>Salir de la sala</button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Ventana para anular -->
    {#if g.phase === 'finalizing'}
      <div class="confirmbar nogesture">
        <div class="cbfill" style="width:{(confirmLeft / confirmWindow) * 100}%"></div>
        <span>
          {Math.ceil(confirmLeft / 1000)} s ·
          {lastActor === me.id ? `di «${me.name}, anular» o mantén pulsado` : 'el rival aún puede anular'}
        </span>
      </div>
    {/if}

    {#if (voice.state === 'denied' || voice.state === 'unavailable') && g.phase === 'countdown'}
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
  .critical .pausebtn svg,
  .skin-dark .pausebtn svg,
  .skin-alarm .pausebtn svg {
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
  .pexit {
    display: flex;
    gap: 22px;
    margin-top: 8px;
  }
  .pexit .armed {
    color: var(--danger);
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
    bottom: calc(var(--sab) + 100px);
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
    margin: 0 20px 8px;
    padding: 6px;
    background: #0d0d0d;
    color: var(--paper);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
  }
  .botpanel span {
    display: none;
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

  /* ── aspectos ── */
  .game.skin-dark {
    background: #101010;
    color: var(--paper);
  }
  .game.skin-alarm {
    background: #120404;
    color: #fff;
    animation: alarm 1s steps(2) infinite;
  }
  @keyframes alarm {
    50% {
      background: #3a0608;
    }
  }
  .modebody {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .center {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .center.uav {
    color: #ff2e3a;
    opacity: 1;
    animation: blink 0.7s steps(2) infinite;
  }
  .osub {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.85;
  }
  .boomflash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 41;
    background: radial-gradient(circle, #fff 0%, #ffd23f 25%, #ff5a1f 55%, transparent 80%);
    animation: boom 0.9s ease-out forwards;
  }
  @keyframes boom {
    0% {
      opacity: 1;
      transform: scale(0.3);
    }
    30% {
      opacity: 1;
      transform: scale(1.6);
    }
    100% {
      opacity: 0;
      transform: scale(2.2);
    }
  }
  .inter .ititle {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(48px, 9vh, 80px);
    text-transform: uppercase;
    line-height: 0.9;
  }
  .iscore {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 22px;
    text-transform: uppercase;
  }
  .iscore b {
    font-size: 54px;
  }
  .iscore .dash {
    opacity: 0.5;
  }
  /* ── modo grabación: solo lo que aporta en vídeo ── */
  .recmode .hint,
  .recmode .botpanel,
  .recmode .meta :global(.mic) {
    display: none;
  }
  .recmode .rec {
    font-size: 30px;
    background: #0d0d0d;
    color: #fff;
    padding: 2px 10px;
    border-radius: 4px;
  }
  .recmode .pausebtn {
    width: 52px;
    height: 52px;
    opacity: 0.55;
  }
  .recmode .oname {
    font-size: 40px;
  }
  .recmode .onum {
    font-size: 110px;
  }
</style>
