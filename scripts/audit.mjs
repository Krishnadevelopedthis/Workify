// Fails on any high or critical advisory in production dependencies, except
// the ones listed below after review. Run: node scripts/audit.mjs
import { execSync } from "node:child_process";

// Each entry needs a reason; remove it as soon as a fixed version exists.
const ACCEPTED = {
  // node-forge: RSA PKCS#1 v1.5 signature *verification* accepts malformed
  // DigestAlgorithm data. Workify only uses forge to create its own signing
  // certificate and to sign PDFs (src/server/pdf-sign.ts); it never verifies
  // signatures with forge. No fixed version exists yet.
  "GHSA-86w9-cpqp-85rv": "node-forge signature verification (not used by Workify)",
};

let report;
try {
  report = execSync("npm audit --omit=dev --json", { encoding: "utf8" });
} catch (e) {
  report = e.stdout; // npm audit exits 1 when it finds anything
}
const { vulnerabilities = {} } = JSON.parse(report);

const failing = new Map();
for (const vuln of Object.values(vulnerabilities)) {
  for (const via of vuln.via) {
    if (typeof via === "string" || !["high", "critical"].includes(via.severity)) continue;
    const id = via.url?.split("/").pop();
    if (id && id in ACCEPTED) continue;
    failing.set(id ?? via.title, `${via.severity}: ${via.name} — ${via.title} (${via.url})`);
  }
}

for (const [id, reason] of Object.entries(ACCEPTED)) console.log(`accepted ${id}: ${reason}`);
if (failing.size) {
  console.error([...failing.values()].join("\n"));
  process.exit(1);
}
console.log("No unaccepted high or critical advisories.");
