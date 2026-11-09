<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { HostSession } from '../lib/net/session.svelte';
  import Logo from '../components/Logo.svelte';
  import { callsignLabel } from '../lib/types';

  const saved = HostSession.savedRoom();
  const p = app.prefs.profile;
</script>

<div class="screen home">
  <div class="top">
    <span class="label">SYS // ÁRBITRO TÁCTICO v0.1</span>
    {#if p}
      <button class="link who" onclick={() => app.editProfile()}>
        <span class="dot"></span>{callsignLabel(p.callsign)}{p.name ? ` · ${p.name}` : ''}
      </button>
    {/if}
  </div>

  <div class="hero">
    <Logo size={1.5} />
    <p class="tag">2 jugadores · 16 dardos · 0 excusas</p>
  </div>

  <div class="actions">
    {#if saved}
      <button class="btn ghost" onclick={() => app.create()}>Volver a la sala {saved.code}</button>
    {/if}
    <button class="btn" onclick={() => (saved ? app.createFresh() : app.create())}>Crear partida</button>
    <button class="btn ghost" onclick={() => (app.screen = 'join')}>Unirse</button>
    <div class="row">
      <button class="link" onclick={() => app.solo()}>▸ Probar en un solo móvil</button>
      <button class="link" onclick={() => (app.screen = 'guide')}>? Guía</button>
    </div>
  </div>
</div>

<style>
  .home {
    justify-content: space-between;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text);
  }
  .dot {
    width: 10px;
    height: 10px;
    background: var(--me);
    box-shadow: 0 0 10px var(--me);
  }
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
  }
  .tag {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.2em;
    color: var(--dim);
    text-transform: uppercase;
    margin: 0;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
  }
  .actions .btn {
    min-height: 76px;
    font-size: 30px;
  }
  .row {
    display: flex;
    justify-content: space-between;
  }
</style>
