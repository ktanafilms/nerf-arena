<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { fx, statusPhrase } from '../lib/fx.svelte';
  import { voice } from '../lib/voice/recognizer.svelte';
  import { ALL_COMMANDS, type Command } from '../lib/voice/matcher';
  import { say } from '../lib/audio/narrator';
  import { callsignOf } from '../lib/types';
  import { extraCommands } from '../lib/modes';
  import Lobby from './Lobby.svelte';
  import ModeScreen from './ModeScreen.svelte';
  import Game from './Game.svelte';

  const s = app.session!;
  const room = $derived(s.room);

  // Eventos de la partida → efectos
  $effect(() => {
    fx.sync(room, s.me, s.now());
  });

  // Configurar la voz con mi indicativo
  $effect(() => {
    voice.callsign = callsignOf(app.me);
    voice.others = app.opp ? [callsignOf(app.opp)] : [];
    voice.allowed = [...ALL_COMMANDS, ...extraCommands(room?.mode ?? 'duelo')];
  });

  voice.onCommand = (c: Command) => handle(c);

  export function handle(c: Command) {
    fx.confirm();
    switch (c) {
      case 'tocado':
        if (s.room?.game?.mode === 'blanco') {
          app.showToast(`En este modo di «${app.me?.name}, mía»`);
          break;
        }
        s.send({ t: 'hit' });
        break;
      case 'mia':
        s.send({ t: 'claim', at: s.now() });
        break;
      case 'bomba':
        s.send({ t: 'bombcan' });
        break;
      case 'anular':
        s.send({ t: 'undo' });
        break;
      case 'pausa':
        s.send({ t: 'pause' });
        break;
      case 'seguir':
        s.send({ t: 'resume' });
        break;
      case 'estado':
        if (s.room) say(statusPhrase(s.room, s.me, s.now()), { interrupt: true });
        break;
    }
  }

  // Apagar el micro fuera de la partida
  $effect(() => {
    const g = room?.game;
    if (!room || room.screen === 'lobby' || (g && g.phase === 'ended')) voice.stop();
  });
</script>

{#if s.status === 'error'}
  <div class="screen center">
    <span class="eyebrow">No se pudo conectar</span>
    <h1 class="display">{s.error}</h1>
    <button class="btn" onclick={() => app.leave()}>Volver al inicio</button>
  </div>
{:else if !room}
  <div class="screen center">
    <div class="spinner"></div>
    <h1 class="display">Entrando en la sala</h1>
    {#if s.error}<p class="err">{s.error}</p>{/if}
    <button class="link" onclick={() => app.leave()}>Cancelar</button>
  </div>
{:else}
  {#key room.screen}
    <div class="wipe"></div>
    <div class="enter" style="position:absolute;inset:0">
      {#if room.screen === 'game' && room.game}
        <Game onCommand={handle} />
      {:else if room.screen === 'mode'}
        <ModeScreen />
      {:else}
        <Lobby />
      {/if}
    </div>
  {/key}
{/if}

{#if room && s.kind === 'guest' && s.status !== 'online'}
  <div class="reconnect">
    <div class="spinner"></div>
    <span>Reconectando…</span>
  </div>
{/if}

<style>
  .center {
    justify-content: center;
    align-items: center;
    gap: 20px;
    text-align: center;
  }
  h1 {
    font-size: 48px;
    max-width: 340px;
  }
  .err {
    color: var(--warn);
    font-size: 12px;
  }
  .spinner {
    width: 54px;
    height: 54px;
    border: 4px solid var(--bg-3);
    border-top-color: var(--me);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .reconnect {
    position: fixed;
    top: calc(var(--sat) + 8px);
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--warn);
    color: var(--bg);
    font-size: 13px;
    font-weight: 700;
    padding: 8px 14px;
    border-radius: 4px;
    z-index: 90;
  }
  .reconnect .spinner {
    width: 16px;
    height: 16px;
    border-width: 2px;
    border-color: rgba(0, 0, 0, 0.3);
    border-top-color: var(--bg);
  }
</style>
