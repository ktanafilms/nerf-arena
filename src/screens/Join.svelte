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

  let going = false;
  function go() {
    if (code.length !== 4 || going) return;
    going = true;
    input?.blur(); // cierra el teclado
    app.join(code);
  }

  function typed(raw: string) {
    const prev = code;
    code = normalizeCode(raw);
    if (input && input.value !== code) input.value = code;
    // Al escribir la cuarta letra se entra solo (sin buscar el botón bajo el teclado)
    if (code.length === 4 && prev.length === 3) setTimeout(go, 250);
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
      oninput={(e) => typed((e.target as HTMLInputElement).value)}
      onkeydown={(e) => e.key === 'Enter' && go()}
      autocomplete="off"
      autocorrect="off"
      autocapitalize="characters"
      spellcheck="false"
      enterkeyhint="go"
      inputmode="text"
      maxlength="4"
    />
    <button class="btn" disabled={code.length !== 4} onclick={go}>Entrar</button>
    <p class="body">Al escribir la cuarta letra se entra solo. También puedes apuntar con la cámara al QR de la otra pantalla.</p>
  </div>
  <span></span>
</div>

<style>
  .join {
    justify-content: flex-start;
    gap: clamp(14px, 4vh, 40px);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .mid {
    display: flex;
    flex-direction: column;
    gap: clamp(12px, 2.6vh, 22px);
  }
  h1 {
    font-size: clamp(52px, 10vh, 76px);
  }
  .boxes {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .box {
    height: clamp(72px, 13vh, 104px);
    display: grid;
    place-items: center;
    font-family: var(--display);
    font-size: clamp(54px, 10vh, 80px);
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
    left: 0;
    top: 0;
    opacity: 0;
    width: 1px;
    height: 1px;
    font-size: 16px;
    pointer-events: none;
  }
  .boxes {
    cursor: text;
  }
</style>
