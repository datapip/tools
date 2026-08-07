"use strict";

// Run this yourself, directly in your own terminal — not through the AI —
// since it prints full Adobe response data to the console.
//
// Usage: node scripts/manual-test.js listReportSuites
//        node scripts/manual-test.js listMetrics <reportSuiteId>

const adobeApi = require("../src/adobeApi");

const fnName = process.argv[2];
const args = process.argv.slice(3);

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
