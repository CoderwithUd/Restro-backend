const mongoose = require("mongoose");
const { ROLES } = require("../constants/roles");

const membershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

membershipSchema.index({ userId: 1, tenantId: 1, role: 1 }, { unique: true });

module.exports = mongoose.model("Membership", membershipSchema);
