<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { HostSession } from '../lib/net/session.svelte';
  import Wordmark from '../components/Wordmark.svelte';
  import Avatar from '../components/Avatar.svelte';

  const saved = HostSession.savedRoom();
  const p = app.prefs.profile;
</script>

<div class="screen home">
  <div class="slab">
    <div class="slabin"><Wordmark size={1.25} /></div>
  </div>

  <div class="top"></div>

  <div class="bottom stagger">
    {#if p}
      <button class="me" onclick={() => app.editProfile()}>
        <Avatar icon={p.icon} color={p.color} size={52} />
        <span class="who">
          <span class="eyebrow">Jugador</span>
          <span class="nm">{p.name}</span>
        </span>
        <span class="edit">Editar</span>
      </button>
    {/if}
    {#if saved}
      <button class="btn ghost small" onclick={() => app.create()}>Volver a la sala {saved.code}</button>
    {/if}
    <button class="btn" onclick={() => (saved ? app.createFresh() : app.create())}>Crear partida</button>
    <button class="btn ghost" onclick={() => (app.screen = 'join')}>Unirse</button>
    <div class="links">
      <button class="link" onclick={() => app.solo()}>Probar con un rival simulado</button>
      <button class="link" onclick={() => (app.screen = 'guide')}>Cómo se juega</button>
    </div>
  </div>
</div>

<style>
  .home {
    justify-content: space-between;
    overflow: hidden;
  }
  /* Bloque de color diagonal que atraviesa la pantalla */
  .slab {
    position: absolute;
    left: -30%;
    right: -30%;
    top: 16%;
    height: 290px;
    background: var(--me);
    color: var(--me-ink);
    transform: rotate(-9deg);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: slab-in 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .slabin {
    animation: screen-in 0.5s 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .slabin :global(.l2) {
    color: var(--me-ink);
  }
  .slabin :global(.l2 i) {
    background: var(--me-ink);
  }
  @keyframes slab-in {
    from {
      transform: rotate(-9deg) translateX(-100%);
    }
  }
  .top,
  .bottom {
    position: relative;
  }
  .top {
    padding-top: 8px;
  }
  .bottom {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 460px;
    margin: 0 auto;
  }
  .me {
    appearance: none;
    border: none;
    background: var(--bg-2);
    color: var(--paper);
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 14px 10px 10px;
    border-radius: 4px;
    margin-bottom: 6px;
    text-align: left;
  }
  .who {
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .nm {
    font-family: var(--display);
    font-weight: 900;
    font-size: 30px;
    text-transform: uppercase;
    line-height: 0.95;
  }
  .edit {
    font-size: 13px;
    font-weight: 600;
    color: var(--mute);
  }
  .links {
    display: flex;
    justify-content: space-between;
  }
</style>
