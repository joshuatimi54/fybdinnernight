# FYB Dinner Night

Registration site for the CACCF FYB Dinner Night, built around one rule:
**no date, no dinner.** Nobody attends alone. You either bring a date or find
one here, and your pass does not exist until somebody says yes.

Full product spec: [`docs/PRD.md`](docs/PRD.md).

---

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Supabase

Create a project at [supabase.com](https://supabase.com), then:

**Run the migrations.** Either link the Supabase CLI and `supabase db push`,
or generate a single paste-able file:

```bash
npm run db:push          # writes supabase/build/all-migrations.sql
```

…then paste that into the Supabase SQL editor and run it once, top to bottom.

**Switch the email to a code, not a link.** Under
*Authentication → Email Templates → Magic Link*, replace the template body with
something containing the token:

```html
<h2>Your FYB Dinner Night code</h2>
<p>Enter this code to continue:</p>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
<p>It expires in an hour.</p>
```

This matters. Magic links break when a phone opens them in a different browser
from the one that started the flow — which is exactly what happens when the
link is shared through WhatsApp.

**Copy your keys** from *Project Settings → API* into `.env.local`.

### 3. Cloudinary (profile photos)

Create an **unsigned** upload preset, restrict it to images, and put the cloud
name and preset name in `.env.local`. Uploads go straight from the browser, so
guests' photos never pass through our own server.

### 4. Pass signing secret

```bash
openssl rand -hex 32     # paste into PASS_SIGNING_SECRET
```

The QR carries `CODE.SIGNATURE`, so a leaked database dump cannot be used to
mint working passes, and the secret can be rotated without touching a row.

### 5. Run it

```bash
npm run dev
```

### 6. Make yourself an admin

Sign in once at `/login`, then in the Supabase SQL editor:

```sql
update profiles set is_admin = true where email = 'you@example.com';
```

### 7. Seed a dry run (optional, recommended)

```bash
node --env-file=.env.local scripts/seed.mjs 120 --admin you@example.com
```

Creates tables, ~120 guests, and enough pairs to make the seating board look
like a real event. Seeded accounts use `@example.test` and cannot receive mail.

---

## Where the rules live

Anyone can call the Supabase API directly with the public key, bypassing every
screen. So the interface is never the guard — the rules are database functions
plus row-level security.

| Rule | Enforced by |
|---|---|
| One active pair per person | `profiles.active_pair_id` — one column, one row, structurally impossible to hold two |
| Male–female only | Re-checked inside `respond_to_invitation()` at the moment of pairing |
| Invitation caps | `send_invitation()`, under a row lock on the sender |
| Atomic pairing | `respond_to_invitation()` — locks both profiles, voids competing invitations, refunds those senders, issues the pass |
| Table capacity | `claim_table()`, under a row lock on the table |
| Contact privacy | RLS: your own row, your confirmed partner's row, and nothing else |
| Decline privacy | `get_my_invitations()` flattens `declined` and `voided` to `closed` before the row leaves Postgres |

That last one is the important one. It means even a hand-written API call
cannot discover that a specific person declined you.

### Migrations

| File | What it does |
|---|---|
| `0001_schema.sql` | Tables, enums, constraints, indexes |
| `0002_functions.sql` | The engine — invitations, pairing, seating, admin |
| `0003_rls.sql` | Row-level security and column grants |
| `0004_counters_and_cron.sql` | Live counters + scheduled expiry |
| `0005_invitation_feed.sql` | The inbox, with decline privacy |
| `0006_table_map.sql` | Seat occupancy without revealing who is seated |

---

## Invitation expiry

An invitation nobody answers has to release both sides on its own, so neither
person is left hanging and nobody has to say no.

`0004` schedules `expire_invitations()` on **pg_cron** every 15 minutes. If
pg_cron isn't available on your plan, the migration says so and
[`vercel.json`](vercel.json) already points a Vercel Cron at
`/api/cron/expire-invitations` instead — set `CRON_SECRET` in your Vercel
environment and that route is protected.

---

## The three protections

These are requirements, not polish. If schedule pressure hits, they are the
wrong things to cut.

1. **Declines are private and softly worded.** The sender only ever sees
   *"no longer available."* No decline counter exists anywhere in the system —
   not in the schema, not in the admin views, not in the audit log.
2. **Scarcity applies to the sender, never the receiver.** Five invitations,
   one outstanding. Receiving is unlimited, so nobody is punished for being
   popular and no one person can absorb every invitation in the room.
3. **The matchmaker queue is the safety net.** A private *"Help me find a
   date"* toggle only admins see. The resulting invitation reads as the
   committee's suggestion, so neither person had to ask and neither is the one
   nobody asked.

There is also no DM system, deliberately. The only free text between two people
is the single date message, and it is admin-visible. That one constraint is the
moderation strategy — expect someone to ask for chat, and it's worth defending.

---

## Verification

Before a single real person signs up:

**The pairing engine**
- Three people invite the same person; all three accept within milliseconds.
  Exactly one pair forms, the other two void, both budgets refund.
- Call `send_invitation` directly with a raw anon-key client for a same-gender
  pair. Must be refused by the database, not by the UI.
- Exhaust the five-invitation budget; the sixth is refused. Confirm expiry
  refunds a slot and a decline does not.

**Privacy**
- With only the anon key, try to select another guest's `phone` and `email`.
  Must come back empty.
- Confirm a `pending` profile never appears in `browse_profiles()`.
- Confirm `get_my_invitations()` never returns `declined` for a sent invitation.

**Seating**
- Two pairs claim the last slot at one table simultaneously. Exactly one wins.
- Dissolve a seated pair; seats release and every counter corrects.

**Full rehearsal** — seed 300 profiles and walk the committee through it end to
end: register, get approved, invite, get declined, invite again, accept, write
a message, claim a table, download the pass and graphic, scan the QR at a mock
door. Test on a throttled mobile connection; that is how nearly everyone will
actually use this.

---

## Stack

Next.js 15 · TypeScript · Tailwind v4 · Supabase (auth, Postgres, realtime) ·
Cloudinary · Vercel.

The pass and social graphics are drawn on a `<canvas>` in the browser rather
than rendered on a server — it costs nothing to run, works instantly, and keeps
guests' photos off our infrastructure.

```
app/
  page.tsx              landing — live counters, wall of pairs, FAQ
  login/                email + six-digit code
  (main)/
    onboarding/         profile builder
    pending/            awaiting review
    discover/           browse and invite
    invitations/        inbox and outbox
    pair/               your date, contacts, the date message
    pass/               dinner pass + signed QR
    seating/            pick your table
    share/              social graphic studio
    admin/              approvals, matchmaker, seating, moderation, door
  actions/              server actions
  api/                  pass lookup, cron
lib/                    supabase clients, gate, errors, canvas, pass signing
supabase/migrations/    the rules
```
