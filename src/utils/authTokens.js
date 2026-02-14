const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

const createAccessToken = ({ userId, tenantId, role, sessionId }) =>
  jwt.sign({ sub: userId, tenantId, role, sid: sessionId, type: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRES_IN,
  });

const createRefreshToken = ({ userId, tenantId, role, sessionId, expiresIn }) =>
  jwt.sign({ sub: userId, tenantId, role, sid: sessionId, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: expiresIn || env.REFRESH_TOKEN_EXPIRES_IN,
  });

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const verifyAccessToken = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET);
const verifyRefreshToken = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET);

module.exports = {
  createAccessToken,
  createRefreshToken,
  hashToken,
  verifyAccessToken,
  verifyRefreshToken,
};
