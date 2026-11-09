<script lang="ts">
  let { size = 1 }: { size?: number } = $props();
</script>

<div class="logo" style="--s:{size}">
  <svg viewBox="0 0 64 64" class="mark" aria-hidden="true">
    <path d="M12 4h40l8 8v40l-8 8H12l-8-8V12z" fill="none" stroke="var(--me)" stroke-width="3" />
    <circle cx="32" cy="32" r="14" fill="none" stroke="var(--opp)" stroke-width="3.5" />
    <path d="M32 10v12M32 42v12M10 32h12M42 32h12" stroke="var(--me)" stroke-width="3.5" />
    <circle cx="32" cy="32" r="3" fill="var(--opp)" />
  </svg>
  <div class="words">
    <span class="a">NERF</span><span class="b">ARENA</span>
  </div>
</div>

<style>
  .logo {
    display: flex;
    align-items: center;
    gap: calc(14px * var(--s));
  }
  .mark {
    width: calc(64px * var(--s));
    height: calc(64px * var(--s));
    filter: drop-shadow(0 0 10px color-mix(in srgb, var(--me) 60%, transparent));
    animation: spin-in 0.8s cubic-bezier(0.2, 0.9, 0.2, 1) both;
  }
  .words {
    display: flex;
    flex-direction: column;
    line-height: 0.82;
    font-weight: 800;
    font-size: calc(46px * var(--s));
    letter-spacing: 0.04em;
  }
  .b {
    color: var(--me);
    text-shadow: 0 0 18px color-mix(in srgb, var(--me) 70%, transparent);
  }
  @keyframes spin-in {
    from {
      transform: rotate(-90deg) scale(0.4);
      opacity: 0;
    }
  }
</style>
