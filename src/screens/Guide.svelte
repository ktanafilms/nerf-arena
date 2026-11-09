<script lang="ts">
  let { done }: { done: () => void } = $props();
  let i = $state(0);

  const slides = [
    {
      n: '1',
      title: 'Un móvil cada uno',
      body: 'Uno crea la partida y le sale un código y un QR. El otro lo escanea con la cámara o escribe el código.',
      ex: null,
    },
    {
      n: '2',
      title: 'Habla con tu nombre',
      body: 'Empieza cada orden por tu nombre. Tu móvil solo te hace caso a ti, aunque oiga al otro.',
      ex: ['«Pablo, tocado»', '«Pablo, estado»', '«Pablo, pausa» · «seguir» · «anular»'],
    },
    {
      n: '3',
      title: 'Sin voz también vale',
      body: 'Doble toque en la pantalla = tocado. Mantener pulsado = anular. La pausa siempre está a mano. Con auricular y micro, mejor.',
      ex: null,
    },
  ];
</script>

<div class="screen guide">
  <div class="head">
    <div class="dots">
      {#each slides as _, k}<span class:on={k <= i}></span>{/each}
    </div>
    <button class="link" onclick={done}>Saltar</button>
  </div>

  {#key i}
    <div class="slide stagger">
      <div class="n num">{slides[i].n}</div>
      <h1 class="display">{slides[i].title}</h1>
      <p class="body">{slides[i].body}</p>
      {#if slides[i].ex}
        <div class="ex">
          {#each slides[i].ex as e}<span>{e}</span>{/each}
        </div>
      {/if}
    </div>
  {/key}

  <button class="btn" onclick={() => (i < slides.length - 1 ? i++ : done())}>
    {i < slides.length - 1 ? 'Siguiente' : 'A jugar'}
  </button>
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
  .dots {
    display: flex;
    gap: 6px;
  }
  .dots span {
    width: 36px;
    height: 5px;
    background: var(--bg-3);
    transform: skewX(-20deg);
    transition: background 0.2s;
  }
  .dots span.on {
    background: var(--me);
  }
  .slide {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .n {
    font-size: 200px;
    line-height: 0.75;
    color: var(--me);
  }
  h1 {
    font-size: 68px;
  }
  .body {
    font-size: 17px;
    color: var(--paper);
    opacity: 0.8;
    max-width: 30ch;
  }
  .ex {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ex span {
    align-self: flex-start;
    background: var(--bg-2);
    border-left: 4px solid var(--me);
    padding: 8px 12px;
    font-weight: 600;
    font-size: 15px;
  }
</style>
