const Membership = require("../models/Membership");
const Tenant = require("../models/Tenant");
const User = require("../models/User");
const { verifyAccessToken } = require("../utils/authTokens");

const getBearerToken = (req) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
};

const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken || getBearerToken(req);
    if (!token) return res.status(401).json({ message: "access token missing" });

    const payload = verifyAccessToken(token);
    const [user, tenant, membership] = await Promise.all([
      User.findById(payload.sub).select("name email isActive"),
      Tenant.findById(payload.tenantId).select("name slug status"),
      Membership.findOne({
        userId: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        isActive: true,
      }),
    ]);

    if (!user || !user.isActive) return res.status(401).json({ message: "user inactive" });
    if (!tenant || tenant.status !== "ACTIVE") {
      return res.status(403).json({ message: "restaurant is not active" });
    }
    if (!membership) return res.status(403).json({ message: "membership not found" });

    req.auth = {
      userId: String(user._id),
      tenantId: String(tenant._id),
      role: payload.role,
      sessionId: payload.sid,
    };
    req.currentUser = user;
    req.currentTenant = tenant;
    next();
  } catch (error) {
    return res.status(401).json({ message: "invalid access token" });
  }
};

const requireRole = (roles) => (req, res, next) => {
  if (!req.auth) return res.status(401).json({ message: "unauthorized" });
  if (!roles.includes(req.auth.role)) return res.status(403).json({ message: "forbidden" });
  next();
};

module.exports = { requireAuth, requireRole };
