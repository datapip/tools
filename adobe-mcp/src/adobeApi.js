"use strict";

const { GET, POST } = require("../../lib/proxy");
const config = require("./config");
const { getAccessToken } = require("./adobeAuth");

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

async function listReportSuites() {
  const headers = await buildHeaders();
  const path = `/api/${config.globalCompanyId}/collections/suites`;

  const response = await GET(ANALYTICS_HOST, path, headers);
  return parseApiResponse(response, "listReportSuites");
}

async function listMetrics(reportSuiteId) {
  const headers = await buildHeaders();
  const path = `/api/${config.globalCompanyId}/metrics?rsid=${encodeURIComponent(
    reportSuiteId
  )}`;

  const response = await GET(ANALYTICS_HOST, path, headers);
  return parseApiResponse(response, "listMetrics");
}

async function listDimensions(reportSuiteId) {
  const headers = await buildHeaders();
  const path = `/api/${config.globalCompanyId}/dimensions?rsid=${encodeURIComponent(
    reportSuiteId
  )}`;

  const response = await GET(ANALYTICS_HOST, path, headers);
  return parseApiResponse(response, "listDimensions");
}

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
    for (const segmentId of segments) {
      globalFilters.push({ type: "segment", segmentId });
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

  const response = await POST(ANALYTICS_HOST, path, body, headers);
  return parseApiResponse(response, "runReport");
}

module.exports = { listReportSuites, listMetrics, listDimensions, runReport };