<script lang="ts">
  import type { Player } from '../lib/types';
  import { callsignLabel, colorHex } from '../lib/types';

  let { player, me = false, ready = false, wins = 0 }: { player?: Player; me?: boolean; ready?: boolean; wins?: number } =
    $props();
</script>

{#if player}
  <div class="card cut panel brackets" style="--accent:{colorHex(player.color)}" class:off={!player.connected}>
    <div class="top">
      <span class="label">{me ? 'TÚ' : 'RIVAL'}</span>
      <span class="status" class:ok={player.connected}>{player.connected ? (ready ? '● LISTO' : '● EN LÍNEA') : '○ SIN SEÑAL'}</span>
    </div>
    <div class="cs">{callsignLabel(player.callsign)}</div>
    <div class="bottom">
      <span class="name">{player.name || '—'}</span>
      <span class="wins">{wins}<small>V</small></span>
    </div>
    {#if ready}<div class="readybar"></div>{/if}
  </div>
{:else}
  <div class="card cut panel empty">
    <span class="label">ESPERANDO RIVAL</span>
    <div class="scan"></div>
  </div>
{/if}

<style>
  .card {
    --cut: 14px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 128px;
    overflow: hidden;
    border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  }
  .card.off {
    opacity: 0.5;
  }
  .top,
  .bottom {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .status {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--dim);
  }
  .status.ok {
    color: var(--ok);
  }
  .cs {
    font-size: 48px;
    font-weight: 800;
    text-transform: uppercase;
    color: var(--accent);
    text-shadow: 0 0 18px color-mix(in srgb, var(--accent) 60%, transparent);
    line-height: 1;
  }
  .name {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--dim);
  }
  .wins {
    font-size: 28px;
    font-weight: 800;
  }
  .wins small {
    font-size: 14px;
    color: var(--dim);
    margin-left: 2px;
  }
  .readybar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4px;
    background: var(--accent);
    box-shadow: 0 0 12px var(--accent);
  }
  .empty {
    align-items: center;
    justify-content: center;
    gap: 12px;
    border-style: dashed;
  }
  .scan {
    width: 70%;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--me), transparent);
    animation: scan 1.4s ease-in-out infinite alternate;
  }
  @keyframes scan {
    from {
      transform: translateX(-30%);
    }
    to {
      transform: translateX(30%);
    }
  }
</style>
