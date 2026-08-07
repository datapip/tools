"use strict";

const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const REQUIRED_VARS = [
  "ADOBE_CLIENT_ID",
  "ADOBE_CLIENT_SECRET",
  "ADOBE_ORG_ID",
  "ADOBE_TECHNICAL_ACCOUNT_ID",
  "ADOBE_SCOPES",
  "ADOBE_GLOBAL_COMPANY_ID",
];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Check your .env file against CLAUDE.md's "Environment variables" section.`
    );
  }
}

validateEnv();

module.exports = {
  clientId: process.env.ADOBE_CLIENT_ID,
  clientSecret: process.env.ADOBE_CLIENT_SECRET,
  orgId: process.env.ADOBE_ORG_ID,
  technicalAccountId: process.env.ADOBE_TECHNICAL_ACCOUNT_ID,
  scopes: process.env.ADOBE_SCOPES,
  globalCompanyId: process.env.ADOBE_GLOBAL_COMPANY_ID,
};