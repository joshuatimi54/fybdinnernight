import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** RFC 4180 quoting — names with commas or quotes must survive Excel. */
function csv(rows: (string | number | null)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? "" : String(cell);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\r\n");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

type PairRow = {
  id: string;
  confirmed_at: string;
  table: { label: string; zone: string | null } | null;
  a: { first_name: string; last_name: string; email: string; phone: string | null; department: string | null } | null;
  b: { first_name: string; last_name: string; email: string; phone: string | null; department: string | null } | null;
  passes: { code: string; checked_in_a_at: string | null; checked_in_b_at: string | null }[] | null;
};

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!me?.is_admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const type = new URL(request.url).searchParams.get("type") ?? "attendees";

  const { data } = await supabase
    .from("pairs")
    .select(
      `id, confirmed_at,
       table:tables(label, zone),
       a:profiles!pairs_user_a_id_fkey(first_name, last_name, email, phone, department),
       b:profiles!pairs_user_b_id_fkey(first_name, last_name, email, phone, department),
       passes(code, checked_in_a_at, checked_in_b_at)`,
    )
    .eq("status", "confirmed")
    .order("confirmed_at");

  const pairs = (data ?? []) as unknown as PairRow[];
  const stamp = new Date().toISOString().slice(0, 10);

  // ------------------------------------------------------------ attendees --
  if (type === "attendees") {
    const rows: (string | number | null)[][] = [
      ["First name", "Surname", "Email", "Phone", "Department", "Partner", "Table", "Pass", "Checked in"],
    ];

    for (const p of pairs) {
      const pass = p.passes?.[0];
      const table = p.table?.label ?? "";

      if (p.a) {
        rows.push([
          p.a.first_name, p.a.last_name, p.a.email, p.a.phone, p.a.department,
          `${p.b?.first_name ?? ""} ${p.b?.last_name ?? ""}`.trim(),
          table, pass?.code ?? "", pass?.checked_in_a_at ? "yes" : "no",
        ]);
      }
      if (p.b) {
        rows.push([
          p.b.first_name, p.b.last_name, p.b.email, p.b.phone, p.b.department,
          `${p.a?.first_name ?? ""} ${p.a?.last_name ?? ""}`.trim(),
          table, pass?.code ?? "", pass?.checked_in_b_at ? "yes" : "no",
        ]);
      }
    }

    return new NextResponse(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fyb-attendees-${stamp}.csv"`,
      },
    });
  }

  // -------------------------------------------------------------- seating --
  if (type === "seating") {
    const rows: (string | number | null)[][] = [
      ["Table", "Zone", "Guest 1", "Guest 2", "Pass"],
    ];

    const sorted = [...pairs].sort((x, y) =>
      (x.table?.label ?? "zzz").localeCompare(y.table?.label ?? "zzz", undefined, {
        numeric: true,
      }),
    );

    for (const p of sorted) {
      rows.push([
        p.table?.label ?? "UNSEATED",
        p.table?.zone ?? "",
        `${p.a?.first_name ?? ""} ${p.a?.last_name ?? ""}`.trim(),
        `${p.b?.first_name ?? ""} ${p.b?.last_name ?? ""}`.trim(),
        p.passes?.[0]?.code ?? "",
      ]);
    }

    return new NextResponse(csv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fyb-seating-${stamp}.csv"`,
      },
    });
  }

  // ----------------------------------------------------------- tablecards --
  // A print sheet rather than a download: two cards per A4 page, cut line
  // down the middle, ready to fold and stand on the table.
  if (type === "tablecards") {
    const cards = pairs
      .filter((p) => p.table)
      .sort((x, y) =>
        (x.table?.label ?? "").localeCompare(y.table?.label ?? "", undefined, {
          numeric: true,
        }),
      )
      .map(
        (p) => `
        <article class="card">
          <p class="table">${escapeHtml(p.table?.label ?? "")}</p>
          <p class="names">${escapeHtml(`${p.a?.first_name ?? ""} ${p.a?.last_name ?? ""}`.trim())}</p>
          <p class="amp">&amp;</p>
          <p class="names">${escapeHtml(`${p.b?.first_name ?? ""} ${p.b?.last_name ?? ""}`.trim())}</p>
          ${p.table?.zone ? `<p class="zone">${escapeHtml(p.table.zone)}</p>` : ""}
        </article>`,
      )
      .join("");

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>FYB Dinner Night — table cards</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #1a1216; background: #fff; }
  .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .card {
    border: 1.5pt solid #8C2F48; padding: 10mm 6mm; text-align: center;
    height: 62mm; display: flex; flex-direction: column; justify-content: center;
    gap: 2mm; break-inside: avoid; page-break-inside: avoid;
  }
  .table { font-size: 10pt; letter-spacing: 3pt; text-transform: uppercase; color: #8C2F48; margin: 0 0 3mm; font-family: Arial, sans-serif; }
  .names { font-size: 17pt; margin: 0; line-height: 1.15; }
  .amp { font-size: 13pt; color: #8C2F48; margin: 0; font-style: italic; }
  .zone { font-size: 8pt; color: #7a6870; margin: 3mm 0 0; font-family: Arial, sans-serif; text-transform: uppercase; letter-spacing: 1.5pt; }
  .toolbar { padding: 8mm; text-align: center; font-family: Arial, sans-serif; }
  button { font: inherit; padding: 8px 18px; cursor: pointer; }
  @media print { .toolbar { display: none; } }
</style></head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print these ${pairs.filter((p) => p.table).length} cards</button>
  </div>
  <div class="sheet">${cards || "<p>No pairs have been seated yet.</p>"}</div>
</body></html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.json({ error: "unknown export type" }, { status: 400 });
}
