<script lang="ts">
  // Todo lo que se puede sacar de una partida para montar el vídeo.
  import { fade, fly } from 'svelte/transition';
  import type { Room } from '../lib/types';
  import { app } from '../lib/app.svelte';
  import { timeline } from '../lib/fx.svelte';
  import { csv, edl, saveFiles, xmeml } from '../lib/markers';
  import HudExport from './HudExport.svelte';

  let { room, onclose }: { room: Room; onclose: () => void } = $props();
  let hud = $state(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(timeline(room));
      app.showToast('Línea de tiempo copiada');
    } catch {
      app.showToast('No se pudo copiar');
    }
  }
</script>

{#if hud}
  <HudExport {room} onclose={() => (hud = false)} />
{:else}
  <div class="sheet" transition:fade={{ duration: 120 }}>
    <div class="card" in:fly={{ y: 60, duration: 220 }}>
      <div class="head">
        <h2 class="display">Para el vídeo</h2>
        <button class="link" onclick={onclose}>Cerrar</button>
      </div>

      <button class="opt" onclick={() => (hud = true)}>
        <b>Vídeo del HUD</b>
        <small>.mov transparente con marcador y jugadas, horizontal o vertical</small>
      </button>
      <button class="opt" onclick={() => saveFiles([xmeml(room)])}>
        <b>Marcadores para Premiere</b>
        <small>XML: Archivo › Importar. Crea una secuencia con un marcador por jugada</small>
      </button>
      <button class="opt" onclick={() => saveFiles([edl(room)])}>
        <b>Marcadores para DaVinci</b>
        <small>EDL: clic derecho en la línea de tiempo › Marcadores › Importar EDL</small>
      </button>
      <button class="opt" onclick={() => saveFiles([csv(room)])}>
        <b>Lista de jugadas (CSV)</b>
        <small>Para hoja de cálculo o cualquier editor</small>
      </button>
      <button class="opt" onclick={copy}>
        <b>Copiar línea de tiempo</b>
        <small>Texto con minuto y jugada, también vale para capítulos de YouTube</small>
      </button>
      <p class="note">Los marcadores cuentan desde el inicio del vídeo del HUD: el ¡YA! está en el segundo 3.</p>
    </div>
  </div>
{/if}

<style>
  .sheet {
    position: fixed;
    inset: 0;
    z-index: 130;
    background: rgba(10, 10, 10, 0.88);
    display: flex;
    align-items: flex-end;
  }
  .card {
    width: 100%;
    background: var(--bg-2);
    border-radius: 12px 12px 0 0;
    padding: 20px 20px calc(var(--sab) + 20px);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  h2 {
    font-size: 44px;
  }
  .opt {
    appearance: none;
    border: none;
    text-align: left;
    background: var(--bg-3);
    color: var(--paper);
    border-radius: 6px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    box-shadow: inset 4px 0 0 var(--me);
  }
  .opt b {
    font-family: var(--display);
    font-weight: 900;
    font-size: 22px;
    text-transform: uppercase;
    line-height: 1;
  }
  .opt small {
    font-size: 12px;
    color: var(--mute);
  }
  .opt:active {
    transform: scale(0.98);
  }
  .note {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--mute);
  }
</style>
