/**
 * Botanical corner motifs, drawn as inline SVG.
 *
 * The reference template leans on watercolour florals in the corners; these are
 * the line-drawn equivalent, in the invitation's olive and gold, so they stay
 * crisp at any size and cost nothing to load. Purely decorative — every
 * instance is aria-hidden.
 */

export function BotanicalSpray({
  className,
  flip,
  tone = "sage",
  opacity = 0.5,
}: {
  className?: string;
  flip?: boolean;
  tone?: "sage" | "gold";
  opacity?: number;
}) {
  const stroke = tone === "gold" ? "var(--gold-light)" : "var(--sage)";
  const fill = tone === "gold" ? "var(--gold-wash)" : "var(--sage-pale)";

  return (
    <svg
      viewBox="0 0 240 260"
      className={className}
      aria-hidden="true"
      style={{
        transform: flip ? "scaleX(-1)" : undefined,
        opacity,
        pointerEvents: "none",
      }}
    >
      {/* main stem */}
      <path
        d="M18 250C46 200 62 150 70 96C76 56 92 26 122 8"
        fill="none"
        stroke={stroke}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* secondary stem */}
      <path
        d="M22 246C58 216 92 186 116 146C134 116 158 96 196 84"
        fill="none"
        stroke={stroke}
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.75"
      />

      {/* leaves along the main stem */}
      {[
        { x: 66, y: 108, r: -34, w: 30, h: 13 },
        { x: 76, y: 76, r: -18, w: 26, h: 11 },
        { x: 92, y: 48, r: -6, w: 22, h: 10 },
        { x: 56, y: 148, r: -50, w: 34, h: 14 },
        { x: 42, y: 190, r: -62, w: 30, h: 12 },
      ].map((l, i) => (
        <ellipse
          key={`a${i}`}
          cx={l.x}
          cy={l.y}
          rx={l.w}
          ry={l.h}
          fill={fill}
          stroke={stroke}
          strokeWidth="0.8"
          transform={`rotate(${l.r} ${l.x} ${l.y})`}
        />
      ))}

      {/* leaves along the secondary stem */}
      {[
        { x: 128, y: 138, r: 24, w: 26, h: 11 },
        { x: 158, y: 112, r: 14, w: 24, h: 10 },
        { x: 186, y: 92, r: 6, w: 20, h: 9 },
        { x: 96, y: 172, r: 36, w: 24, h: 10 },
      ].map((l, i) => (
        <ellipse
          key={`b${i}`}
          cx={l.x}
          cy={l.y}
          rx={l.w}
          ry={l.h}
          fill="none"
          stroke={stroke}
          strokeWidth="0.8"
          transform={`rotate(${l.r} ${l.x} ${l.y})`}
        />
      ))}

      {/* blooms */}
      {[
        { x: 122, y: 10, s: 1 },
        { x: 196, y: 84, s: 0.72 },
        { x: 70, y: 96, s: 0.55 },
      ].map((b, i) => (
        <g key={`f${i}`} transform={`translate(${b.x} ${b.y}) scale(${b.s})`}>
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <ellipse
              key={deg}
              cx="0"
              cy="-9"
              rx="5.5"
              ry="9.5"
              fill={tone === "gold" ? "var(--gold-wash)" : "var(--blush-wash)"}
              stroke={tone === "gold" ? "var(--gold-light)" : "var(--blush)"}
              strokeWidth="0.7"
              transform={`rotate(${deg})`}
            />
          ))}
          <circle r="3.4" fill="var(--gold-light)" stroke="var(--gold)" strokeWidth="0.6" />
        </g>
      ))}

      {/* small berries */}
      {[
        { x: 104, y: 62 },
        { x: 112, y: 74 },
        { x: 148, y: 128 },
      ].map((b, i) => (
        <circle key={`c${i}`} cx={b.x} cy={b.y} r="2.6" fill="var(--gold-light)" opacity="0.9" />
      ))}
    </svg>
  );
}

/** The thin rule with a centred diamond, used between sections. */
export function Flourish({ className }: { className?: string }) {
  return (
    <div className={`flourish ${className ?? ""}`} aria-hidden="true">
      <span>◆</span>
    </div>
  );
}

/** A ring of leaves that sits behind a pull-quote, as in the reference. */
export function LeafWreath({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 420" className={className} aria-hidden="true" style={{ pointerEvents: "none" }}>
      <circle
        cx="210"
        cy="210"
        r="168"
        fill="none"
        stroke="var(--sage-pale)"
        strokeWidth="1"
        strokeDasharray="3 7"
      />
      {Array.from({ length: 26 }).map((_, i) => {
        const angle = (i / 26) * Math.PI * 2;
        const x = 210 + Math.cos(angle) * 168;
        const y = 210 + Math.sin(angle) * 168;
        const deg = (angle * 180) / Math.PI + 90;
        return (
          <ellipse
            key={i}
            cx={x}
            cy={y}
            rx={i % 3 === 0 ? 15 : 11}
            ry={i % 3 === 0 ? 5.5 : 4}
            fill={i % 4 === 0 ? "var(--sage-pale)" : "none"}
            stroke="var(--sage)"
            strokeWidth="0.7"
            opacity="0.75"
            transform={`rotate(${deg} ${x} ${y})`}
          />
        );
      })}
    </svg>
  );
}
