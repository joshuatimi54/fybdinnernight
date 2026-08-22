/**
 * Shared helper for the scheduled functions.
 *
 * Netlify's scheduler has no equivalent of Vercel's signed cron requests, so
 * each function calls its own site over HTTPS carrying CRON_SECRET as a bearer
 * token — the same check the routes already enforce.
 */
export async function callCronRoute(path: string): Promise<Response> {
  const base = (process.env.URL ?? process.env.DEPLOY_URL ?? "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;

  if (!base) {
    console.error(`[cron] ${path}: no site URL in the environment`);
    return new Response("missing site URL", { status: 500 });
  }
  if (!secret) {
    // Better to fail loudly here than to have the route reject every call and
    // leave a queue quietly filling up for a week.
    console.error(`[cron] ${path}: CRON_SECRET is not set on this site`);
    return new Response("missing CRON_SECRET", { status: 500 });
  }

  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();

    if (!res.ok) {
      console.error(`[cron] ${path} -> ${res.status} ${body.slice(0, 300)}`);
    } else {
      console.log(`[cron] ${path} -> ${body.slice(0, 300)}`);
    }

    return new Response(body, { status: res.status });
  } catch (err) {
    console.error(`[cron] ${path} failed:`, err);
    return new Response("cron call failed", { status: 500 });
  }
}
