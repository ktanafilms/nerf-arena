<script lang="ts">
  // Historial de partidas guardadas en este móvil.
  import { app } from '../lib/app.svelte';
  import { history, type SavedGame } from '../lib/history.svelte';
  import { modeInfo } from '../lib/modes';
  import { colorDef } from '../lib/types';
  import { fmtClock } from '../lib/fx.svelte';
  import { gameTime } from '../lib/engine/room';
  import ExportSheet from '../components/ExportSheet.svelte';
  import Avatar from '../components/Avatar.svelte';

  let open = $state<{ rooms: SavedGame['room'][]; current: SavedGame['room'] | null } | null>(null);
  const days = $derived(history.byDay());
  let confirmDel = $state<number | null>(null);
  const totals = $derived(history.totals());

  const when = (t: number) => new Date(t).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>

<div class="screen hist">
  <div class="head">
    <h1 class="display">Historial</h1>
    <button class="link" onclick={() => (app.screen = 'home')}>Volver</button>
  </div>

  {#if totals.length}
    <div class="totals">
      {#each totals.slice(0, 4) as t}
        <div class="tot"><b class="num">{t.wins}</b><span>{t.name}</span><small>{t.games} partidas</small></div>
      {/each}
    </div>
  {/if}

  <div class="list">
    {#if !history.games.length}
      <p class="empty">Aquí aparecerán vuestras partidas terminadas para sacar el vídeo del HUD y los marcadores cuando queráis.</p>
    {/if}
    {#each days as d (d.day)}
      <div class="dayhead">
        <span>{d.label}</span>
        {#if d.games.length > 1}
          <button class="dayvid" onclick={() => (open = { rooms: d.games.map((x) => x.room).reverse(), current: null })}>
            Vídeo del día · {d.games.length}
          </button>
        {/if}
      </div>
    {#each d.games as s (s.id)}
      {@const g = s.room.game!}
      {@const w = s.room.players.find((p) => p.id === g.winner)}
      {@const mi = modeInfo(g.mode)}
      <div class="item" style="--mc:{mi.color}">
        <button class="main" onclick={() => (open = { rooms: history.sessionOf(s.room), current: s.room })}>
          <span class="mode">{mi.name}</span>
          <span class="vs">
            {#each s.room.players as p, i}
              {#if i}<i>vs</i>{/if}
              <Avatar icon={p.icon} color={p.color} size={20} />
              <b style="color:{colorDef(p.color).hex}">{p.name}</b>
            {/each}
          </span>
          <span class="meta">{when(g.startAt)} · {fmtClock(gameTime(g, g.endedAt ?? g.startAt))} · {w ? `ganó ${w.name}` : 'empate'}</span>
        </button>
        {#if confirmDel === s.id}
          <button class="del sure" onclick={() => (history.remove(s.id), (confirmDel = null))}>Borrar</button>
        {:else}
          <button class="del" onclick={() => (confirmDel = s.id)} aria-label="Borrar">✕</button>
        {/if}
      </div>
    {/each}
    {/each}
  </div>
</div>

{#if open}
  <ExportSheet rooms={open.rooms} current={open.current} onclose={() => (open = null)} />
{/if}

<style>
  .hist {
    gap: 12px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h1 {
    font-size: 64px;
  }
  .totals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 6px;
  }
  .tot {
    background: var(--bg-2);
    border-radius: 6px;
    padding: 8px;
    display: flex;
    flex-direction: column;
  }
  .tot b {
    font-size: 40px;
    line-height: 0.9;
  }
  .tot span {
    font-family: var(--display);
    font-weight: 900;
    text-transform: uppercase;
    font-size: 18px;
  }
  .tot small {
    font-size: 11px;
    color: var(--mute);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .dayhead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--mute);
  }
  .dayvid {
    appearance: none;
    border: none;
    background: var(--me);
    color: var(--me-ink);
    font-family: var(--display);
    font-weight: 900;
    font-size: 15px;
    text-transform: uppercase;
    padding: 5px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .list > * {
    flex: none;
  }
  .empty {
    color: var(--mute);
    font-size: 15px;
    line-height: 1.4;
  }
  .item {
    display: flex;
    align-items: stretch;
    background: var(--bg-2);
    border-radius: 6px;
    box-shadow: inset 4px 0 0 var(--mc);
  }
  .main {
    flex: 1;
    appearance: none;
    border: none;
    background: none;
    color: var(--paper);
    text-align: left;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .mode {
    font-family: var(--display);
    font-weight: 900;
    font-size: 22px;
    text-transform: uppercase;
    color: var(--mc);
    line-height: 1;
  }
  .vs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 18px;
    text-transform: uppercase;
  }
  .vs i {
    font-style: normal;
    font-size: 12px;
    color: var(--mute);
  }
  .meta {
    font-size: 12px;
    color: var(--mute);
  }
  .del {
    appearance: none;
    border: none;
    background: none;
    color: var(--mute);
    width: 44px;
    font-size: 16px;
  }
  .del.sure {
    width: auto;
    padding: 0 12px;
    background: var(--danger);
    color: #fff;
    font-weight: 800;
    border-radius: 0 6px 6px 0;
  }
</style>
