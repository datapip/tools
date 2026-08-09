"use strict";

const { GET, POST } = require("../../lib/proxy");
const config = require("./config");
const { getAccessToken } = require("./adobeAuth");
const { callProxy } = require("./proxyErrorHandling");

const ANALYTICS_HOST = "analytics.adobe.io";

async function buildHeaders() {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "x-api-key": config.clientId,
    "x-gw-ims-org-id": config.orgId,
  };
}

function parseApiResponse({ data, error }, context) {
  if (error) {
    throw new Error(`${context} request failed: ${error}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch (parseErr) {
    throw new Error(
      `${context} response was not valid JSON (got: ${data.slice(0, 200)})`
    );
  }

  if (parsed.error_code || parsed.error_description) {
    throw new Error(
      `Adobe API error in ${context}: ${parsed.error_code || ""} ${
        parsed.error_description || ""
      }`.trim()
    );
  }

  return parsed;
}

/**
 * List all Adobe Analytics report suites accessible to this integration.
 * @returns {Promise<object>} parsed Adobe API response containing the report suite list
 */
async function listReportSuites() {
  const headers = await buildHeaders();
  const path = `/api/${config.globalCompanyId}/collections/suites`;

  const response = await callProxy(GET(ANALYTICS_HOST, path, headers));
  return parseApiResponse(response, "listReportSuites");
}

/**
 * List all metrics available for a given report suite.
 * @param {string} reportSuiteId - the report suite ID, from listReportSuites
 * @returns {Promise<object>} parsed Adobe API response containing the metric list
 */
async function listMetrics(reportSuiteId) {
  const headers = await buildHeaders();
  const path = `/api/${config.globalCompanyId}/metrics?rsid=${encodeURIComponent(
    reportSuiteId
  )}`;

  const response = await callProxy(GET(ANALYTICS_HOST, path, headers));
  return parseApiResponse(response, "listMetrics");
}

/**
 * List all dimensions available for a given report suite.
 * @param {string} reportSuiteId - the report suite ID, from listReportSuites
 * @returns {Promise<object>} parsed Adobe API response containing the dimension list
 */
async function listDimensions(reportSuiteId) {
  const headers = await buildHeaders();
  const path = `/api/${config.globalCompanyId}/dimensions?rsid=${encodeURIComponent(
    reportSuiteId
  )}`;

  const response = await callProxy(GET(ANALYTICS_HOST, path, headers));
  return parseApiResponse(response, "listDimensions");
}

/**
 * Execute a report for one or more metrics, optionally broken down by a single dimension.
 * @param {string} reportSuiteId
 * @param {string[]} metrics - metric IDs, from listMetrics
 * @param {string|null} dimension - optional single dimension ID to break down by, from listDimensions
 * @param {string} startDate - ISO date (YYYY-MM-DD), inclusive
 * @param {string} endDate - ISO date (YYYY-MM-DD), exclusive
 * @param {(string|object)[]} [segments] - optional list of saved segment IDs and/or inline
 *   ad hoc segment definitions to filter by. A string entry is sent as `segmentId`; an object
 *   entry is sent as `segmentDefinition` (Adobe's func/container/pred segment JSON — see
 *   scripts/test-inline-segment.js for a real, confirmed-working example). Confirmed against a
 *   live /reports call (2026-08-09) that Adobe accepts segmentDefinition inline.
 * @returns {Promise<object>} parsed Adobe API response containing the report rows
 */
async function runReport(reportSuiteId, metrics, dimension, startDate, endDate, segments) {
  const headers = await buildHeaders();
  const path = `/api/${config.globalCompanyId}/reports`;

  const globalFilters = [
    {
      type: "dateRange",
      // Assuming report-suite-local time, no "Z" suffix, exclusive end
      // boundary. A 7-day test range (today minus 7 days, through today)
      // returned exactly 7 daily rows, consistent with an exclusive end —
      // but this wasn't confirmed against known per-day values, so treat
      // as strong-but-not-certain if numbers look off near a range edge.
      dateRange: `${startDate}T00:00:00.000/${endDate}T00:00:00.000`,
    },
  ];

  if (Array.isArray(segments)) {
    for (const segment of segments) {
      globalFilters.push(
        typeof segment === "string"
          ? { type: "segment", segmentId: segment }
          : { type: "segment", segmentDefinition: segment }
      );
    }
  }

  const body = JSON.stringify({
    rsid: reportSuiteId,
    globalFilters,
    metricContainer: {
      metrics: metrics.map((metricId, index) => ({
        columnId: String(index),
        id: metricId,
      })),
    },
    // UNVERIFIED: defaulting to a day-by-day breakdown when no dimension is
    // given, since Adobe's schema appears to require *some* dimension value —
    // needs confirming whether an omitted `dimension` is actually rejected.
    dimension: dimension || "variables/daterangeday",
  });

  const response = await callProxy(POST(ANALYTICS_HOST, path, body, headers));
  return parseApiResponse(response, "runReport");
}

/**
 * Run a report on `dimension`, restricted to rows where `breakdownDimension`
 * equals `breakdownItemId` — the second call in a sequential drill-down
 * (see CLAUDE.md's "dimension is singular" note under MCP tools).
 * @param {string} reportSuiteId
 * @param {string[]} metrics - metric IDs, from listMetrics
 * @param {string} dimension - dimension ID to break down by in the results, from listDimensions
 * @param {string} breakdownDimension - the dimension ID being filtered on, from a prior listDimensions/runReport call
 * @param {string} breakdownItemId - the specific item ID (from that prior call's results) to restrict to
 * @param {string} startDate - ISO date (YYYY-MM-DD), inclusive
 * @param {string} endDate - ISO date (YYYY-MM-DD), exclusive
 * @param {(string|object)[]} [segments] - optional list of saved segment IDs and/or inline
 *   ad hoc segment definitions to filter by. A string entry is sent as `segmentId`; an object
 *   entry is sent as `segmentDefinition` (Adobe's func/container/pred segment JSON — see
 *   scripts/test-inline-segment.js for a real, confirmed-working example). Confirmed against a
 *   live /reports call (2026-08-09) that Adobe accepts segmentDefinition inline.
 * @returns {Promise<object>} parsed Adobe API response containing the breakdown rows
 */
async function runBreakdownReport(
  reportSuiteId,
  metrics,
  dimension,
  breakdownDimension,
  breakdownItemId,
  startDate,
  endDate,
  segments
) {
  const headers = await buildHeaders();
  const path = `/api/${config.globalCompanyId}/reports`;

  const globalFilters = [
    {
      type: "dateRange",
      dateRange: `${startDate}T00:00:00.000/${endDate}T00:00:00.000`,
    },
  ];

  if (Array.isArray(segments)) {
    for (const segment of segments) {
      globalFilters.push(
        typeof segment === "string"
          ? { type: "segment", segmentId: segment }
          : { type: "segment", segmentDefinition: segment }
      );
    }
  }

  const body = JSON.stringify({
    rsid: reportSuiteId,
    globalFilters,
    metricContainer: {
      metrics: metrics.map((metricId, index) => ({
        columnId: String(index),
        id: metricId,
        filters: ["0"],
      })),
      metricFilters: [
        {
          id: "0",
          type: "breakdown",
          dimension: breakdownDimension,
          itemId: breakdownItemId,
        },
      ],
    },
    dimension,
  });

  const response = await callProxy(POST(ANALYTICS_HOST, path, body, headers));
  return parseApiResponse(response, "runBreakdownReport");
}

module.exports = { listReportSuites, listMetrics, listDimensions, runReport, runBreakdownReport };