const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9-]{3,50}$/,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED"],
      default: "ACTIVE",
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    contactNumber: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    address: {
      line1: { type: String, trim: true, maxlength: 120 },
      line2: { type: String, trim: true, maxlength: 120 },
      city: { type: String, trim: true, maxlength: 60 },
      state: { type: String, trim: true, maxlength: 60 },
      country: { type: String, trim: true, maxlength: 60 },
      postalCode: { type: String, trim: true, maxlength: 20 },
    },
  },
  { timestamps: true }
);

tenantSchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model("Tenant", tenantSchema);
