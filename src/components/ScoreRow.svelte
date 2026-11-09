<script lang="ts">
  // Fila de marcador estilo retransmisión: icono, nombre y número en el color del jugador.
  import type { Player } from '../lib/types';
  import { colorDef } from '../lib/types';
  import Avatar from './Avatar.svelte';

  let {
    player,
    value,
    tag = '',
    dim = false,
  }: { player?: Player | null; value?: number | string; tag?: string; dim?: boolean } = $props();
  const c = $derived(colorDef(player?.color ?? 'naranja'));
</script>

{#if player}
  <div class="row" class:dim class:off={!player.connected} style="--c:{c.hex};--i:{c.ink}">
    <Avatar icon={player.icon} color={player.color} size={46} />
    <div class="name">
      <span class="nm">{player.name}</span>
      {#if tag || !player.connected}<span class="tag">{player.connected ? tag : 'Sin conexión'}</span>{/if}
    </div>
    {#if value !== undefined}<div class="val num">{value}</div>{/if}
  </div>
{:else}
  <div class="row empty">
    <span class="pulse"></span>
    <div class="name"><span class="nm">Esperando rival…</span></div>
  </div>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-2);
    padding: 8px;
    padding-right: 0;
    border-radius: 4px;
    overflow: hidden;
    min-height: 62px;
  }
  .row.off {
    opacity: 0.45;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .nm {
    font-family: var(--display);
    font-weight: 900;
    font-size: 32px;
    text-transform: uppercase;
    line-height: 0.95;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tag {
    font-size: 12px;
    font-weight: 600;
    color: var(--mute);
  }
  .val {
    align-self: stretch;
    min-width: 76px;
    display: grid;
    place-items: center;
    padding: 0 14px 0 22px;
    background: var(--c);
    color: var(--i);
    font-size: 44px;
    clip-path: polygon(16px 0, 100% 0, 100% 100%, 0 100%);
    margin: -8px 0;
  }
  .empty {
    color: var(--mute);
    padding-left: 18px;
  }
  .empty .nm {
    font-size: 24px;
  }
  .pulse {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--mute);
    animation: blink 1.2s infinite;
  }
</style>
