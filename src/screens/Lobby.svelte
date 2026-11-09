<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { MODES } from '../lib/modes';
  import { callsignLabel } from '../lib/types';
  import { sfx } from '../lib/audio/sfx';
  import QR from '../components/QR.svelte';
  import PlayerCard from '../components/PlayerCard.svelte';
  import { voice } from '../lib/voice/recognizer.svelte';

  const s = app.session!;
  const room = $derived(s.room!);
  const me = $derived(app.me);
  const opp = $derived(app.opp);
  const joinUrl = $derived(`${location.origin}${location.pathname}?sala=${room.code}`);
  let showQR = $state(true);
  let tip = $state(!app.prefs.seenTip);

  $effect(() => {
    if (opp?.connected) showQR = false;
  });

  const cats = ['COMBATE', 'MISIÓN', 'PRÁCTICA'] as const;
</script>

<div class="screen lobby">
  <div class="head">
    <div>
      <span class="label">{s.kind === 'solo' ? 'MODO PRUEBA // 1 DISPOSITIVO' : 'SALA'}</span>
      {#if s.kind !== 'solo'}
        <button class="code" onclick={() => (showQR = !showQR)}>{room.code}<small>{showQR ? '▲' : 'QR ▼'}</small></button>
      {/if}
    </div>
    <div class="headr">
      <span class="net" class:ok={s.status === 'online'}>{s.status === 'online' ? '● ENLACE OK' : '○ ' + s.status.toUpperCase()}</span>
      <button class="link" onclick={() => app.leave()}>Salir</button>
    </div>
  </div>

  {#if showQR && s.kind === 'host'}
    <div class="qr cut panel">
      <QR text={joinUrl} size={150} />
      <div class="qrtext">
        <span class="label">Escanea con la cámara</span>
        <p>o en «Unirse» escribe</p>
        <div class="bigcode">{room.code}</div>
        {#if s.error}<p class="warn">{s.error}</p>{/if}
      </div>
    </div>
  {/if}

  <div class="players">
    <PlayerCard player={me ?? undefined} me wins={room.wins[me?.id ?? 'A'] ?? 0} />
    <div class="vs">VS</div>
    <PlayerCard player={opp ?? undefined} wins={room.wins[opp?.id ?? 'B'] ?? 0} />
  </div>

  {#if me && opp}
    <div class="score">
      <span class="label">MARCADOR DE LA SESIÓN</span>
      <div class="line">
        <span style="color:var(--me)">{callsignLabel(me.callsign)}</span>
        <b>{room.wins[me.id] ?? 0} – {room.wins[opp.id] ?? 0}</b>
        <span style="color:var(--opp)">{callsignLabel(opp.callsign)}</span>
      </div>
    </div>
  {/if}

  {#if tip}
    <div class="tip cut">
      <span><b>Consejo:</b> usad auricular con micro y subid el brillo. La app mantiene la pantalla encendida durante la partida.</span>
      <button
        class="link"
        onclick={() => {
          tip = false;
          app.prefs.seenTip = true;
          app.savePrefs();
        }}>OK</button
      >
    </div>
  {/if}

  <div class="modes">
    {#each cats as cat}
      <div class="label cat">{cat}</div>
      {#each MODES.filter((m) => m.category === cat) as m}
        <button
          class="mode cut"
          disabled={!m.available || !opp}
          onclick={() => {
            sfx.click();
            app.unlock();
            s.send({ t: 'selectMode', mode: m.id });
          }}
        >
          <span class="mcode mono">{m.code}</span>
          <span class="mname">{m.name}</span>
          <span class="msum">{m.available ? m.summary : 'Próximamente'}</span>
        </button>
      {/each}
    {/each}
  </div>

  <div class="foot">
    <button class="link" onclick={() => app.editProfile()}>✎ Perfil</button>
    <button
      class="link"
      onclick={() => {
        app.voiceTestThen = null;
        app.unlock();
        voice.start();
        app.screen = 'voicetest';
      }}>🎙 Probar voz</button
    >
  </div>
</div>

<style>
  .lobby {
    gap: 14px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .headr {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .net {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--warn);
  }
  .net.ok {
    color: var(--ok);
  }
  .code {
    display: flex;
    align-items: baseline;
    gap: 8px;
    appearance: none;
    background: none;
    border: none;
    padding: 0;
    color: var(--text);
    font-family: var(--display);
    font-size: 52px;
    font-weight: 800;
    letter-spacing: 0.12em;
    line-height: 1;
  }
  .code small {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--dim);
    letter-spacing: 0;
  }
  .qr {
    display: flex;
    gap: 16px;
    padding: 14px;
    align-items: center;
  }
  .qrtext p {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--dim);
    margin: 6px 0 0;
  }
  .bigcode {
    font-size: 56px;
    font-weight: 800;
    letter-spacing: 0.1em;
    color: var(--me);
    line-height: 1;
  }
  .warn {
    color: var(--warn) !important;
  }
  .players {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
  }
  .players :global(.card:last-child) {
    --accent: var(--opp);
  }
  .vs {
    font-size: 22px;
    font-weight: 800;
    color: var(--dim);
  }
  .score {
    text-align: center;
  }
  .score .line {
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: 14px;
    font-size: 26px;
    font-weight: 800;
    text-transform: uppercase;
  }
  .score b {
    font-size: 40px;
  }
  .tip {
    --cut: 10px;
    background: color-mix(in srgb, var(--warn) 14%, transparent);
    border-left: 3px solid var(--warn);
    padding: 10px 12px;
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.5;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .modes {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cat {
    margin-top: 6px;
  }
  .mode {
    --cut: 12px;
    appearance: none;
    text-align: left;
    border: 1px solid var(--line2);
    background: var(--panel);
    color: var(--text);
    padding: 12px 14px;
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 12px;
    font-family: var(--display);
    transition: border-color 0.15s, transform 0.08s;
  }
  .mode:not(:disabled):active {
    transform: scale(0.98);
    border-color: var(--me);
  }
  .mode:disabled {
    opacity: 0.35;
  }
  .mcode {
    grid-row: span 2;
    align-self: center;
    font-size: 12px;
    color: var(--me);
    border: 1px solid var(--me);
    padding: 6px 6px;
  }
  .mname {
    font-size: 26px;
    font-weight: 800;
    text-transform: uppercase;
    line-height: 1;
  }
  .msum {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--dim);
    margin-top: 3px;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    margin-top: auto;
  }
</style>
