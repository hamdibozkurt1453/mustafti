/**
 * نقش هندسي إسلامي: شبكة نجمة ثمانية (مربعان متراكبان في كل خلية، وتلتقي
 * رؤوس المعيّنات بين الخلايا فتتشابك النجوم والصلبان).
 * يُرسم بخط ذهبي رفيع عند التحميل، من المركز إلى الأطراف («من السؤال إلى النور»).
 */
const T = 120; // ضلع الخلية
const COLS = 14;
const ROWS = 9;
const W = T * COLS;
const H = T * ROWS;
const R = T * 0.3; // نصف قطر النجمة
const A = R / Math.SQRT2; // نصف ضلع المربع
const h = T / 2;

const r = (n: number) => Math.round(n * 10) / 10;

type Tile = { d: string; delay: number };

/**
 * في كل خلية: نجمة ثمانية (مربع ومعيّن متراكبان) ومثمّن داخلي،
 * وخطوط تمتد من رؤوس النجمة إلى حواف الخلية وأركانها فتصل النجوم ببعضها.
 */
const tiles: Tile[] = (() => {
  const out: Tile[] = [];
  const ox = W / 2;
  const oy = H * 0.38;
  const maxDist = Math.hypot(W / 2, H * 0.62);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cx = col * T + h;
      const cy = row * T + h;
      const square = `M${r(cx - A)} ${r(cy - A)}H${r(cx + A)}V${r(cy + A)}H${r(cx - A)}Z`;
      const diamond = `M${cx} ${r(cy - R)}L${r(cx + R)} ${cy}L${cx} ${r(cy + R)}L${r(cx - R)} ${cy}Z`;
      const k = R * 0.45;
      const oct =
        Array.from({ length: 8 }, (_, i) => {
          const ang = (Math.PI / 4) * i + Math.PI / 8;
          return `${i === 0 ? "M" : "L"}${r(cx + Math.cos(ang) * k)} ${r(cy + Math.sin(ang) * k)}`;
        }).join("") + "Z";
      const links = [
        `M${r(cx + R)} ${cy}H${cx + h}`,
        `M${r(cx - R)} ${cy}H${cx - h}`,
        `M${cx} ${r(cy + R)}V${cy + h}`,
        `M${cx} ${r(cy - R)}V${cy - h}`,
        `M${r(cx + A)} ${r(cy + A)}L${cx + h} ${cy + h}`,
        `M${r(cx - A)} ${r(cy + A)}L${cx - h} ${cy + h}`,
        `M${r(cx + A)} ${r(cy - A)}L${cx + h} ${cy - h}`,
        `M${r(cx - A)} ${r(cy - A)}L${cx - h} ${cy - h}`,
      ].join("");
      const dist = Math.hypot(cx - ox, cy - oy) / maxDist;
      out.push({ d: `${square}${diamond}${oct}${links}`, delay: r(0.15 + dist * 1.5) });
    }
  }
  return out;
})();

export function GeometricPattern({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden
      focusable="false"
    >
      <g fill="none" stroke="var(--mf-gold-500)" strokeWidth="1" vectorEffect="non-scaling-stroke">
        {tiles.map((tile, i) => (
          <path
            key={i}
            d={tile.d}
            pathLength={1}
            className="mf-draw"
            style={{ animationDelay: `${tile.delay}s` }}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    </svg>
  );
}
