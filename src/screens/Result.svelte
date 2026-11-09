<script lang="ts">
  import { fly } from 'svelte/transition';
  import { app } from '../lib/app.svelte';
  import { fmtClock, timeline } from '../lib/fx.svelte';
  import { gameTime } from '../lib/engine/room';
  import { colorDef } from '../lib/types';
  import { modeInfo } from '../lib/modes';
  import Avatar from '../components/Avatar.svelte';

  const s = app.session!;
  const room = $derived(s.room!);
  const g = $derived(room.game!);
  const me = $derived(app.me!);
  const opp = $derived(app.opp!);
  const won = $derived(g.winner === me.id);
  const winner = $derived(room.players.find((p) => p.id === g.winner) ?? null);
  const wc = $derived(colorDef(winner?.color ?? 'naranja'));
  const iReady = $derived(!!room.ready[me.id]);
  const oppReady = $derived(!!room.ready[opp.id]);
  const duration = $derived(gameTime(g, g.endedAt ?? s.now()));

  async function copy() {
    const text = timeline(room);
    try {
      await navigator.clipboard.writeText(text);
      app.showToast('Tiempos copiados');
    } catch {
      if (navigator.share) navigator.share({ text }).catch(() => {});
      else app.showToast('No se pudo copiar');
    }
  }

  const rows = $derived([
    { k: 'Aciertos', a: g.stats[me.id]?.hits ?? 0, b: g.stats[opp.id]?.hits ?? 0, hi: true },
    { k: 'Recibidos', a: g.stats[me.id]?.taken ?? 0, b: g.stats[opp.id]?.taken ?? 0, hi: false },
    { k: 'Mejor racha', a: g.stats[me.id]?.bestStreak ?? 0, b: g.stats[opp.id]?.bestStreak ?? 0, hi: true },
    { k: 'Vidas', a: g.lives[me.id] ?? 0, b: g.lives[opp.id] ?? 0, hi: true },
  ]);
</script>

<div class="result">
  <div class="hero" style="--c:{wc.hex};--i:{wc.ink}">
    <div class="meta">
      <span>{modeInfo(g.mode).name}</span>
      <span class="num">{fmtClock(duration)}</span>
    </div>
    <div class="verdict" in:fly={{ y: 60, duration: 500 }}>{!winner ? 'Empate' : won ? 'Victoria' : 'Derrota'}</div>
    {#if winner}
      <div class="winner" in:fly={{ x: -60, duration: 450, delay: 150 }}>
        <Avatar icon={winner.icon} color={winner.color} size={48} />
        <span class="wname">{winner.name}</span>
        <span class="mvp">MVP</span>
      </div>
    {/if}
  </div>

  <div class="rest">
    <div class="stats" in:fly={{ y: 30, duration: 400, delay: 250 }}>
      <div class="sh">
        <span></span>
        <b style="color:{colorDef(me.color).hex}">{me.name}</b>
        <b style="color:{colorDef(opp.color).hex}">{opp.name}</b>
      </div>
      {#each rows as r}
        {@const best = r.hi ? Math.max(r.a, r.b) : Math.min(r.a, r.b)}
        <div class="sr">
          <span class="k">{r.k}</span>
          <b class="num" class:best={r.a === best && r.a !== r.b}>{r.a}</b>
          <b class="num" class:best={r.b === best && r.a !== r.b}>{r.b}</b>
        </div>
      {/each}
    </div>

    <div class="session">
      <span class="eyebrow">Sesión</span>
      <span class="sline">
        <b style="color:{colorDef(me.color).hex}">{me.name}</b>
        <span class="num">{room.wins[me.id] ?? 0}–{room.wins[opp.id] ?? 0}</span>
        <b style="color:{colorDef(opp.color).hex}">{opp.name}</b>
      </span>
    </div>

    <div class="actions">
      <button class="btn" class:ghost={iReady} onclick={() => app.ready(!iReady)}>
        {iReady ? (oppReady ? '¡Vamos!' : 'Esperando al rival…') : oppReady ? 'Revancha · te espera' : 'Revancha'}
      </button>
      <div class="two">
        <button class="btn ghost small" onclick={() => s.send({ t: 'toLobby' })}>Otro modo</button>
        <button class="btn ghost small" onclick={copy}>Copiar tiempos</button>
      </div>
    </div>
  </div>
</div>

<style>
  .result {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .hero {
    background: var(--c);
    color: var(--i);
    padding: calc(var(--sat) + clamp(10px, 2vh, 16px)) 18px clamp(28px, 5vh, 40px);
    clip-path: polygon(0 0, 100% 0, 100% 86%, 0 100%);
  }
  .meta {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    opacity: 0.75;
  }
  .meta .num {
    font-size: 20px;
  }
  .verdict {
    font-family: var(--display);
    font-weight: 900;
    font-size: min(22vw, 13vh, 150px);
    text-transform: uppercase;
    line-height: 0.8;
    margin: clamp(6px, 1.5vh, 14px) 0 clamp(8px, 1.6vh, 16px);
    letter-spacing: -0.01em;
  }
  .winner {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .winner :global(.av) {
    background: var(--i) !important;
  }
  .winner :global(.av svg) {
    fill: var(--c) !important;
  }
  .wname {
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(34px, 6vh, 48px);
    text-transform: uppercase;
    line-height: 1;
  }
  .mvp {
    margin-left: auto;
    background: var(--i);
    color: var(--c);
    font-family: var(--display);
    font-weight: 900;
    font-size: 24px;
    padding: 2px 12px;
    transform: skewX(-12deg);
  }
  .rest {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: clamp(8px, 1.8vh, 18px);
    padding: 0 18px calc(var(--sab) + clamp(12px, 2.5vh, 20px));
    min-height: 0;
  }
  .sh,
  .sr {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    align-items: center;
    text-align: center;
  }
  .sh {
    padding-bottom: 6px;
  }
  .sh b {
    font-family: var(--display);
    font-weight: 900;
    font-size: 22px;
    text-transform: uppercase;
  }
  .sr {
    border-top: 1px solid var(--rule);
    padding: 2px 0;
  }
  .k {
    text-align: left;
    font-size: 14px;
    font-weight: 600;
    color: var(--mute);
  }
  .sr b {
    font-size: clamp(26px, 4.6vh, 40px);
    color: var(--mute);
    opacity: 0.6;
  }
  .sr b.best {
    color: var(--paper);
    opacity: 1;
  }
  .session {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-2);
    border-radius: 6px;
    padding: 8px 12px;
  }
  .sline {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 22px;
    text-transform: uppercase;
  }
  .sline .num {
    font-size: 32px;
  }
  .actions {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .two .btn {
    font-size: 20px;
    padding: 0 8px;
    white-space: nowrap;
  }
</style>
