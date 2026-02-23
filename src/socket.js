const { Server } = require("socket.io");
const Membership = require("./models/Membership");
const Tenant = require("./models/Tenant");
const User = require("./models/User");
const { ROLES } = require("./constants/roles");
const { verifyAccessToken } = require("./utils/authTokens");

let ioInstance = null;

const parseCookies = (header) => {
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
};

const extractToken = (socket) => {
  const authToken = socket.handshake.auth?.accessToken;
  if (authToken) return authToken;

  const header = socket.handshake.headers?.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();

  const cookies = parseCookies(socket.handshake.headers?.cookie || "");
  if (cookies.accessToken) return cookies.accessToken;

  return null;
};

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: true, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket);
      if (!token) return next(new Error("access token missing"));

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

      if (!user || !user.isActive) return next(new Error("user inactive"));
      if (!tenant || tenant.status !== "ACTIVE") return next(new Error("restaurant is not active"));
      if (!membership) return next(new Error("membership not found"));

      socket.data.auth = {
        userId: String(user._id),
        tenantId: String(tenant._id),
        role: payload.role,
      };
      socket.data.user = user;
      socket.data.tenant = tenant;
      return next();
    } catch (error) {
      return next(new Error("invalid access token"));
    }
  });

  io.on("connection", (socket) => {
    const { tenantId, role } = socket.data.auth || {};
    if (!tenantId) return;

    socket.join(`tenant:${tenantId}`);

    if (role === ROLES.KITCHEN) {
      socket.join(`tenant:${tenantId}:kitchen`);
    }

    if (role === ROLES.OWNER || role === ROLES.MANAGER) {
      socket.join(`tenant:${tenantId}:management`);
    }
  });

  ioInstance = io;
  return io;
};

const emitOrderEvent = (tenantId, event, payload) => {
  if (!ioInstance) return;
  ioInstance.to(`tenant:${tenantId}`).emit(event, payload);
};

module.exports = { initSocket, emitOrderEvent };
