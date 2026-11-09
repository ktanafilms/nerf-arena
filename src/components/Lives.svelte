<script lang="ts">
  // Segmentos de vida. El que se pierde estalla en pedazos.
  let {
    total,
    left,
    shatterKey = 0,
    shatterIndex = -1,
    size = 'big',
  }: { total: number; left: number; shatterKey?: number; shatterIndex?: number; size?: 'big' | 'small' } = $props();

  const shards = Array.from({ length: 9 }, (_, i) => ({
    x: (Math.random() - 0.5) * 220,
    y: (Math.random() - 0.7) * 200,
    r: (Math.random() - 0.5) * 540,
    w: 8 + Math.random() * 18,
    h: 6 + Math.random() * 16,
    d: i * 12,
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
    gap: 8px;
    justify-content: center;
  }
  .seg {
    position: relative;
    width: 64px;
    height: 22px;
    background: color-mix(in srgb, var(--c, var(--me)) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--c, var(--me)) 30%, transparent);
    clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
    transition: background 0.2s;
  }
  .small .seg {
    width: 26px;
    height: 10px;
    clip-path: polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%);
  }
  .small {
    gap: 4px;
    justify-content: flex-start;
  }
  .seg.on {
    background: var(--c, var(--me));
    box-shadow: 0 0 14px var(--c, var(--me));
  }
  .shatter {
    position: absolute;
    left: 50%;
    top: 50%;
    pointer-events: none;
  }
  .shatter i {
    position: absolute;
    background: var(--c, var(--me));
    box-shadow: 0 0 10px var(--c, var(--me));
    animation: shard 0.9s cubic-bezier(0.15, 0.7, 0.3, 1) forwards;
    clip-path: polygon(0 0, 100% 20%, 70% 100%);
  }
  @keyframes shard {
    from {
      transform: translate(-50%, -50%);
      opacity: 1;
    }
    to {
      transform: translate(var(--x), calc(var(--y) + 120px)) rotate(var(--r));
      opacity: 0;
    }
  }
</style>
