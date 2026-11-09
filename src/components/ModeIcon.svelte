<script lang="ts">
  let { d, size = 48, stroke = 4 }: { d: string; size?: number; stroke?: number } = $props();
</script>

<svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
  <path {d} fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="square" stroke-linejoin="miter" />
</svg>
