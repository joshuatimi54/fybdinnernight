import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApproved } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import type { DateMessage, DinnerTable, Pair, Profile } from "@/lib/types";
import { avatarUrl, fullName, initials } from "@/lib/utils";
import DateMessageForm from "@/components/DateMessageForm";

export const metadata = { title: "Your date" };
export const dynamic = "force-dynamic";

function Face({ url, name, size = 96 }: { url: string | null; name: string; size?: number }) {
  const src = avatarUrl(url, 320);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className="rounded-full object-cover border-2"
      style={{ width: size, height: size, borderColor: "var(--olive)" }}
    />
  ) : (
    <div
      className="rounded-full grid place-items-center border-2 font-display"
      style={{
        width: size,
        height: size,
        borderColor: "var(--olive)",
        background: "var(--ivory-warm)",
        fontSize: size / 3,
      }}
    >
      {initials(name)}
    </div>
  );
}

export default async function PairPage() {
  const { profile, config } = await requireApproved();
  if (profile.pairing_status !== "paired" || !profile.active_pair_id) {
    redirect("/discover");
  }

  const supabase = await createClient();

  const { data: pairData } = await supabase
    .from("pairs")
    .select("*")
    .eq("id", profile.active_pair_id)
    .maybeSingle();

  const pair = pairData as Pair | null;
  if (!pair) redirect("/discover");

  const partnerId = pair.user_a_id === profile.id ? pair.user_b_id : pair.user_a_id;

  const [{ data: partnerData }, { data: messages }, { data: tableData }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", partnerId).maybeSingle(),
      supabase.from("date_messages").select("*").eq("pair_id", pair.id),
      pair.table_id
        ? supabase.from("tables").select("*").eq("id", pair.table_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const partner = partnerData as Profile | null;
  const all = (messages ?? []) as DateMessage[];
  const mine = all.find((m) => m.author_id === profile.id) ?? null;
  const theirs = all.find((m) => m.author_id === partnerId) ?? null;
  const table = tableData as DinnerTable | null;

  const partnerName = partner?.first_name ?? "your date";

  return (
    <main className="max-w-[720px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex flex-col gap-12 rise">
        {/* ---------------------------------------------------- the pair */}
        <header className="flex flex-col gap-7">
          <span className="eyebrow">Confirmed</span>

          <div className="flex items-center gap-4">
            <Face url={profile.photo_url} name={profile.first_name} />
            <span className="font-display text-4xl" style={{ color: "var(--gold)" }}>
              &amp;
            </span>
            <Face url={partner?.photo_url ?? null} name={partnerName} />
          </div>

          <h1 className="text-[clamp(2.2rem,7vw,3.4rem)] leading-[0.95]">
            You&apos;re going with
            <br />
            <em style={{ color: "var(--gold)" }}>
              {fullName(partner?.first_name ?? "", partner?.last_name ?? "")}.
            </em>
          </h1>

          <div className="grid gap-px bg-rule border border-rule sm:grid-cols-3">
            <div className="bg-ivory p-4 flex flex-col gap-1">
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
                Their phone
              </span>
              <a
                href={partner?.phone ? `tel:${partner.phone}` : undefined}
                className="text-[15px] numeric hover:opacity-80"
              >
                {partner?.phone ?? "—"}
              </a>
            </div>
            <div className="bg-ivory p-4 flex flex-col gap-1">
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
                Their email
              </span>
              <span className="text-[13px] break-all">{partner?.email ?? "—"}</span>
            </div>
            <div className="bg-ivory p-4 flex flex-col gap-1">
              <span className="text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
                Your table
              </span>
              <span className="text-[15px]">
                {table ? table.label : "Not set yet"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/pass" className="btn btn-primary">
              See your pass
            </Link>
            {config.seat_selection_enabled && !table ? (
              <Link href="/seating" className="btn btn-ghost">
                Pick your table
              </Link>
            ) : null}
            <Link href="/share" className="btn btn-ghost">
              Make your graphic
            </Link>
          </div>
        </header>

        {/* ------------------------------------------------ their message */}
        {theirs ? (
          <section className="flex flex-col gap-4 border-t border-rule pt-10">
            <span className="eyebrow">{partnerName} wrote to you</span>
            <blockquote
              className="text-[16px] leading-relaxed pl-5 border-l-2 whitespace-pre-wrap"
              style={{ borderColor: "var(--gold)" }}
            >
              {theirs.body}
            </blockquote>
          </section>
        ) : (
          <section className="flex flex-col gap-3 border-t border-rule pt-10">
            <span className="eyebrow">From {partnerName}</span>
            <p className="text-ink-soft text-[15px]">
              Nothing yet. They&apos;ll get a nudge to write to you.
            </p>
          </section>
        )}

        {/* ------------------------------------------------- your message */}
        <section className="flex flex-col gap-5 border-t border-rule pt-10">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">Your turn</span>
            <h2 className="text-3xl">Write to your date</h2>
            <p className="text-[15px] text-ink-soft max-w-[52ch]">
              One message, just for {partnerName}. It stays private between the
              two of you unless you decide otherwise.
            </p>
          </div>

          <DateMessageForm
            pairId={pair.id}
            existing={mine}
            partnerName={partnerName}
          />
        </section>
      </div>
    </main>
  );
}
