const dotenv = require("dotenv");

dotenv.config();

const requiredVars = ["PORT", "MONGO_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];

if (!process.env.MONGO_URI && process.env.MONGO_URL) {
  process.env.MONGO_URI = process.env.MONGO_URL;
}

const missingVars = requiredVars.filter((name) => !process.env[name]);

if (missingVars.length > 0) {
  throw new Error(`Missing environment variables: ${missingVars.join(", ")}`);
}

const cookieSecure =
  typeof process.env.COOKIE_SECURE === "string"
    ? process.env.COOKIE_SECURE === "true"
    : (process.env.NODE_ENV || "development") === "production";

const cookieSameSite = (process.env.COOKIE_SAME_SITE || (cookieSecure ? "none" : "lax")).toLowerCase();
const allowedSameSite = new Set(["lax", "strict", "none"]);

if (!allowedSameSite.has(cookieSameSite)) {
  throw new Error("COOKIE_SAME_SITE must be one of: lax, strict, none");
}

if (cookieSameSite === "none" && !cookieSecure) {
  throw new Error("COOKIE_SAME_SITE=none requires COOKIE_SECURE=true");
}

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5000,
  MONGO_URI: process.env.MONGO_URI,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  COOKIE_SECURE: cookieSecure,
  COOKIE_SAME_SITE: cookieSameSite,
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || "",
};
