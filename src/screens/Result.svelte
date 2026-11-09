<script lang="ts">
  import { fly, scale } from 'svelte/transition';
  import { app } from '../lib/app.svelte';
  import { fmtClock, timeline } from '../lib/fx.svelte';
  import { gameTime } from '../lib/engine/room';
  import { callsignLabel, colorHex } from '../lib/types';
  import { modeInfo } from '../lib/modes';

  const s = app.session!;
  const room = $derived(s.room!);
  const g = $derived(room.game!);
  const me = $derived(app.me!);
  const opp = $derived(app.opp!);
  const won = $derived(g.winner === me.id);
  const draw = $derived(!g.winner);
  const winner = $derived(room.players.find((p) => p.id === g.winner));
  const iReady = $derived(!!room.ready[me.id]);
  const oppReady = $derived(!!room.ready[opp.id]);
  const duration = $derived(gameTime(g, g.endedAt ?? s.now()));

  async function copy() {
    const text = timeline(room);
    try {
      await navigator.clipboard.writeText(text);
      app.showToast('Línea de tiempo copiada');
    } catch {
      // Respaldo: compartir o mostrar
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else app.showToast('No se pudo copiar');
    }
  }

  const rows = $derived([
    { k: 'Aciertos', a: g.stats[me.id]?.hits ?? 0, b: g.stats[opp.id]?.hits ?? 0 },
    { k: 'Recibidos', a: g.stats[me.id]?.taken ?? 0, b: g.stats[opp.id]?.taken ?? 0 },
    { k: 'Racha máx.', a: g.stats[me.id]?.bestStreak ?? 0, b: g.stats[opp.id]?.bestStreak ?? 0 },
    { k: 'Vidas', a: g.lives[me.id] ?? 0, b: g.lives[opp.id] ?? 0 },
  ]);
</script>

<div class="screen result" style="--w:{winner ? colorHex(winner.color) : 'var(--text)'}">
  <div class="head">
    <span class="label">{modeInfo(g.mode).name} // FIN DE PARTIDA</span>
    <span class="label">{fmtClock(duration)}</span>
  </div>

  <div class="verdict" in:scale={{ start: 1.6, duration: 450 }}>
    {draw ? 'EMPATE' : won ? 'VICTORIA' : 'DERROTA'}
  </div>

  {#if winner}
    <div class="wcard cut" in:fly={{ y: 40, duration: 450, delay: 200 }}>
      <div class="mvp">MVP</div>
      <span class="label">GANADOR</span>
      <div class="wname">{callsignLabel(winner.callsign)}</div>
      {#if winner.name}<span class="mono wn">{winner.name}</span>{/if}
    </div>
  {/if}

  <div class="stats" in:fly={{ y: 30, duration: 400, delay: 350 }}>
    <div class="sh">
      <span></span>
      <b style="color:var(--me)">{callsignLabel(me.callsign)}</b>
      <b style="color:var(--opp)">{callsignLabel(opp.callsign)}</b>
    </div>
    {#each rows as r}
      <div class="sr">
        <span class="label">{r.k}</span>
        <b class:best={r.a > r.b && r.k !== 'Recibidos'}>{r.a}</b>
        <b class:best={r.b > r.a && r.k !== 'Recibidos'}>{r.b}</b>
      </div>
    {/each}
  </div>

  <div class="session">
    <span class="label">SESIÓN</span>
    <span class="sline">
      <span style="color:var(--me)">{callsignLabel(me.callsign)}</span>
      <b>{room.wins[me.id] ?? 0} – {room.wins[opp.id] ?? 0}</b>
      <span style="color:var(--opp)">{callsignLabel(opp.callsign)}</span>
    </span>
  </div>

  <div class="grow"></div>

  <div class="actions">
    <button class="btn" class:ghost={iReady} onclick={() => app.ready(!iReady)}>
      {iReady ? (oppReady ? '¡Vamos!' : 'Esperando revancha…') : oppReady ? '¡Revancha! (te espera)' : 'Revancha'}
    </button>
    <div class="two">
      <button class="btn ghost small" onclick={() => s.send({ t: 'toLobby' })}>Cambiar modo</button>
      <button class="btn ghost small" onclick={copy}>Copiar tiempos</button>
    </div>
  </div>
</div>

<style>
  .result {
    gap: 14px;
  }
  .head {
    display: flex;
    justify-content: space-between;
  }
  .verdict {
    font-size: min(18vh, 23vw, 130px);
    font-weight: 800;
    text-align: center;
    line-height: 0.85;
    color: var(--w);
    text-shadow: 0 0 40px var(--w);
    letter-spacing: 0.04em;
  }
  .wcard {
    --cut: 18px;
    position: relative;
    background: linear-gradient(135deg, color-mix(in srgb, var(--w) 30%, transparent), var(--panel));
    border: 1px solid var(--w);
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
  }
  .mvp {
    position: absolute;
    right: 14px;
    top: 14px;
    background: var(--w);
    color: var(--bg);
    font-weight: 800;
    font-size: 22px;
    padding: 2px 10px;
    clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  }
  .wname {
    font-size: 64px;
    font-weight: 800;
    text-transform: uppercase;
    line-height: 0.95;
  }
  .wn {
    font-size: 12px;
    color: var(--dim);
  }
  .stats {
    display: flex;
    flex-direction: column;
  }
  .sh,
  .sr {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr;
    align-items: center;
    text-align: center;
    padding: 6px 0;
  }
  .sh b {
    font-size: 20px;
    text-transform: uppercase;
  }
  .sr {
    border-top: 1px solid var(--line);
  }
  .sr .label {
    text-align: left;
  }
  .sr b {
    font-size: 34px;
    font-variant-numeric: tabular-nums;
    color: var(--dim);
  }
  .sr b.best {
    color: var(--text);
  }
  .session {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .sline {
    display: flex;
    gap: 10px;
    align-items: baseline;
    font-size: 22px;
    font-weight: 800;
    text-transform: uppercase;
  }
  .sline b {
    font-size: 30px;
  }
  .grow {
    flex: 1;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
</style>
