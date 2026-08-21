#!/usr/bin/env node
/**
 * Concatenates the migrations, in order, into one file you can paste straight
 * into the Supabase SQL editor.
 *
 * If you have the Supabase CLI linked, `supabase db push` is the better route
 * and this is only a convenience for the paste-it-in path.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const outDir = join(root, "supabase", "build");
const outFile = join(outDir, "all-migrations.sql");

const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("No migrations found in supabase/migrations");
  process.exit(1);
}

const parts = [
  "-- =========================================================================",
  "-- FYB Dinner Night — all migrations, concatenated",
  `-- Generated ${new Date().toISOString()}`,
  "-- Run this once, top to bottom, in the Supabase SQL editor.",
  "-- =========================================================================",
  "",
];

for (const file of files) {
  parts.push(
    "",
    `-- ==================== ${file} ====================`,
    "",
    await readFile(join(migrationsDir, file), "utf8"),
  );
}

await mkdir(outDir, { recursive: true });
await writeFile(outFile, parts.join("\n"), "utf8");

console.log(`Combined ${files.length} migrations:`);
for (const f of files) console.log(`  · ${f}`);
console.log(`\nWrote ${outFile}`);
console.log("Paste that into the Supabase SQL editor and run it.");
