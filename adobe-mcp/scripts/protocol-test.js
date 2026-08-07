"use strict";

// Scripted MCP protocol test: spawns src/index.js as a real child process and
// talks to it over stdio via the SDK's own Client, the same way opencode
// would. Verifies tool registration, zod input validation, and response
// shapes — not the Adobe data itself, so this is safe to run through any
// terminal (only counts/booleans/shapes are printed, never real values).

const path = require("path");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

function parseToolText(result) {
  return JSON.parse(result.content[0].text);
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "..", "src", "index.js")],
  });

  const client = new Client({ name: "protocol-test-client", version: "0.1.0" });
  await client.connect(transport);
  const instructions = client.getInstructions();
  console.log(
    "Connected. Server instructions present:",
    typeof instructions === "string" && instructions.length > 0
  );

  const { tools } = await client.listTools();
  console.log("Registered tools:", tools.map((t) => t.name).join(", "));

  const suitesResult = await client.callTool({ name: "listReportSuites", arguments: {} });
  const suites = parseToolText(suitesResult);
  const rsid = suites.content && suites.content[0] && suites.content[0].id;
  console.log(
    "listReportSuites — isError:",
    !!suitesResult.isError,
    "| suite count:",
    suites.content ? suites.content.length : "unknown-shape"
  );

  const metricsResult = await client.callTool({
    name: "listMetrics",
    arguments: { reportSuiteId: rsid },
  });
  const metrics = parseToolText(metricsResult);
  const metricId = metrics[0] && metrics[0].id;
  console.log(
    "listMetrics — isError:",
    !!metricsResult.isError,
    "| metric count:",
    Array.isArray(metrics) ? metrics.length : "unknown-shape"
  );

  const dimsResult = await client.callTool({
    name: "listDimensions",
    arguments: { reportSuiteId: rsid },
  });
  const dims = parseToolText(dimsResult);
  console.log(
    "listDimensions — isError:",
    !!dimsResult.isError,
    "| dimension count:",
    Array.isArray(dims) ? dims.length : "unknown-shape"
  );

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const reportResult = await client.callTool({
    name: "runReport",
    arguments: {
      reportSuiteId: rsid,
      metrics: [metricId],
      startDate: fmt(weekAgo),
      endDate: fmt(today),
    },
  });
  const report = parseToolText(reportResult);
  console.log(
    "runReport — isError:",
    !!reportResult.isError,
    "| row count:",
    report.rows ? report.rows.length : "unknown-shape"
  );

  try {
    const badResult = await client.callTool({ name: "listMetrics", arguments: {} });
    console.log(
      "Missing-required-arg test — isError:",
      !!badResult.isError,
      "(expected true; SDK/zod should reject the call before it reaches adobeApi.js)"
    );
  } catch (err) {
    console.log("Missing-required-arg test — threw as expected:", err.constructor.name);
  }

  await client.close();
  console.log("SUCCESS — protocol test complete");
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
