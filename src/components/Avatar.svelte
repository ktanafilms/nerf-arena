<script lang="ts">
  import { iconPath } from '../lib/icons';
  import { colorDef } from '../lib/types';

  let { icon, color, size = 44 }: { icon: string; color: string; size?: number } = $props();
  const c = $derived(colorDef(color));
</script>

<span class="av" style="--s:{size}px;--c:{c.hex};--i:{c.ink}">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconPath(icon)} fill-rule="evenodd" /></svg>
</span>

<style>
  .av {
    flex: none;
    width: var(--s);
    height: var(--s);
    display: inline-grid;
    place-items: center;
    background: var(--c);
    border-radius: calc(var(--s) * 0.14);
  }
  svg {
    width: 62%;
    height: 62%;
    fill: var(--i);
  }
</style>
