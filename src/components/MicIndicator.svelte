<script lang="ts">
  import { voice } from '../lib/voice/recognizer.svelte';

  let { showText = true }: { showText?: boolean } = $props();
  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });
  const recent = $derived(voice.heard && now - voice.heard.at < 2500 ? voice.heard : null);
  const bars = [0.15, 0.35, 0.55, 0.75, 0.95];
  const stateLabel: Record<string, string> = {
    listening: 'MIC',
    starting: 'MIC…',
    off: 'MIC OFF',
    denied: 'SIN PERMISO',
    unsupported: 'SIN VOZ',
    error: 'ERROR',
  };
</script>

<div class="mic" class:live={voice.state === 'listening'} class:bad={voice.state === 'denied' || voice.state === 'unsupported'}>
  <span class="dot"></span>
  <span class="st">{stateLabel[voice.state]}</span>
  <span class="bars">
    {#each bars as b}<i class:on={voice.level > b * 0.6}></i>{/each}
  </span>
  {#if showText && recent}
    <span class="heard" class:cmd={recent.cmd}>
      {#if recent.cmd}✓ {recent.cmd.toUpperCase()}{:else}«{recent.text.slice(-28)}»{/if}
    </span>
  {/if}
</div>

<style>
  .mic {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--dim);
    min-width: 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--faint);
    flex: none;
  }
  .live .dot {
    background: var(--ok);
    box-shadow: 0 0 8px var(--ok);
    animation: blink 1.6s infinite;
  }
  .bad .dot {
    background: var(--danger);
  }
  .bad .st {
    color: var(--danger);
  }
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 12px;
  }
  .bars i {
    width: 3px;
    background: var(--faint);
  }
  .bars i:nth-child(1) {
    height: 30%;
  }
  .bars i:nth-child(2) {
    height: 45%;
  }
  .bars i:nth-child(3) {
    height: 60%;
  }
  .bars i:nth-child(4) {
    height: 80%;
  }
  .bars i:nth-child(5) {
    height: 100%;
  }
  .bars i.on {
    background: var(--ok);
  }
  .heard {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text);
    max-width: 46vw;
  }
  .heard.cmd {
    color: var(--ok);
    font-weight: 700;
  }
</style>
