"use strict";

// Run this yourself, directly in your own terminal — not through the AI —
// since it prints full Adobe response data to the console.
//
// Positional args map straight to adobeApi's function signatures. Any arg
// starting with [ or { is JSON.parse'd, so array/object params (metrics,
// segments) can be passed on the CLI; the literal string "null" becomes
// JS null (for runReport's optional dimension); everything else stays a
// plain string.
//
// Usage (copy-paste — swap in a different date range if this one has aged out):
//   node scripts/manual-test.js listReportSuites
//   node scripts/manual-test.js listMetrics <rsid>
//   node scripts/manual-test.js listDimensions <rsid>
//   node scripts/manual-test.js runReport <rsid> '["metrics/visits"]' null 2026-08-02 2026-08-09
//   node scripts/manual-test.js runReport <rsid> '["metrics/visits"]' null 2026-08-02 2026-08-09 '[{"func":"segment","version":[1,0,0],"container":{"func":"container","context":"hits","pred":{"func":"contains","str":"abschluss","val":{"func":"attr","name":"variables/evar2"},"description":"Page Path (v2)"}}}]'
//   node scripts/manual-test.js runBreakdownReport <rsid> '["metrics/visits"]' variables/evar2 variables/evar3 3788089843 2026-08-02 2026-08-09

const adobeApi = require("../src/adobeApi");

function parseArg(raw) {
  if (raw === "null") return null;
  if (raw.startsWith("[") || raw.startsWith("{")) return JSON.parse(raw);
  return raw;
}

const fnName = process.argv[2];
const args = process.argv.slice(3).map(parseArg);

if (!fnName || typeof adobeApi[fnName] !== "function") {
  console.error(`Usage: node scripts/manual-test.js <${Object.keys(adobeApi).join("|")}> [args...]`);
  process.exit(1);
}

adobeApi[fnName](...args)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    console.error("FAILED:", err.message);
    process.exit(1);
  });
