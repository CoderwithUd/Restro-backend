const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Membership = require("../models/Membership");
const Tenant = require("../models/Tenant");
const Subscription = require("../models/Subscription");
const { ROLES, STAFF_ROLES } = require("../constants/roles");

const publicStaff = (entry) => ({
  membershipId: entry._id,
  role: entry.role,
  isActive: entry.isActive,
  user: {
    id: entry.userId._id,
    name: entry.userId.name,
    email: entry.userId.email,
    isActive: entry.userId.isActive,
  },
});

const publicTenant = (tenant) => ({
  id: tenant._id,
  name: tenant.name,
  slug: tenant.slug,
  status: tenant.status,
  contactNumber: tenant.contactNumber || null,
  gstNumber: tenant.gstNumber || null,
  address: {
    line1: tenant.address?.line1 || null,
    line2: tenant.address?.line2 || null,
    city: tenant.address?.city || null,
    state: tenant.address?.state || null,
    country: tenant.address?.country || null,
    postalCode: tenant.address?.postalCode || null,
  },
});

exports.createStaff = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password and role are required" });
    }

    const normalizedRole = String(role).toUpperCase();
    if (!STAFF_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ message: "role must be MANAGER, KITCHEN or WAITER" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      return res.status(409).json({
        message: "email already exists; use dedicated invite flow for existing accounts",
      });
    }

    user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
    });

    const duplicate = await Membership.findOne({
      userId: user._id,
      tenantId: req.auth.tenantId,
      role: normalizedRole,
    });
    if (duplicate) {
      return res.status(409).json({ message: "staff already exists for this role" });
    }

    const membership = await Membership.create({
      userId: user._id,
      tenantId: req.auth.tenantId,
      role: normalizedRole,
      isActive: true,
    });

    const populated = await Membership.findById(membership._id).populate("userId", "name email isActive");
    return res.status(201).json({
      message: "staff created",
      staff: publicStaff(populated),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.listStaff = async (req, res) => {
  try {
    const memberships = await Membership.find({
      tenantId: req.auth.tenantId,
      role: { $in: [ROLES.OWNER, ...STAFF_ROLES] },
    }).populate("userId", "name email isActive");

    return res.json({
      items: memberships.map(publicStaff),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.profile = async (req, res) => {
  try {
    const [tenant, subscription] = await Promise.all([
      Tenant.findById(req.auth.tenantId),
      Subscription.findOne({ tenantId: req.auth.tenantId }),
    ]);

    if (!tenant) {
      return res.status(404).json({ message: "tenant not found" });
    }

    return res.json({
      tenant: publicTenant(tenant),
      user: {
        id: req.currentUser._id,
        name: req.currentUser.name,
        email: req.currentUser.email,
      },
      role: req.auth.role,
      subscription: subscription
        ? {
            planCode: subscription.planCode,
            status: subscription.status,
            startsAt: subscription.startsAt,
            endsAt: subscription.endsAt,
          }
        : null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};
