const mongoose = require("mongoose");

const tableQrTokenSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Table",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 80,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      role: { type: String, required: true },
      name: { type: String, trim: true, maxlength: 60, default: "" },
    },
    updatedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      role: { type: String, required: true },
      name: { type: String, trim: true, maxlength: 60, default: "" },
    },
  },
  { timestamps: true }
);

tableQrTokenSchema.index({ tenantId: 1, tableId: 1, isActive: 1, expiresAt: -1 });

module.exports = mongoose.model("TableQrToken", tableQrTokenSchema);
