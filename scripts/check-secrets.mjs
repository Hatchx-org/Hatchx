import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const binary = /\.(?:png|jpe?g|gif|webp|ico|woff2?|pdf|zip)$/i;
const rules = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["OpenAI/Stripe secret", /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{20,})\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["non-empty service role key", /^[ \t]*SUPABASE_SERVICE_ROLE_KEY[ \t]*=[ \t]*\S+/m],
];
const findings = [];
for (const file of files) {
  if (binary.test(file) || file === "package-lock.json") continue;
  let content;
  try { content = readFileSync(file, "utf8"); } catch { continue; }
  for (const [label, pattern] of rules) if (pattern.test(content)) findings.push(`${file}: ${label}`);
}
if (findings.length) {
  console.error(`Potential committed secrets found:\n${findings.join("\n")}`);
  process.exit(1);
}
console.log(`Secret scan passed (${files.length} tracked files checked).`);
