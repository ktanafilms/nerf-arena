<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { MODES } from '../lib/modes';
  import { nameIssue } from '../lib/names';
  import { sfx } from '../lib/audio/sfx';
  import { voice } from '../lib/voice/recognizer.svelte';
  import QR from '../components/QR.svelte';
  import ScoreRow from '../components/ScoreRow.svelte';

  const s = app.session!;
  const room = $derived(s.room!);
  const me = $derived(app.me);
  const opp = $derived(app.opp);
  const joinUrl = $derived(`${location.origin}${location.pathname}?sala=${room.code}`);
  const clash = $derived(me && opp ? nameIssue(me.name, opp.name) : null);
  const blocked = $derived(!opp || clash?.level === 'error');
  let tip = $state(!app.prefs.seenTip);

  const available = MODES.filter((m) => m.available);
  const soon = MODES.filter((m) => !m.available);
</script>

<div class="screen lobby">
  <div class="head">
    <div>
      <span class="eyebrow">{s.kind === 'solo' ? 'Prueba con rival simulado' : 'Sala'}</span>
      {#if s.kind !== 'solo'}<div class="code num">{room.code}</div>{/if}
    </div>
    <div class="headr">
      {#if s.kind !== 'solo'}
        <span class="net" class:ok={s.status === 'online'}>{s.status === 'online' ? 'Conectado' : 'Conectando…'}</span>
      {/if}
      <button class="link" onclick={() => app.leave()}>Salir</button>
    </div>
  </div>

  {#if s.kind === 'host' && !opp?.connected}
    <div class="qr">
      <QR text={joinUrl} size={132} />
      <div>
        <p class="qt">Que tu rival apunte aquí con la cámara</p>
        <p class="body">o que escriba <b>{room.code}</b> en «Unirse».</p>
        {#if s.error}<p class="warn">{s.error}</p>{/if}
      </div>
    </div>
  {/if}

  <div class="board stagger">
    <ScoreRow player={me} value={room.wins[me?.id ?? 'A'] ?? 0} tag="Tú" />
    <ScoreRow player={opp} value={opp ? (room.wins[opp.id] ?? 0) : undefined} tag={s.kind === 'solo' ? 'Simulado' : 'Rival'} />
    <span class="eyebrow cap">Victorias de esta sesión</span>
  </div>

  {#if clash && opp}
    <p class="clash" class:err={clash.level === 'error'}>
      {clash.msg}
      <button class="link" onclick={() => app.editProfile()}>Cambiar mi nombre</button>
    </p>
  {/if}

  {#if tip}
    <div class="tip">
      <span>Usad auricular con micro si podéis. La pantalla no se apagará durante la partida.</span>
      <button
        class="link"
        onclick={() => {
          tip = false;
          app.prefs.seenTip = true;
          app.savePrefs();
        }}>Vale</button
      >
    </div>
  {/if}

  <div class="modes">
    <span class="eyebrow">Elige modo</span>
    {#each available as m, k}
      <button
        class="mode"
        disabled={blocked}
        style="animation-delay:{0.1 + k * 0.05}s"
        onclick={() => {
          sfx.click();
          app.unlock();
          s.send({ t: 'selectMode', mode: m.id });
        }}
      >
        <span class="mname display">{m.name}</span>
        <span class="msum">{m.summary}</span>
        <span class="arrow">→</span>
      </button>
    {/each}
    <p class="soon">Próximamente: {soon.map((m) => m.name).join(' · ')}</p>
  </div>

  <div class="foot">
    <button class="link" onclick={() => app.editProfile()}>Editar perfil</button>
    <button
      class="link"
      onclick={() => {
        app.voiceTestThen = null;
        app.unlock();
        voice.start();
        app.screen = 'voicetest';
      }}>Probar la voz</button
    >
  </div>
</div>

<style>
  .lobby {
    gap: 18px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .code {
    font-size: 72px;
    line-height: 0.85;
    letter-spacing: 0.04em;
  }
  .headr {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .net {
    font-size: 12px;
    font-weight: 600;
    color: var(--warn);
  }
  .net.ok {
    color: var(--ok);
  }
  .qr {
    display: flex;
    gap: 16px;
    align-items: center;
    background: var(--paper);
    color: var(--bg);
    padding: 12px;
    border-radius: 4px;
  }
  .qr :global(svg rect) {
    fill: var(--paper);
  }
  .qt {
    margin: 0 0 6px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 26px;
    text-transform: uppercase;
    line-height: 0.95;
  }
  .qr .body {
    color: #55524d;
    font-size: 14px;
  }
  .warn {
    color: #b45d00;
    font-size: 13px;
    margin: 6px 0 0;
  }
  .board {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .cap {
    text-align: right;
    font-size: 11px;
  }
  .clash {
    margin: 0;
    color: var(--warn);
    font-size: 14px;
    font-weight: 600;
  }
  .clash.err {
    color: var(--danger);
  }
  .clash .link {
    display: block;
    color: var(--paper);
    text-decoration: underline;
  }
  .tip {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    color: var(--paper);
    opacity: 0.85;
    border-left: 3px solid var(--me);
    padding-left: 12px;
  }
  .modes {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .mode {
    appearance: none;
    border: none;
    text-align: left;
    background: var(--bg-2);
    color: var(--paper);
    padding: 16px 18px;
    border-radius: 4px;
    display: grid;
    grid-template-columns: 1fr auto;
    column-gap: 12px;
    position: relative;
    overflow: hidden;
    animation: screen-in 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both;
    transition: transform 0.08s;
  }
  .mode::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    background: var(--me);
  }
  .mode:not(:disabled):active {
    transform: scale(0.98);
  }
  .mode:disabled {
    opacity: 0.35;
  }
  .mname {
    font-size: 44px;
  }
  .msum {
    grid-column: 1;
    font-size: 14px;
    color: var(--mute);
    margin-top: 6px;
    line-height: 1.35;
  }
  .arrow {
    grid-row: 1 / span 2;
    grid-column: 2;
    align-self: center;
    font-size: 30px;
    color: var(--me);
  }
  .soon {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--mute);
  }
  .foot {
    display: flex;
    justify-content: space-between;
    margin-top: auto;
  }
</style>
