"use strict";

const { POST } = require("../../lib/proxy");
const config = require("./config");
const { callProxy } = require("./proxyErrorHandling");

const TOKEN_HOST = "ims-na1.adobelogin.com";
const TOKEN_PATH = "/ims/token/v3";
const REFRESH_BUFFER_MS = 60 * 1000;

let cachedToken = null;
let cachedExpiresAt = 0;

function isCacheValid() {
  return cachedToken !== null && Date.now() < cachedExpiresAt - REFRESH_BUFFER_MS;
}

async function requestNewToken() {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: config.scopes,
  }).toString();

  const { data, error } = await callProxy(
    POST(TOKEN_HOST, TOKEN_PATH, body, {
      "Content-Type": "application/x-www-form-urlencoded",
    })
  );

  if (error) {
    throw new Error(`Adobe IMS token request failed: ${error}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch (parseErr) {
    throw new Error(
      `Adobe IMS token response was not valid JSON (got: ${data.slice(0, 200)})`
    );
  }

  if (!parsed.access_token) {
    throw new Error(
      `Adobe IMS token response missing access_token: ${JSON.stringify(parsed)}`
    );
  }

  return parsed;
}

async function getAccessToken() {
  if (isCacheValid()) {
    return cachedToken;
  }

  const tokenResponse = await requestNewToken();

  // Verified against a real response (2026-08-07): expires_in is in SECONDS
  // (came back as 86399, i.e. Adobe's standard 24h access token lifetime) —
  // not milliseconds as some Adobe IMS docs suggest for other endpoints.
  cachedToken = tokenResponse.access_token;
  cachedExpiresAt = Date.now() + tokenResponse.expires_in * 1000;

  return cachedToken;
}

module.exports = { getAccessToken };