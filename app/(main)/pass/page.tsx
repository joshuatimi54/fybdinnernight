import Link from "next/link";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireApproved } from "@/lib/gate";
import { createClient } from "@/lib/supabase/server";
import { passToken } from "@/lib/pass";
import { formatEventDate, fullName } from "@/lib/utils";
import type { DinnerTable, Pair, Pass, Profile } from "@/lib/types";
import PassActions from "@/components/PassActions";

export const metadata = { title: "Your pass" };
export const dynamic = "force-dynamic";

export default async function PassPage() {
  const { profile, config } = await requireApproved();
  if (profile.pairing_status !== "paired" || !profile.active_pair_id) {
    redirect("/discover");
  }

  const supabase = await createClient();

  const [{ data: pairData }, { data: passData }] = await Promise.all([
    supabase.from("pairs").select("*").eq("id", profile.active_pair_id).maybeSingle(),
    supabase.from("passes").select("*").eq("pair_id", profile.active_pair_id).maybeSingle(),
  ]);

  const pair = pairData as Pair | null;
  const pass = passData as Pass | null;
  if (!pair || !pass) redirect("/pair");

  const partnerId = pair.user_a_id === profile.id ? pair.user_b_id : pair.user_a_id;

  const [{ data: partnerData }, { data: tableData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", partnerId).maybeSingle(),
    pair.table_id
      ? supabase.from("tables").select("*").eq("id", pair.table_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const partner = partnerData as Profile | null;
  const table = tableData as DinnerTable | null;

  // Signed, so a leaked code alone cannot be turned into a working pass.
  const token = passToken(pass.code);
  const qrDataUrl = await QRCode.toDataURL(token, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: 600,
    color: { dark: "#0B070A", light: "#FFFFFF" },
  });

  const nameA = fullName(profile.first_name, profile.last_name);
  const nameB = fullName(partner?.first_name ?? "", partner?.last_name ?? "");
  const when = formatEventDate(config.event_starts_at);

  return (
    <main className="max-w-[560px] mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex flex-col gap-8 rise">
        <header className="flex flex-col gap-3 print:hidden">
          <span className="eyebrow">Unlocked</span>
          <h1 className="text-[clamp(2.2rem,7vw,3.4rem)] leading-[0.95]">
            Your dinner
            <br />
            <em style={{ color: "var(--gold)" }}>pass.</em>
          </h1>
        </header>

        {/* ------------------------------------------------------ the pass */}
        <article
          className="border-2 p-8 flex flex-col items-center gap-6 text-center"
          style={{ borderColor: "var(--olive)", background: "var(--olive-deep)" }}
        >
          <div className="flex flex-col gap-2">
            <span className="eyebrow">CACCF presents</span>
            <h2 className="text-4xl">{config.event_name}</h2>
          </div>

          <div className="w-full h-px" style={{ background: "var(--rule)" }} />

          <div className="flex flex-col gap-2">
            <span className="text-[10.5px] uppercase tracking-[0.2em] text-ink-faint">
              Admits two
            </span>
            <p className="font-display text-3xl leading-tight">{nameA}</p>
            <p className="font-display text-2xl" style={{ color: "var(--gold)" }}>&amp;</p>
            <p className="font-display text-3xl leading-tight">{nameB}</p>
          </div>

          <dl className="grid grid-cols-1 gap-4 w-full pt-2">
            {[
              { k: "When", v: when },
              { k: "Where", v: config.venue ?? "To be announced" },
              { k: "Table", v: table?.label ?? "Assigned on arrival" },
              ...(config.dress_code ? [{ k: "Dress", v: config.dress_code }] : []),
            ].map((row) => (
              <div key={row.k} className="flex flex-col gap-0.5">
                <dt className="text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">
                  {row.k}
                </dt>
                <dd className="text-[15px]">{row.v}</dd>
              </div>
            ))}
          </dl>

          <div className="bg-white p-3 rounded-[2px] mt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt={`Pass QR code ${pass.code}`} className="w-[180px] h-[180px]" />
          </div>

          <p className="numeric text-xl tracking-[0.25em]" style={{ color: "var(--gold)" }}>
            {pass.code}
          </p>

          {pass.checked_in_a_at && pass.checked_in_b_at ? (
            <span className="pill pill-good">Both checked in</span>
          ) : pass.checked_in_a_at || pass.checked_in_b_at ? (
            <span className="pill pill-gold">One of you is in</span>
          ) : null}
        </article>

        <PassActions
          pass={{
            code: pass.code,
            qrDataUrl,
            nameA,
            nameB,
            table: table?.label ?? null,
            eventName: config.event_name,
            when,
            venue: config.venue,
          }}
        />

        <div className="flex flex-wrap gap-3 print:hidden">
          <Link href="/share" className="btn btn-ghost">Make your graphic</Link>
          {config.seat_selection_enabled && !table ? (
            <Link href="/seating" className="btn btn-ghost">Pick your table</Link>
          ) : null}
        </div>

        <p className="text-[13px] text-ink-faint print:hidden">
          Show the QR at the door — a screenshot works fine. Your table is
          printed on it as soon as it&apos;s assigned.
        </p>
      </div>
    </main>
  );
}
