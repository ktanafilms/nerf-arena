<script lang="ts">
  // Estado de la conexión y qué hacer si falla.
  import { fade, fly } from 'svelte/transition';
  import { app } from '../lib/app.svelte';

  let { onclose }: { onclose: () => void } = $props();
  const s = app.session!;
</script>

<div class="sheet" transition:fade={{ duration: 120 }}>
  <div class="card" in:fly={{ y: 60, duration: 220 }}>
    <div class="head">
      <h2 class="display">Conexión</h2>
      <button class="link" onclick={onclose}>Cerrar</button>
    </div>

    <div class="rows">
      <div class="r"><span>Ruta en uso</span><b class:ok={s.route === 'direct'} class:mid={s.route === 'relay'}>{s.route === 'direct' ? 'Directa entre móviles' : s.route === 'relay' ? 'Por servidor (respaldo)' : 'Sin conexión con el otro móvil'}</b></div>
      <div class="r"><span>Directa</span><b>{s.diag.direct}</b></div>
      <div class="r"><span>Respaldo</span><b>{s.diag.relay}</b></div>
      {#if s.diag.rtt !== null}<div class="r"><span>Retardo</span><b class="num">{s.diag.rtt} ms</b></div>{/if}
    </div>

    <div class="tips">
      <p><b>Si no os conectáis:</b></p>
      <ol>
        <li><b>Punto de acceso:</b> uno activa «Compartir internet» (iPhone: Ajustes › Punto de acceso personal) y el otro se conecta a esa wifi. Es lo más fiable fuera de casa y en wifis que bloquean la conexión entre aparatos.</li>
        <li><b>Datos móviles en los dos:</b> la app usa sola el respaldo por servidor si la directa no va.</li>
        <li><b>Sin ninguna red:</b> usad «Un móvil para los dos» desde el inicio: un solo móvil hace de árbitro y entiende vuestros dos nombres.</li>
      </ol>
      <p class="small">Bluetooth y AirDrop no se pueden usar: Safari no deja a las webs usar Bluetooth y AirDrop solo envía archivos.</p>
    </div>
  </div>
</div>

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
    max-height: 92dvh;
    overflow-y: auto;
    background: var(--bg-2);
    border-radius: 12px 12px 0 0;
    padding: 20px 20px calc(var(--sab) + 20px);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    font-size: 44px;
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .r {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-top: 1px solid var(--rule);
    font-size: 14px;
  }
  .r span {
    color: var(--mute);
  }
  .r b {
    text-align: right;
  }
  .ok {
    color: var(--ok);
  }
  .mid {
    color: var(--warn);
  }
  .tips {
    font-size: 14px;
    line-height: 1.45;
  }
  .tips p {
    margin: 0 0 6px;
  }
  ol {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .small {
    margin-top: 10px !important;
    font-size: 12px;
    color: var(--mute);
  }
</style>
