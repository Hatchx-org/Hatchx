import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function audit(extraArgs = []) {
  const result = spawnSync(npm, ["audit", "--json", ...extraArgs], { encoding: "utf8" });
  if (result.error || !result.stdout) {
    console.error(result.error?.message || result.stderr || "npm audit did not return a report.");
    process.exit(1);
  }
  try { return JSON.parse(result.stdout); }
  catch {
    console.error(result.stdout);
    console.error("npm audit returned an invalid JSON report.");
    process.exit(1);
  }
}

const production = audit(["--omit=dev"]);
const productionCount = production.metadata?.vulnerabilities?.total ?? 0;
if (productionCount > 0) {
  console.error(JSON.stringify(production.vulnerabilities, null, 2));
  console.error(`Dependency audit failed: ${productionCount} production vulnerability record(s).`);
  process.exit(1);
}

const report = audit();
const total = report.metadata?.vulnerabilities?.total ?? 0;
if (total === 0) {
  console.log("Dependency audit passed (production and development dependencies).");
  process.exit(0);
}

const allowedAdvisories = new Set([
  "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  // No patched picomatch release exists yet. This is restricted below to the
  // ESLint/TypeScript development toolchain and is never shipped at runtime.
  "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
]);
const allowedChain = new Set([
  "braces",
  "picomatch",
  "micromatch",
  "fast-glob",
  "fdir",
  "tinyglobby",
  "@next/eslint-plugin-next",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/parser",
  "@typescript-eslint/type-utils",
  "@typescript-eslint/typescript-estree",
  "@typescript-eslint/utils",
  "eslint-config-next",
  "eslint-import-resolver-typescript",
  "typescript-eslint",
]);
const advisories = Object.values(report.vulnerabilities ?? {}).flatMap(vulnerability =>
  (vulnerability.via ?? []).filter(item => typeof item === "object" && item.url),
);
const unknownAdvisories = advisories.filter(advisory => !allowedAdvisories.has(advisory.url));
const unknownPackages = Object.keys(report.vulnerabilities ?? {}).filter(name => !allowedChain.has(name));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const vulnerableNodes = Object.values(report.vulnerabilities ?? {}).flatMap(vulnerability => vulnerability.nodes ?? []);
const vulnerableNodesAreDevOnly = vulnerableNodes.length > 0 && vulnerableNodes.every(path => lock.packages?.[path]?.dev === true);

if (unknownAdvisories.length || unknownPackages.length || !vulnerableNodesAreDevOnly || !advisories.length) {
  console.error(JSON.stringify(report.vulnerabilities, null, 2));
  console.error("Dependency audit failed: an unapproved or production-reachable vulnerability was found.");
  process.exit(1);
}

console.warn(`Dependency audit passed with ${allowedAdvisories.size} temporary development-only exception(s).`);
console.warn("The exceptions are limited to the ESLint/TypeScript toolchain and should be removed when upstream patched releases are available.");
