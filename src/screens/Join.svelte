<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { normalizeCode } from '../lib/net/session.svelte';

  let { initial = '' }: { initial?: string } = $props();
  // svelte-ignore state_referenced_locally
  let code = $state(initial);
  let input: HTMLInputElement;

  $effect(() => {
    if (!initial) input?.focus();
  });

  function go() {
    if (code.length === 4) app.join(code);
  }
</script>

<div class="screen join">
  <div class="head">
    <span class="eyebrow">Unirse</span>
    <button class="link" onclick={() => (app.screen = 'home')}>Volver</button>
  </div>

  <div class="mid stagger">
    <h1 class="display">Código<br />de sala</h1>
    <label class="boxes" for="code">
      {#each [0, 1, 2, 3] as i}
        <span class="box" class:filled={code[i]} class:cursor={code.length === i}>{code[i] ?? ''}</span>
      {/each}
    </label>
    <input
      id="code"
      bind:this={input}
      value={code}
      oninput={(e) => (code = normalizeCode((e.target as HTMLInputElement).value))}
      onkeydown={(e) => e.key === 'Enter' && go()}
      autocomplete="off"
      autocapitalize="characters"
      spellcheck="false"
      maxlength="4"
    />
    <p class="body">O apunta con la cámara del móvil al QR de la otra pantalla.</p>
  </div>

  <button class="btn" disabled={code.length !== 4} onclick={go}>Entrar</button>
</div>

<style>
  .join {
    justify-content: space-between;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .mid {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  h1 {
    font-size: 76px;
  }
  .boxes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .box {
    height: 104px;
    display: grid;
    place-items: center;
    font-family: var(--display);
    font-size: 80px;
    font-weight: 900;
    background: var(--bg-2);
    border-radius: 4px;
    border-bottom: 4px solid var(--bg-3);
  }
  .box.filled {
    background: var(--me);
    color: var(--me-ink);
    border-color: transparent;
  }
  .box.cursor {
    border-color: var(--me);
    animation: blink 1s infinite;
  }
  input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    pointer-events: none;
  }
</style>
