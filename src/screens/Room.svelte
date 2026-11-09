<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { fx, statusPhrase } from '../lib/fx.svelte';
  import { voice } from '../lib/voice/recognizer.svelte';
  import { ALL_COMMANDS, type Command } from '../lib/voice/matcher';
  import { say } from '../lib/audio/narrator';
  import Lobby from './Lobby.svelte';
  import ModeScreen from './ModeScreen.svelte';
  import Game from './Game.svelte';

  const s = app.session!;
  const room = $derived(s.room);

  // Eventos de la partida → efectos
  $effect(() => {
    fx.sync(room, s.me);
  });

  // Configurar la voz con mi indicativo
  $effect(() => {
    voice.callsign = app.me?.callsign ?? '';
    voice.others = app.opp ? [app.opp.callsign] : [];
    voice.allowed = ALL_COMMANDS;
  });

  voice.onCommand = (c: Command) => handle(c);

  export function handle(c: Command) {
    fx.confirm();
    switch (c) {
      case 'tocado':
        s.send({ t: 'hit' });
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
    <span class="label">ERROR DE ENLACE</span>
    <h1>{s.error}</h1>
    <button class="btn" onclick={() => app.leave()}>Volver al inicio</button>
  </div>
{:else if !room}
  <div class="screen center">
    <span class="label">ENLAZANDO…</span>
    <div class="spinner"></div>
    <h1>Conectando con la sala</h1>
    {#if s.error}<p class="mono err">{s.error}</p>{/if}
    <button class="link" onclick={() => app.leave()}>Cancelar</button>
  </div>
{:else if room.screen === 'game' && room.game}
  <Game onCommand={handle} />
{:else if room.screen === 'mode'}
  <ModeScreen />
{:else}
  <Lobby />
{/if}

{#if room && s.kind === 'guest' && s.status !== 'online'}
  <div class="reconnect">
    <div class="spinner"></div>
    <span>Reconectando con el host…</span>
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
    font-size: 36px;
    max-width: 340px;
  }
  .err {
    color: var(--warn);
    font-size: 12px;
  }
  .spinner {
    width: 54px;
    height: 54px;
    border: 3px solid var(--line2);
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
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 700;
    padding: 8px 14px;
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
