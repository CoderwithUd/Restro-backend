const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const Membership = require("../models/Membership");
const Subscription = require("../models/Subscription");
const RefreshSession = require("../models/RefreshSession");
const env = require("../config/env");
const { ROLES, STAFF_ROLES } = require("../constants/roles");
const { ensureUniqueTenantSlug, resolveTenantSlugFromRequest } = require("../helpers/tenant");
const {
  createAccessToken,
  createRefreshToken,
  hashToken,
  verifyRefreshToken,
} = require("../utils/authTokens");
const { isSubscriptionActive } = require("../middleware/subscription");

const getRefreshExpiryDate = () => {
  const now = Date.now();
  return new Date(now + 7 * 24 * 60 * 60 * 1000);
};

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "lax",
  path: "/",
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const clearAuthCookies = (res) => {
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
};

const buildPrincipal = (user, tenant, role) => ({
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
  },
  tenant: {
    id: tenant._id,
    name: tenant.name,
    slug: tenant.slug,
  },
  role,
});

const issueSessionTokens = async ({ userId, tenantId, role }) => {
  const session = await RefreshSession.create({
    userId,
    tenantId,
    role,
    tokenHash: "pending",
    expiresAt: getRefreshExpiryDate(),
  });

  const tokenPayload = {
    userId: String(userId),
    tenantId: String(tenantId),
    role,
    sessionId: String(session._id),
  };

  const accessToken = createAccessToken(tokenPayload);
  const refreshToken = createRefreshToken(tokenPayload);
  session.tokenHash = hashToken(refreshToken);
  await session.save();

  return { accessToken, refreshToken };
};

exports.registerOwner = async (req, res) => {
  const dbSession = await mongoose.startSession();
  try {
    const {
      name,
      email,
      password,
      restaurantName,
      restaurantSlug,
      contactNumber,
      gstNumber,
      address,
    } = req.body;
    if (!name || !email || !password || !restaurantName) {
      return res
        .status(400)
        .json({ message: "name, email, password and restaurantName are required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: "email already in use" });
    }

    let user;
    let tenant;
    await dbSession.withTransaction(async () => {
      const users = await User.create(
        [
          {
            name: String(name).trim(),
            email: normalizedEmail,
            password: await bcrypt.hash(password, 10),
          },
        ],
        { session: dbSession }
      );
      user = users[0];

      const slug = await ensureUniqueTenantSlug(restaurantSlug || restaurantName);
      const tenants = await Tenant.create(
        [
          {
            name: String(restaurantName).trim(),
            slug,
            ownerUserId: user._id,
            contactNumber: contactNumber ? String(contactNumber).trim() : undefined,
            gstNumber: gstNumber ? String(gstNumber).trim().toUpperCase() : undefined,
            address: address && typeof address === "object" ? address : undefined,
          },
        ],
        { session: dbSession }
      );
      tenant = tenants[0];

      await Membership.create(
        [
          {
            userId: user._id,
            tenantId: tenant._id,
            role: ROLES.OWNER,
            isActive: true,
          },
        ],
        { session: dbSession }
      );

      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
      await Subscription.create(
        [
          {
            tenantId: tenant._id,
            planCode: "TRIAL",
            status: "TRIAL",
            startsAt: now,
            endsAt: trialEndsAt,
          },
        ],
        { session: dbSession }
      );
    });

    const { accessToken, refreshToken } = await issueSessionTokens({
      userId: user._id,
      tenantId: tenant._id,
      role: ROLES.OWNER,
    });

    setAuthCookies(res, accessToken, refreshToken);
    return res.status(201).json({
      message: "owner registered",
      ...buildPrincipal(user, tenant, ROLES.OWNER),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  } finally {
    dbSession.endSession();
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const requestedRole = role ? String(role).toUpperCase() : null;
    if (requestedRole && !Object.values(ROLES).includes(requestedRole)) {
      return res.status(400).json({ message: "invalid role" });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select("+password");
    if (!user || !user.isActive) {
      return res.status(401).json({ message: "invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "invalid credentials" });
    }

    const memberships = await Membership.find({ userId: user._id, isActive: true }).populate(
      "tenantId",
      "name slug status"
    );
    if (!memberships.length) {
      return res.status(403).json({ message: "no restaurant access found" });
    }

    const requestedTenantSlug = resolveTenantSlugFromRequest(req);
    let eligibleMemberships = memberships.filter((entry) => entry.tenantId?.status === "ACTIVE");

    if (requestedTenantSlug) {
      eligibleMemberships = eligibleMemberships.filter(
        (entry) => entry.tenantId?.slug === requestedTenantSlug
      );
    }
    if (requestedRole) {
      eligibleMemberships = eligibleMemberships.filter((entry) => entry.role === requestedRole);
    }

    if (!eligibleMemberships.length) {
      return res.status(403).json({
        message: "no matching tenant access for provided tenantSlug/role",
      });
    }

    if (eligibleMemberships.length > 1 && !requestedTenantSlug) {
      return res.status(400).json({
        message: "multiple restaurants found, pass tenantSlug in body/header/subdomain",
        options: eligibleMemberships.map((item) => ({
          tenantName: item.tenantId.name,
          tenantSlug: item.tenantId.slug,
          role: item.role,
        })),
      });
    }

    const membership = eligibleMemberships[0];
    const tenant = membership.tenantId;

    const subscription = await Subscription.findOne({ tenantId: tenant._id });
    if (!isSubscriptionActive(subscription)) {
      return res.status(402).json({ message: "subscription inactive" });
    }

    const { accessToken, refreshToken } = await issueSessionTokens({
      userId: user._id,
      tenantId: tenant._id,
      role: membership.role,
    });

    setAuthCookies(res, accessToken, refreshToken);
    return res.json({
      message: "login success",
      ...buildPrincipal(user, tenant, membership.role),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.refresh = async (req, res) => {
  try {
    const incomingToken = req.cookies.refreshToken;
    if (!incomingToken) {
      return res.status(401).json({ message: "refresh token missing" });
    }

    let payload;
    try {
      payload = verifyRefreshToken(incomingToken);
    } catch (error) {
      clearAuthCookies(res);
      return res.status(401).json({ message: "invalid refresh token" });
    }

    const session = await RefreshSession.findById(payload.sid).select("+tokenHash");
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      clearAuthCookies(res);
      return res.status(401).json({ message: "session expired" });
    }

    if (session.tokenHash !== hashToken(incomingToken)) {
      session.revokedAt = new Date();
      await session.save();
      clearAuthCookies(res);
      return res.status(401).json({ message: "refresh token mismatch" });
    }

    const membership = await Membership.findOne({
      userId: session.userId,
      tenantId: session.tenantId,
      role: session.role,
      isActive: true,
    });
    if (!membership) {
      session.revokedAt = new Date();
      await session.save();
      clearAuthCookies(res);
      return res.status(403).json({ message: "membership revoked" });
    }

    const subscription = await Subscription.findOne({ tenantId: session.tenantId });
    if (!isSubscriptionActive(subscription)) {
      session.revokedAt = new Date();
      await session.save();
      clearAuthCookies(res);
      return res.status(402).json({ message: "subscription inactive" });
    }

    const accessToken = createAccessToken({
      userId: String(session.userId),
      tenantId: String(session.tenantId),
      role: session.role,
      sessionId: String(session._id),
    });
    const refreshToken = createRefreshToken({
      userId: String(session.userId),
      tenantId: String(session.tenantId),
      role: session.role,
      sessionId: String(session._id),
    });

    session.tokenHash = hashToken(refreshToken);
    session.expiresAt = getRefreshExpiryDate();
    await session.save();

    setAuthCookies(res, accessToken, refreshToken);
    return res.json({ message: "token refreshed" });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.logout = async (req, res) => {
  try {
    const incomingToken = req.cookies.refreshToken;
    if (incomingToken) {
      try {
        const payload = verifyRefreshToken(incomingToken);
        await RefreshSession.findByIdAndUpdate(payload.sid, { $set: { revokedAt: new Date() } });
      } catch (error) {
        // Always clear cookies even if token is invalid.
      }
    }
    clearAuthCookies(res);
    return res.json({ message: "logout success" });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.me = async (req, res) => {
  return res.json({
    user: {
      id: req.currentUser._id,
      name: req.currentUser.name,
      email: req.currentUser.email,
    },
    tenant: {
      id: req.currentTenant._id,
      name: req.currentTenant.name,
      slug: req.currentTenant.slug,
    },
    role: req.auth.role,
  });
};

exports.staffRoles = (req, res) => {
  return res.json({ roles: STAFF_ROLES });
};
