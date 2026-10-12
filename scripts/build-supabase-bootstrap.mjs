import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = join(root, "supabase");
const manifest = JSON.parse(await readFile(join(directory, "migration-order.json"), "utf8"));
const listed = [manifest.newProject, manifest.existingProjectOnly, manifest.optionalDevelopmentData].flat();
const ignoredLocalWork = manifest.ignoredLocalWork ?? [];
const duplicates = listed.filter((name, index) => listed.indexOf(name) !== index);
if (duplicates.length) throw new Error(`Migration manifest contains duplicates: ${[...new Set(duplicates)].join(", ")}`);

const diskFiles = (await readdir(directory)).filter(name => name.endsWith(".sql") && name !== "bootstrap.sql").sort();
const unclassified = diskFiles.filter(name => !listed.includes(name) && !ignoredLocalWork.includes(name));
const missing = listed.filter(name => !diskFiles.includes(name));
if (unclassified.length || missing.length) throw new Error([
  unclassified.length ? `Unclassified SQL files: ${unclassified.join(", ")}` : "",
  missing.length ? `Manifest files not found: ${missing.join(", ")}` : "",
].filter(Boolean).join("\n"));

const sections = [];
for (const [index, name] of manifest.newProject.entries()) {
  const sql = (await readFile(join(directory, name), "utf8")).trim();
  sections.push(`-- ============================================================================\n-- ${String(index + 1).padStart(2, "0")}. ${name}\n-- ============================================================================\n\n${sql}`);
}

const header = `-- GENERATED FILE — DO NOT EDIT DIRECTLY.\n-- Run npm run db:bundle after editing a source migration.\n-- For a brand-new Supabase project only. Existing databases must follow\n-- docs/SUPABASE_SETUP.md and must not run this complete bootstrap.\n-- SQL contains no website hostname; configure the new domain in Vercel and\n-- Supabase Authentication > URL Configuration.\n\n`;
const outputPath = join(directory, "bootstrap.sql");
const output = `${header}${sections.join("\n\n")}\n`;
if (process.argv.includes("--check")) {
  console.log(`Verified bootstrap manifest (${manifest.newProject.length} ordered migrations).`);
} else {
  await writeFile(outputPath, output, "utf8");
  console.log(`Generated supabase/bootstrap.sql from ${manifest.newProject.length} ordered migrations.`);
}
