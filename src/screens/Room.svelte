<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { fx, statusPhrase } from '../lib/fx.svelte';
  import { voice } from '../lib/voice/recognizer.svelte';
  import { ALL_COMMANDS, type Command } from '../lib/voice/matcher';
  import { say } from '../lib/audio/narrator';
  import { callsignOf } from '../lib/types';
  import { extraCommands } from '../lib/modes';
  import { SoloSession } from '../lib/net/session.svelte';
  import { history } from '../lib/history.svelte';
  import Lobby from './Lobby.svelte';
  import ModeScreen from './ModeScreen.svelte';
  import Game from './Game.svelte';
  import TvGame from './TvGame.svelte';

  const s = app.session!;
  const room = $derived(s.room);

  // Eventos de la partida → efectos
  const isLocal = s.kind === 'local';
  $effect(() => {
    fx.sync(room, isLocal ? '' : s.me, s.now());
  });

  // Configurar la voz con mi indicativo
  $effect(() => {
    voice.callsign = callsignOf(app.me);
    voice.others = app.opp ? [callsignOf(app.opp)] : [];
    // un móvil para los dos: escucha los dos nombres
    voice.players = isLocal && room ? room.players.map((p) => ({ pid: p.id, cs: callsignOf(p) })) : null;
    voice.allowed = [...ALL_COMMANDS, ...extraCommands(room?.mode ?? 'duelo')];
  });

  voice.onCommand = (c: Command, pid?: string) => handle(c, pid);

  /** Envía la acción como el jugador `pid` (solo en el modo de un móvil) */
  function act(pid: string | undefined, it: Parameters<typeof s.send>[0]) {
    if (isLocal && pid && s instanceof SoloSession) s.as(pid, it);
    else s.send(it);
  }

  export function handle(c: Command, pid?: string) {
    fx.confirm();
    const send = (it: Parameters<typeof s.send>[0]) => act(pid, it);
    switch (c) {
      case 'tocado':
        if (s.room?.game?.mode === 'blanco') {
          app.showToast(`En este modo di «${app.me?.name}, mía»`);
          break;
        }
        send({ t: 'hit' });
        break;
      case 'mia':
        send({ t: 'claim', at: s.now() });
        break;
      case 'bomba':
        send({ t: 'bombcan' });
        break;
      case 'anular':
        send({ t: 'undo' });
        break;
      case 'pausa':
        send({ t: 'pause' });
        break;
      case 'seguir':
        send({ t: 'resume' });
        break;
      case 'estado':
        if (s.room) say(statusPhrase(s.room, pid ?? s.me, s.now()), { interrupt: true });
        break;
    }
  }

  // Guardar cada partida terminada en el historial
  $effect(() => {
    if (room?.game?.phase === 'ended') history.save(room);
  });

  // Apagar el micro fuera de la partida (también si se termina a medias)
  let hadGame = false;
  $effect(() => {
    const g = room?.game;
    if (!room || room.screen === 'lobby' || (g && g.phase === 'ended') || (hadGame && !g)) voice.stop();
    hadGame = !!g;
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
        {#if isLocal}
          <TvGame onCommand={handle} />
        {:else}
          <Game onCommand={handle} />
        {/if}
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
