<script lang="ts">
  import qrcode from 'qrcode-generator';
  let { text, size = 168 }: { text: string; size?: number } = $props();

  const svg = $derived.by(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { n, d };
  });
</script>

<svg width={size} height={size} viewBox="-2 -2 {svg.n + 4} {svg.n + 4}" shape-rendering="crispEdges">
  <rect x="-2" y="-2" width={svg.n + 4} height={svg.n + 4} fill="#f4f1ea" />
  <path d={svg.d} fill="#121212" />
</svg>
