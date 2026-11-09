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
    <span class="label">ENLACE // UNIRSE A SALA</span>
    <button class="link" onclick={() => (app.screen = 'home')}>Volver</button>
  </div>

  <div class="mid">
    <h1>Código de sala</h1>
    <label class="boxes" for="code">
      {#each [0, 1, 2, 3] as i}
        <span class="box cut" class:filled={code[i]} class:cursor={code.length === i}>{code[i] ?? ''}</span>
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
    <p class="hint">O escanea el QR de la otra pantalla con la cámara del móvil.</p>
  </div>

  <button class="btn" disabled={code.length !== 4} onclick={go}>Unirse</button>
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
    gap: 20px;
    align-items: center;
  }
  h1 {
    font-size: 40px;
  }
  .boxes {
    display: flex;
    gap: 10px;
  }
  .box {
    --cut: 12px;
    width: 68px;
    height: 88px;
    display: grid;
    place-items: center;
    font-size: 64px;
    font-weight: 800;
    background: var(--panel);
    border: 1px solid var(--line2);
  }
  .box.filled {
    color: var(--me);
    border-color: var(--me);
    text-shadow: 0 0 16px var(--me);
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
  .hint {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--dim);
    text-align: center;
    max-width: 280px;
  }
</style>
