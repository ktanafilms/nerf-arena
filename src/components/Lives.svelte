<script lang="ts">
  // Barras de vida. La que se pierde salta en pedazos.
  let {
    total,
    left,
    shatterKey = 0,
    shatterIndex = -1,
    size = 'big',
  }: { total: number; left: number; shatterKey?: number; shatterIndex?: number; size?: 'big' | 'small' } = $props();

  const shards = Array.from({ length: 10 }, (_, i) => ({
    x: (Math.random() - 0.5) * 260,
    y: (Math.random() - 0.8) * 220,
    r: (Math.random() - 0.5) * 600,
    w: 10 + Math.random() * 22,
    h: 8 + Math.random() * 18,
    d: i * 10,
  }));
</script>

<div class="lives {size}">
  {#each Array(total) as _, i}
    <div class="seg" class:on={i < left}>
      {#if i === shatterIndex && shatterKey}
        {#key shatterKey}
          <div class="shatter">
            {#each shards as s}
              <i style="--x:{s.x}px;--y:{s.y}px;--r:{s.r}deg;width:{s.w}px;height:{s.h}px;animation-delay:{s.d}ms"></i>
            {/each}
          </div>
        {/key}
      {/if}
    </div>
  {/each}
</div>

<style>
  .lives {
    display: flex;
    gap: 10px;
  }
  .seg {
    position: relative;
    width: 70px;
    height: 20px;
    background: currentColor;
    opacity: 0.18;
    transform: skewX(-18deg);
    transition: opacity 0.2s;
  }
  .seg.on {
    opacity: 1;
  }
  .small {
    gap: 5px;
  }
  .small .seg {
    width: 22px;
    height: 9px;
  }
  .shatter {
    position: absolute;
    left: 50%;
    top: 50%;
    pointer-events: none;
    opacity: 1;
  }
  /* el hueco sigue viéndose apagado, pero los pedazos salen a plena opacidad */
  .seg:has(.shatter):not(.on) {
    opacity: 1;
    background: color-mix(in srgb, currentColor 18%, transparent);
  }
  .shatter i {
    position: absolute;
    background: currentColor;
    animation: shard 0.95s cubic-bezier(0.15, 0.7, 0.3, 1) forwards;
    clip-path: polygon(0 0, 100% 25%, 65% 100%);
  }
  @keyframes shard {
    from {
      transform: translate(-50%, -50%);
      opacity: 1;
    }
    to {
      transform: translate(var(--x), calc(var(--y) + 140px)) rotate(var(--r));
      opacity: 0;
    }
  }
</style>
