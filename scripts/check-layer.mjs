#!/usr/bin/env node
// Layering gate — PLATFORM_ARCHITECTURE.md § 4.2.
import { readFileSync } from "node:fs";
const ALLOWED = new Set(["@unerp/contracts","@unerp/kernel","@unerp/ui","@unerp/shared"]);
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const declared = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
].filter((d) => d.startsWith("@unerp/") || d.startsWith("@unierp/"));
const violations = declared.filter((d) => !ALLOWED.has(d));
if (violations.length) {
  console.error("Layering violation — dependency not permitted at this layer:");
  for (const v of violations) console.error("  · " + v);
  console.error("Permitted: " + [...ALLOWED].join(", "));
  process.exit(1);
}
console.log("Layering OK — " + (declared.join(", ") || "no workspace dependencies") + ".");
