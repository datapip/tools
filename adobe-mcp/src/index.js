"use strict";

const fs = require("fs");
const path = require("path");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const adobeApi = require("./adobeApi");

function loadInstructions() {
  const contextPath = path.join(__dirname, "context.md");
  try {
    return fs.readFileSync(contextPath, "utf8");
  } catch (err) {
    console.error(`[adobe-analytics-mcp] no context.md found at ${contextPath}, continuing without it`);
    return undefined;
  }
}

const server = new McpServer(
  {
    name: "adobe-analytics",
    version: "0.1.0",
  },
  {
    instructions: loadInstructions(),
  }
);

async function callTool(fn) {
  try {
    const result = await fn();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}

server.registerTool(
  "listReportSuites",
  {
    title: "List Report Suites",
    description:
      "List all Adobe Analytics report suites accessible to this integration. Use this to resolve a domain/site name to a report suite ID before calling listMetrics, listDimensions, or runReport.",
    inputSchema: {},
  },
  async () => callTool(() => adobeApi.listReportSuites())
);

server.registerTool(
  "listMetrics",
  {
    title: "List Metrics",
    description:
      "List all metrics available for a given Adobe Analytics report suite. Use this to resolve a term like 'sales' or 'visits' to an actual metric ID before calling runReport.",
    inputSchema: {
      reportSuiteId: z.string().describe("The report suite ID, from listReportSuites"),
    },
  },
  async (args) => callTool(() => adobeApi.listMetrics(args.reportSuiteId))
);

server.registerTool(
  "listDimensions",
  {
    title: "List Dimensions",
    description:
      "List all dimensions available for a given Adobe Analytics report suite. Use this to resolve a breakdown term like 'page' or 'device type' to an actual dimension ID before calling runReport.",
    inputSchema: {
      reportSuiteId: z.string().describe("The report suite ID, from listReportSuites"),
    },
  },
  async (args) => callTool(() => adobeApi.listDimensions(args.reportSuiteId))
);

// Baked in once at process start. Known limitation: if this stdio process
// stays alive past midnight, this date goes stale until restarted — acceptable
// for now since opencode spawns a fresh process per session.
const TODAY = new Date().toISOString().slice(0, 10);

// Shared by runReport and runBreakdownReport. Each entry is either a saved
// segment ID string, or an inline ad hoc segment definition object — Adobe's
// own segment JSON shape (confirmed working against a live /reports call on
// 2026-08-09, see scripts/test-inline-segment.js): { func: "segment",
// version: [1, 0, 0], container: { func: "container", context: "hits" |
// "visits" | "visitors", pred: { func: "<operator, e.g. streq/contains/exists/gt/lt>",
// val: { func: "attr", name: "<dimension ID, e.g. variables/evar2>" },
// str?: "<value for string operators>", description?: "<human label>" } } }.
// Use an ad hoc definition when no saved segment already covers the
// condition; resolve the dimension ID via listDimensions first.
const segmentsSchema = z
  .array(z.union([z.string(), z.record(z.any())]))
  .optional()
  .describe(
    "Optional list of filters to restrict rows to a segment. Each entry is either a saved " +
      "segment ID string, or an inline ad hoc segment definition object (Adobe's segment " +
      "JSON: func/container/context/pred/val — build one when no saved segment fits)."
  );

server.registerTool(
  "runReport",
  {
    title: "Run Report",
    description:
      `Execute an Adobe Analytics report for one or more metrics, optionally broken down by a single dimension, over a date range. ` +
      `Today's date is ${TODAY} — compute startDate/endDate from this for relative ranges like "last week". ` +
      `Adobe's API only supports one breakdown dimension per call — call this tool again for additional breakdowns. ` +
      `Resolve metric/dimension IDs via listMetrics/listDimensions first, and reportSuiteId via listReportSuites.`,
    inputSchema: {
      reportSuiteId: z.string().describe("The report suite ID, from listReportSuites"),
      metrics: z.array(z.string()).describe("One or more metric IDs, from listMetrics"),
      dimension: z
        .string()
        .optional()
        .describe("Optional single dimension ID to break rows down by, from listDimensions"),
      startDate: z.string().describe("ISO date (YYYY-MM-DD), inclusive"),
      endDate: z.string().describe("ISO date (YYYY-MM-DD), exclusive — see runReport's dateRange note in CLAUDE.md"),
      segments: segmentsSchema,
    },
  },
  async (args) =>
    callTool(() =>
      adobeApi.runReport(
        args.reportSuiteId,
        args.metrics,
        args.dimension || null,
        args.startDate,
        args.endDate,
        args.segments
      )
    )
);

server.registerTool(
  "runBreakdownReport",
  {
    title: "Run Breakdown Report",
    description:
      `Execute an Adobe Analytics report broken down by 'dimension', restricted to rows where ` +
      `'breakdownDimension' equals a specific 'breakdownItemId'. This is the second step of a ` +
      `two-dimension drill-down: first call runReport (or listDimensions) to find the item ID for ` +
      `the dimension you want to filter by, then call this tool to see a second dimension broken ` +
      `down within just that one item. Today's date is ${TODAY} — compute startDate/endDate from ` +
      `this for relative ranges like "last week". Resolve metric/dimension IDs via ` +
      `listMetrics/listDimensions first, and reportSuiteId via listReportSuites.`,
    inputSchema: {
      reportSuiteId: z.string().describe("The report suite ID, from listReportSuites"),
      metrics: z.array(z.string()).describe("One or more metric IDs, from listMetrics"),
      dimension: z.string().describe("Dimension ID to break rows down by in the results, from listDimensions"),
      breakdownDimension: z
        .string()
        .describe("Dimension ID being filtered on, from a prior listDimensions/runReport call"),
      breakdownItemId: z
        .string()
        .describe("The specific item ID (from that prior call's results) to restrict rows to"),
      startDate: z.string().describe("ISO date (YYYY-MM-DD), inclusive"),
      endDate: z.string().describe("ISO date (YYYY-MM-DD), exclusive — see runReport's dateRange note in CLAUDE.md"),
      segments: segmentsSchema,
    },
  },
  async (args) =>
    callTool(() =>
      adobeApi.runBreakdownReport(
        args.reportSuiteId,
        args.metrics,
        args.dimension,
        args.breakdownDimension,
        args.breakdownItemId,
        args.startDate,
        args.endDate,
        args.segments
      )
    )
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[adobe-analytics-mcp] server started, listening on stdio");
}

main().catch((err) => {
  console.error("[adobe-analytics-mcp] fatal startup error:", err.message);
  process.exit(1);
});
