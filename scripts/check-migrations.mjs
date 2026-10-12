import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const directory = new URL("../supabase/", import.meta.url);
const files = readdirSync(directory).filter(name => name.endsWith(".sql") && name !== "bootstrap.sql").sort();
const failures = [];
for (const file of files) {
  const sql = readFileSync(join(directory.pathname, file), "utf8");
  const executable = sql.replace(/--.*$/gm, "");
  if (!sql.trim()) failures.push(`${file}: empty migration`);
  if (/^(?:<<<<<<<|=======|>>>>>>>)/m.test(sql)) failures.push(`${file}: unresolved merge marker`);
  if (/\bgrant\s+all\b[^;]*\bto\s+(?:anon|authenticated)\b/i.test(sql)) failures.push(`${file}: broad GRANT ALL to a client role`);
  if (/\bbegin\s*;/i.test(sql) !== /\bcommit\s*;\s*$/i.test(sql)) failures.push(`${file}: transaction must have both BEGIN and final COMMIT`);
  const definitions = [...executable.matchAll(/security\s+definer([^$;]{0,180})/gi)];
  for (const definition of definitions) if (!/set\s+search_path/i.test(definition[0])) failures.push(`${file}: SECURITY DEFINER function is missing a fixed search_path near line ${sql.slice(0, definition.index).split("\n").length}`);

  // Consolidated installs may be restarted after a statement fails. Every RLS
  // policy must therefore be dropped before it is created, including policies
  // that are redefined by a later section in the same file.
  const policyState = new Map();
  for (const match of executable.matchAll(/(drop\s+policy\s+if\s+exists|create\s+policy)\s+"([^"]+)"/gi)) {
    const action = match[1].toLowerCase().startsWith("drop") ? "drop" : "create";
    const name = match[2];
    const state = policyState.get(name) ?? { dropped: false, exists: false };
    if (action === "drop") {
      state.dropped = true;
      state.exists = false;
    } else {
      const line = sql.slice(0, match.index).split("\n").length;
      if (!state.dropped) failures.push(`${file}: policy "${name}" is created without a preceding DROP POLICY IF EXISTS near line ${line}`);
      if (state.exists) failures.push(`${file}: policy "${name}" is created twice without an intervening drop near line ${line}`);
      state.exists = true;
      state.dropped = false;
    }
    policyState.set(name, state);
  }

  if (/\b(?:add\s+constraint\s+site_content_key_check|key\s+text\s+primary\s+key\s+check\s*\()/i.test(executable)) {
    failures.push(`${file}: site_content keys are application-validated; a database key check would reject preserved legacy rows`);
  }
  for (const constraint of executable.matchAll(/alter\s+table\s+public\.site_content\s+add\s+constraint\s+(site_content_(?:key|body)_check)([^;]*);/gi)) {
    if (!/\bnot\s+valid\s*$/i.test(constraint[2])) failures.push(`${file}: ${constraint[1]} must be NOT VALID so reruns preserve legacy rows`);
  }
}
if (failures.length) {
  console.error(`Migration checks failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`Migration checks passed (${files.length} SQL files checked).`);
