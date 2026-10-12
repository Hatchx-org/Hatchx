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
}
if (failures.length) {
  console.error(`Migration checks failed:\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`Migration checks passed (${files.length} SQL files checked).`);
