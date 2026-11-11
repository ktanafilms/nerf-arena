<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { HostSession } from '../lib/net/session.svelte';
  import Hero from '../components/Hero.svelte';
  import { colorHex } from '../lib/types';
  import Avatar from '../components/Avatar.svelte';
  import { account, accountsEnabled } from '../lib/account.svelte';

  const saved = HostSession.savedRoom();
  const p = app.prefs.profile;
</script>

<div class="screen home">
  <div class="top">
    {#if p}
      <button class="me" onclick={() => app.editProfile()} aria-label="Editar perfil">
        <Avatar icon={p.icon} color={p.color} size={36} />
        <span class="nm">{p.name}</span>
      </button>
    {:else}
      <span></span>
    {/if}
    <div class="tr">
      {#if accountsEnabled}
        <button class="hist" class:alert={account.warLive || account.invites} onclick={() => (app.screen = 'rivals')}>
          {account.warLive ? '¡Guerra!' : 'Rivales'}{#if account.invites && !account.warLive}<i class="dot"></i>{/if}
        </button>
      {/if}
      <button class="hist" onclick={() => (app.screen = 'history')}>Historial</button>
      <button class="help" onclick={() => (app.screen = 'guide')} aria-label="Cómo se juega">?</button>
    </div>
  </div>

  <Hero color={colorHex(p?.color ?? 'naranja')} />

  <div class="menu">
    {#if saved}
      <button class="item small" onclick={() => app.create()}>
        <span>Volver a la sala <b class="num">{saved.code}</b></span><i>›</i>
      </button>
    {/if}
    <button class="item primary" onclick={() => (saved ? app.createFresh() : app.create())}>
      <span>Crear partida</span><i>›</i>
    </button>
    <button class="item" onclick={() => (app.screen = 'join')}>
      <span>Unirse</span><i>›</i>
    </button>
    <div class="alt">
      <button class="practice" onclick={() => app.local()}>Un móvil para los dos</button>
      <button class="practice" onclick={() => app.solo()}>Practicar con rival simulado</button>
    </div>
  </div>
</div>

<style>
  .home {
    gap: 6px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    z-index: 2;
    animation: fade 0.5s 0.3s both;
  }
  .me {
    appearance: none;
    border: none;
    background: rgba(255, 255, 255, 0.06);
    color: var(--paper);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 14px 4px 4px;
    border-radius: 6px;
  }
  .nm {
    font-family: var(--display);
    font-weight: 900;
    font-size: 22px;
    text-transform: uppercase;
    line-height: 1;
  }
  .tr {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .hist {
    appearance: none;
    border: 2px solid rgba(255, 255, 255, 0.18);
    background: none;
    color: var(--paper);
    height: 40px;
    padding: 0 14px;
    border-radius: 20px;
    font-family: var(--display);
    font-weight: 900;
    font-size: 16px;
    text-transform: uppercase;
  }
  .hist.alert {
    border-color: var(--danger);
    background: var(--danger);
    color: #fff;
    animation: blink 1s steps(2) infinite;
  }
  .hist {
    position: relative;
  }
  .dot {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--danger);
  }
  .help {
    appearance: none;
    border: 2px solid rgba(255, 255, 255, 0.18);
    background: none;
    color: var(--paper);
    width: 40px;
    height: 40px;
    border-radius: 50%;
    font-family: var(--display);
    font-weight: 900;
    font-size: 20px;
  }
  .menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 460px;
    margin: 0 auto;
  }
  /* Botón de menú de juego: corte diagonal, flecha a la derecha */
  .item {
    appearance: none;
    border: none;
    position: relative;
    height: clamp(56px, 8.6vh, 70px);
    padding: 0 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-2);
    color: var(--paper);
    font-family: var(--display);
    font-weight: 900;
    font-size: clamp(26px, 4.2vh, 32px);
    text-transform: uppercase;
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
    box-shadow: inset 4px 0 0 var(--me);
    animation: slide 0.4s cubic-bezier(0.2, 0.9, 0.2, 1) both;
    transition: transform 0.08s;
  }
  .item:nth-child(1) {
    animation-delay: 0.35s;
  }
  .item:nth-child(2) {
    animation-delay: 0.42s;
  }
  .item:nth-child(3) {
    animation-delay: 0.49s;
  }
  .item i {
    font-style: normal;
    font-size: 1.3em;
    line-height: 1;
    color: var(--me);
    transition: transform 0.15s;
  }
  .item:active {
    transform: scale(0.98);
  }
  .item:active i {
    transform: translateX(4px);
  }
  .item.primary {
    background: var(--me);
    color: var(--me-ink);
    box-shadow: none;
  }
  .item.primary i {
    color: var(--me-ink);
  }
  .item.small {
    height: 48px;
    font-size: 20px;
  }
  .item.small b {
    color: var(--me);
  }
  .alt {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .practice {
    appearance: none;
    border: none;
    background: none;
    color: var(--mute);
    font-family: var(--body);
    font-weight: 600;
    font-size: 14px;
    padding: 8px 0 0;
    animation: fade 0.5s 0.6s both;
  }
  @keyframes slide {
    from {
      opacity: 0;
      transform: translateX(-30px);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
