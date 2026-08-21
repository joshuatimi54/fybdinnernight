/**
 * Email chrome.
 *
 * Everything is tables and inline styles, because Gmail strips <style> blocks
 * and Outlook renders with Word. No webfonts either — Georgia is on every
 * platform and is the closest thing to the invitation's serif, so the mail
 * looks like the stationery instead of like a fallback.
 */

export const BRAND = {
  ivory: "#FBF8F2",
  ivoryWarm: "#F5EFE4",
  paper: "#FFFDF9",
  olive: "#333D2C",
  oliveDeep: "#232B1E",
  sage: "#93A189",
  sagePale: "#DDE3D6",
  gold: "#B08B33",
  goldLight: "#E8CF8F",
  goldWash: "#F7EFDA",
  ink: "#2A2E26",
  inkSoft: "#5E6558",
  inkFaint: "#8D9386",
  rule: "#E3DDD0",
};

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export type EventBits = {
  eventName: string;
  when: string;
  venue: string;
  siteUrl: string;
  hashtag: string;
};

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Bulletproof-ish button: a table, not an <a> with padding. */
export function button(href: string, label: string, tone: "olive" | "gold" = "olive") {
  const bg = tone === "olive" ? BRAND.olive : BRAND.gold;
  const fg = tone === "olive" ? BRAND.ivory : "#FFFDF6";

  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0;">
    <tr>
      <td align="center" bgcolor="${bg}" style="background-color:${bg};">
        <a href="${escapeHtml(href)}"
           style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:11px;
                  font-weight:600;letter-spacing:2px;text-transform:uppercase;
                  color:${fg};text-decoration:none;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

/** A quoted love note, set apart with a gold rule. */
export function quote(text: string, attribution?: string) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:22px 0;background-color:${BRAND.goldWash};">
    <tr>
      <td style="padding:22px 24px;border-left:3px solid ${BRAND.gold};">
        <div style="font-family:${SERIF};font-size:17px;line-height:1.75;color:${BRAND.olive};
                    font-style:italic;">${escapeHtml(text).replace(/\n/g, "<br>")}</div>
        ${
          attribution
            ? `<div style="font-family:${SANS};font-size:10px;letter-spacing:2px;
                           text-transform:uppercase;color:${BRAND.gold};padding-top:14px;">
                 — ${escapeHtml(attribution)}</div>`
            : ""
        }
      </td>
    </tr>
  </table>`;
}

export function paragraph(html: string) {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.75;
                    color:${BRAND.inkSoft};">${html}</p>`;
}

/** Small key/value block used for event details. */
export function details(rows: { k: string; v: string }[]) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="margin:24px 0;border:1px solid ${BRAND.rule};">
    ${rows
      .map(
        (r, i) => `
    <tr>
      <td style="padding:14px 18px;${i > 0 ? `border-top:1px solid ${BRAND.rule};` : ""}">
        <div style="font-family:${SANS};font-size:9px;letter-spacing:2.4px;text-transform:uppercase;
                    color:${BRAND.gold};padding-bottom:4px;">${escapeHtml(r.k)}</div>
        <div style="font-family:${SERIF};font-size:17px;color:${BRAND.olive};">${escapeHtml(r.v)}</div>
      </td>
    </tr>`,
      )
      .join("")}
  </table>`;
}

export function wrap({
  preheader,
  eyebrow,
  heading,
  script,
  body,
  event,
  footerNote,
}: {
  preheader: string;
  eyebrow: string;
  heading: string;
  script?: string;
  body: string;
  event: EventBits;
  footerNote?: string;
}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.ivory};">

<!-- Inbox preview line, hidden in the body -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${escapeHtml(preheader)}
  ${"&#847;&zwnj;&nbsp;".repeat(60)}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background-color:${BRAND.ivory};">
  <tr>
    <td align="center" style="padding:32px 14px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;background-color:${BRAND.paper};
                    border:1px solid ${BRAND.rule};">

        <!-- ------------------------------------------------ masthead -->
        <tr>
          <td align="center" bgcolor="${BRAND.olive}"
              style="background-color:${BRAND.olive};padding:30px 24px 26px;">
            <div style="font-family:${SERIF};font-size:24px;letter-spacing:6px;
                        color:${BRAND.ivory};">FYB</div>
            <div style="font-family:${SANS};font-size:8.5px;letter-spacing:4px;
                        text-transform:uppercase;color:${BRAND.goldLight};padding-top:7px;">
              Dinner Night
            </div>
          </td>
        </tr>
        <tr><td style="height:3px;background-color:${BRAND.gold};line-height:3px;">&nbsp;</td></tr>

        <!-- ------------------------------------------------- heading -->
        <tr>
          <td style="padding:40px 40px 0;">
            <div style="font-family:${SANS};font-size:9.5px;letter-spacing:3.2px;
                        text-transform:uppercase;color:${BRAND.gold};padding-bottom:14px;">
              ${escapeHtml(eyebrow)}
            </div>
            <h1 style="margin:0 0 22px;font-family:${SERIF};font-size:32px;line-height:1.2;
                       font-weight:normal;color:${BRAND.olive};">
              ${escapeHtml(heading)}${
                script
                  ? ` <span style="font-style:italic;color:${BRAND.gold};">${escapeHtml(script)}</span>`
                  : ""
              }
            </h1>
          </td>
        </tr>

        <!-- ---------------------------------------------------- body -->
        <tr><td style="padding:0 40px 34px;">${body}</td></tr>

        <!-- -------------------------------------------------- footer -->
        <tr>
          <td bgcolor="${BRAND.ivoryWarm}"
              style="background-color:${BRAND.ivoryWarm};padding:26px 40px;
                     border-top:1px solid ${BRAND.rule};">
            <div style="font-family:${SERIF};font-size:18px;color:${BRAND.olive};padding-bottom:6px;">
              ${escapeHtml(event.eventName)}
            </div>
            <div style="font-family:${SANS};font-size:12.5px;line-height:1.7;color:${BRAND.inkSoft};">
              ${escapeHtml(event.when)}<br>${escapeHtml(event.venue)}
            </div>
            ${
              footerNote
                ? `<div style="font-family:${SANS};font-size:11.5px;line-height:1.7;
                              color:${BRAND.inkFaint};padding-top:14px;">${footerNote}</div>`
                : ""
            }
          </td>
        </tr>

        <tr>
          <td bgcolor="${BRAND.oliveDeep}"
              style="background-color:${BRAND.oliveDeep};padding:18px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${SANS};font-size:10.5px;letter-spacing:1px;color:${BRAND.sage};">
                  CACCF
                </td>
                <td align="right" style="font-family:${SERIF};font-size:13px;font-style:italic;
                                         color:${BRAND.goldLight};">
                  ${escapeHtml(event.hashtag)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <div style="font-family:${SANS};font-size:11px;color:${BRAND.inkFaint};
                  padding-top:18px;max-width:600px;">
        You are receiving this because you registered for the ${escapeHtml(event.eventName)}.
      </div>

    </td>
  </tr>
</table>
</body>
</html>`;
}
