 /**
 * Example:
 * const { data, error } = await GET("dummyjson.com", "/test");
 */

// Import necessary modules
const fs = require("fs");
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const https = require("https");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { URL } = require("url");

// Define proxy details
const user = process.env.PROXY_USER;
const pwd = process.env.PROXY_PASS;
const proxyDomain = process.env.PROXY_DOMAIN;
const proxyPort = process.env.PROXY_PORT;
const proxyCert = process.env.PROXY_CERT;

// Construct the proxy URL
const proxyUrl = `http://${encodeURIComponent(user)}:${encodeURIComponent(
  pwd
)}@${proxyDomain}:${proxyPort}`;

// Check certificate
let agentOptions = {};
if (proxyCert) {
   try {
     agentOptions.ca = fs.readFileSync(path.resolve(proxyCert));
   } catch (e) {
     throw new Error(
       `PROXY_CERT is set to "${proxyCert}" but the file could not be read: ${e.message}`
     );
   }
}

// Create a proxy agent
const agent = new HttpsProxyAgent(new URL(proxyUrl), agentOptions);

/**
 * @param {string} host
 * @param {string} path
 * @param {object} headers?
 */
function proxiedGET(host, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = {
      "Content-Type": "application/json",
      ...headers,
    };

    const options = {
      hostname: host,
      port: 443,
      path: path,
      method: "GET",
      headers: reqHeaders,
      agent: agent,
    };

    let rawData = "";

    const req = https.request(options, (res) => {
      res.on("data", (chunk) => (rawData += chunk));

      res.on("end", () => resolve({ data: rawData }));
    });

    req.on("error", (e) => reject({ error: e.message }));

    req.end();
  });
}

/**
 * @param {string} host
 * @param {string} path
 * @param {string} body
 * @param {object} headers?
 */
async function proxiedPOST(host, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      ...headers,
    };

    const options = {
      hostname: host,
      port: 443,
      path: path,
      method: "POST",
      headers: reqHeaders,
      agent: agent,
    };

    let rawData = "";

    const req = https.request(options, (res) => {
      res.on("data", (chunk) => (rawData += chunk));

      res.on("end", () => resolve({ data: rawData }));
    });

    req.on("error", (e) => reject({ error: e.message }));

    req.write(body);

    req.end();
  });
}

module.exports = {
  GET: proxiedGET,
  POST: proxiedPOST,
};
