<script lang="ts">
  let { size = 1 }: { size?: number } = $props();
</script>

<div class="wm" style="--k:{size}">
  <span class="l1">Nerf</span>
  <span class="l2"><i></i>Arena</span>
</div>

<style>
  .wm {
    font-family: var(--display);
    font-weight: 900;
    text-transform: uppercase;
    line-height: 0.8;
    font-size: calc(96px * var(--k));
    letter-spacing: -0.01em;
    display: flex;
    flex-direction: column;
  }
  .l2 {
    display: flex;
    align-items: center;
    gap: calc(10px * var(--k));
    color: var(--me);
  }
  .l2 i {
    display: inline-block;
    width: calc(34px * var(--k));
    height: calc(64px * var(--k));
    background: var(--me);
    clip-path: polygon(40% 0, 100% 0, 60% 100%, 0 100%);
  }
</style>
