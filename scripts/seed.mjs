#!/usr/bin/env node
/**
 * Seeds a realistic dry run: tables, guests, and enough pairs to exercise the
 * seating board. Run it before the committee walkthrough so you are testing
 * against a full-looking event rather than three rows.
 *
 *   node --env-file=.env.local scripts/seed.mjs [count] [--admin you@email]
 *
 * Uses the service role key, so never point it at production casually.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (try: node --env-file=.env.local scripts/seed.mjs)",
  );
  process.exit(1);
}

if (url.includes("your-project")) {
  console.error("Your .env.local still has placeholder values.");
  process.exit(1);
}

const args = process.argv.slice(2);
const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 60);
const adminIdx = args.indexOf("--admin");
const adminEmail = adminIdx >= 0 ? args[adminIdx + 1] : null;

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MALE = ["Tunde","Emeka","Seyi","Chidi","Ifeanyi","Bayo","Kunle","Obinna","Femi","Uche","Segun","Chuka","Dare","Nnamdi","Tobi","Yemi","Kelechi","Gbenga","Ekene","Damola"];
const FEMALE = ["Amaka","Funke","Chioma","Zainab","Ngozi","Bisi","Adaeze","Temi","Ifeoma","Yewande","Chinelo","Bukola","Nkechi","Simi","Oluchi","Halima","Ronke","Adaobi","Tolu","Chiamaka"];
const SURNAMES = ["Adeyemi","Okafor","Balogun","Nwosu","Ogundele","Eze","Adebayo","Olawale","Chukwu","Ibrahim","Afolabi","Nnaji","Oyelaran","Udoh","Bello","Aluko","Okeke","Salami"];
const DEPARTMENTS = ["Choir","Ushering","Media","Drama","Prayer","Welfare","Technical","Evangelism"];
const LEVELS = ["100","200","300","400","500"];

const PROMPTS = [
  ["My ideal table conversation is…", ["anything but small talk about the weather","whatever makes us both forget the food is going cold","arguing about jollof, respectfully","the kind you remember on the drive home"]],
  ["The one song that gets me on the floor…", ["anything by Asake, no warning needed","Burna Boy — Last Last, every single time","old-school highlife and I'm gone","if the DJ plays Davido I'm not sitting down"]],
  ["I'm the friend who always…", ["arrives twenty minutes early and waits in the car","has snacks in the bag, always","takes the group photo nobody asked for","texts everyone the next morning to check in"]],
];

const BIOS = [
  "Final year, tired, but showing up anyway.","Will absolutely order dessert first.","Ask me about my terrible taste in films.","I laugh too loudly. Fair warning.","Here for the food and the company, in that order.","Choir by day, quiet by night.", null, null,
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function makePrompts() {
  return PROMPTS.map(([q, answers]) => ({ q, a: pick(answers) }));
}

async function main() {
  console.log(`Seeding ~${count} guests into ${url}\n`);

  // ------------------------------------------------------------- tables --
  const { count: existingTables } = await supabase
    .from("tables")
    .select("id", { count: "exact", head: true });

  if ((existingTables ?? 0) === 0) {
    const tables = Array.from({ length: 20 }, (_, i) => ({
      label: `Table ${i + 1}`,
      capacity: 10,
      zone: i < 6 ? "Near the stage" : i < 14 ? "Centre" : "Garden side",
      sort_order: i,
    }));
    const { error } = await supabase.from("tables").insert(tables);
    if (error) console.error("  tables:", error.message);
    else console.log(`  ✓ ${tables.length} tables`);
  } else {
    console.log(`  · ${existingTables} tables already exist, leaving them`);
  }

  // ------------------------------------------------------------- guests --
  const created = [];

  for (let i = 0; i < count; i++) {
    const gender = i % 2 === 0 ? "male" : "female";
    const first = pick(gender === "male" ? MALE : FEMALE);
    const last = pick(SURNAMES);
    const email = `seed_${i}_${first.toLowerCase()}@example.test`;

    const { data: userData, error: userErr } =
      await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { seeded: true },
      });

    if (userErr) {
      if (!/already/i.test(userErr.message)) {
        console.error(`  ${email}: ${userErr.message}`);
      }
      continue;
    }

    const id = userData.user.id;

    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        first_name: first,
        last_name: last,
        gender,
        phone: `080${String(10000000 + Math.floor(Math.random() * 89999999))}`,
        email,
        photo_url: null,
        bio: pick(BIOS),
        department: pick(DEPARTMENTS),
        level: pick(LEVELS),
        prompts: makePrompts(),
        // Most are approved so discovery has something to show; a handful stay
        // pending so the approval queue isn't empty during the walkthrough.
        review_status: i % 11 === 0 ? "pending" : "approved",
        seeking_help: i % 7 === 0,
      })
      .eq("id", id);

    if (profErr) {
      console.error(`  profile ${email}: ${profErr.message}`);
      continue;
    }

    created.push({ id, gender, first, review: i % 11 === 0 ? "pending" : "approved" });
    if (created.length % 20 === 0) console.log(`  … ${created.length}`);
  }

  console.log(`  ✓ ${created.length} guests`);

  // -------------------------------------------------------------- pairs --
  // Straight through the real function, so the seeded data exercises the same
  // transaction the event will.
  const men = created.filter((p) => p.gender === "male" && p.review === "approved");
  const women = created.filter((p) => p.gender === "female" && p.review === "approved");
  const toPair = Math.floor(Math.min(men.length, women.length) * 0.45);

  let paired = 0;
  for (let i = 0; i < toPair; i++) {
    const { error } = await supabase.rpc("admin_propose_match", {
      p_a: men[i].id,
      p_b: women[i].id,
      p_note: null,
    });
    if (error) continue;

    const { data: inv } = await supabase
      .from("invitations")
      .select("id")
      .eq("sender_id", men[i].id)
      .eq("recipient_id", women[i].id)
      .eq("status", "pending")
      .maybeSingle();

    if (!inv) continue;

    // respond_to_invitation() reads auth.uid(), which a service-role call does
    // not carry, so the seed writes the pair directly. Everything the real
    // transaction guarantees is still asserted by the schema constraints.
    const [a, b] = [men[i].id, women[i].id].sort();
    const { data: pair, error: pairErr } = await supabase
      .from("pairs")
      .insert({ user_a_id: a, user_b_id: b })
      .select("id")
      .single();

    if (pairErr) continue;

    await supabase
      .from("profiles")
      .update({ pairing_status: "paired", active_pair_id: pair.id, seeking_help: false })
      .in("id", [a, b]);

    await supabase
      .from("invitations")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", inv.id);

    await supabase.from("passes").insert({
      pair_id: pair.id,
      code: Math.random().toString(16).slice(2, 10).toUpperCase(),
    });

    paired++;
  }

  console.log(`  ✓ ${paired} pairs`);

  // ---------------------------------------------------------- your admin --
  if (adminEmail) {
    const { data: list } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const found = list?.users.find(
      (u) => u.email?.toLowerCase() === adminEmail.toLowerCase(),
    );

    if (found) {
      await supabase.from("profiles").update({ is_admin: true }).eq("id", found.id);
      console.log(`  ✓ ${adminEmail} is now an admin`);
    } else {
      console.log(`  ! ${adminEmail} hasn't signed in yet — sign in once, then re-run`);
    }
  }

  await supabase.rpc("refresh_public_counters");
  console.log("\nDone. Seeded accounts use @example.test and cannot receive email.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
