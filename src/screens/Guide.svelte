<script lang="ts">
  let { done }: { done: () => void } = $props();
  let i = $state(0);

  const slides = [
    {
      k: '01 / UNIRSE',
      title: 'Un móvil cada uno',
      body: 'Uno pulsa «Crear partida» y le aparece un código y un QR. El otro lo escanea con la cámara o escribe el código en «Unirse».',
      icon: 'qr',
    },
    {
      k: '02 / VOZ',
      title: 'Di tu indicativo',
      body: 'Cada orden empieza por tu indicativo: «Lobo, tocado». Tu móvil solo te obedece a ti, aunque oiga al otro. Órdenes: tocado · estado · pausa · seguir · anular.',
      icon: 'mic',
    },
    {
      k: '03 / PLAN B',
      title: 'Si la voz falla',
      body: 'Doble toque en cualquier parte = tocado. Mantener pulsado = anular. El botón de pausa siempre está visible. Usa un auricular con micro si podéis.',
      icon: 'tap',
    },
  ];
</script>

<div class="screen guide">
  <div class="head">
    <span class="label">{slides[i].k}</span>
    <button class="link" onclick={done}>Saltar</button>
  </div>

  {#key i}
    <div class="slide enter">
      <div class="icon brackets">
        {#if slides[i].icon === 'qr'}
          <svg viewBox="0 0 100 100"
            ><rect x="10" y="10" width="30" height="30" /><rect x="60" y="10" width="30" height="30" /><rect
              x="10"
              y="60"
              width="30"
              height="30"
            /><rect x="60" y="60" width="12" height="12" /><rect x="78" y="78" width="12" height="12" /><rect
              x="18"
              y="18"
              width="14"
              height="14"
              class="f"
            /><rect x="68" y="18" width="14" height="14" class="f" /><rect x="18" y="68" width="14" height="14" class="f" /></svg
          >
        {:else if slides[i].icon === 'mic'}
          <svg viewBox="0 0 100 100"
            ><rect x="38" y="12" width="24" height="46" rx="12" /><path d="M26 46c0 14 10 24 24 24s24-10 24-24M50 70v16M36 88h28" /><path
              d="M14 40v20M84 40v20M6 46v8M92 46v8"
              class="w"
            /></svg
          >
        {:else}
          <svg viewBox="0 0 100 100"
            ><circle cx="50" cy="50" r="10" class="f" /><circle cx="50" cy="50" r="22" /><circle cx="50" cy="50" r="36" class="w" /></svg
          >
        {/if}
      </div>
      <h1>{slides[i].title}</h1>
      <p>{slides[i].body}</p>
    </div>
  {/key}

  <div class="foot">
    <div class="dots">
      {#each slides as _, k}<span class:on={k === i}></span>{/each}
    </div>
    <button class="btn" onclick={() => (i < slides.length - 1 ? i++ : done())}>
      {i < slides.length - 1 ? 'Siguiente' : '¡Entendido!'}
    </button>
  </div>
</div>

<style>
  .guide {
    justify-content: space-between;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .slide {
    display: flex;
    flex-direction: column;
    gap: 18px;
    align-items: flex-start;
  }
  .icon {
    width: 140px;
    height: 140px;
    padding: 18px;
    background: var(--panel);
    border: 1px solid var(--line2);
  }
  svg {
    width: 100%;
    height: 100%;
    fill: none;
    stroke: var(--me);
    stroke-width: 4;
    filter: drop-shadow(0 0 8px color-mix(in srgb, var(--me) 60%, transparent));
  }
  svg .f {
    fill: var(--me);
  }
  svg .w {
    stroke: var(--opp);
  }
  h1 {
    font-size: 54px;
  }
  p {
    font-family: var(--mono);
    font-size: 15px;
    line-height: 1.6;
    color: var(--dim);
    margin: 0;
    text-transform: none;
  }
  .foot {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .dots {
    display: flex;
    gap: 8px;
  }
  .dots span {
    width: 28px;
    height: 4px;
    background: var(--line2);
    transition: background 0.2s;
  }
  .dots span.on {
    background: var(--me);
    box-shadow: 0 0 8px var(--me);
  }
</style>
