const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Membership = require("../models/Membership");
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
