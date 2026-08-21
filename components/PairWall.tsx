import type { WallPair } from "@/lib/types";
import { avatarUrl, initials } from "@/lib/utils";

function Face({ url, name }: { url: string | null; name: string }) {
  const src = avatarUrl(url, 160);

  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      className="w-11 h-11 rounded-full object-cover border border-rule-strong"
    />
  ) : (
    <div
      className="w-11 h-11 rounded-full grid place-items-center border border-rule-strong text-xs numeric"
      style={{ background: "var(--ivory-warm)", color: "var(--ink-faint)" }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}

export default function PairWall({ pairs }: { pairs: WallPair[] }) {
  return (
    <ul className="grid gap-px bg-rule border border-rule sm:grid-cols-2 lg:grid-cols-3">
      {pairs.map((p) => (
        <li key={p.pair_id} className="bg-ivory p-5 flex items-center gap-4">
          <div className="flex -space-x-3">
            <Face url={p.photo_a} name={p.name_a} />
            <Face url={p.photo_b} name={p.name_b} />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-[15px] truncate">
              {p.name_a} <span style={{ color: "var(--gold)" }}>&amp;</span>{" "}
              {p.name_b}
            </p>
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              Table for two
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
