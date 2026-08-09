"use strict";

/**
 * Normalize lib/proxy.js's two failure shapes into one. GET/POST resolve to
 * { data, error } for HTTP-level responses (including 401/403/500), but
 * reject with a plain { error } object (not an Error instance) for
 * network-level failures (DNS, proxy unreachable, TLS handshake) — see
 * CLAUDE.md's "Proxied HTTP helper" section. Wrapping every call site in
 * this means callers only ever handle one shape: a resolved { data, error }.
 * @param {Promise<{data: string, error?: string}>} proxyPromise
 * @returns {Promise<{data?: string, error?: string}>}
 */
async function callProxy(proxyPromise) {
  try {
    return await proxyPromise;
  } catch (err) {
    if (err && typeof err === "object" && "error" in err && !(err instanceof Error)) {
      return { error: err.error };
    }
    throw err;
  }
}

module.exports = { callProxy };
