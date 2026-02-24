const mongoose = require("mongoose");

const tableSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    number: {
      type: Number,
      required: true,
      min: 1,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },
    capacity: {
      type: Number,
      min: 1,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    qrPayload: {
      type: String,
      trim: true,
      default: "",
    },
    qrFormat: {
      type: String,
      enum: ["dataUrl", "svg"],
      default: "dataUrl",
    },
    qrCode: {
      type: String,
      default: "",
    },
    qrUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

tableSchema.index({ tenantId: 1, number: 1 }, { unique: true });
tableSchema.index({ tenantId: 1, isActive: 1, number: 1 });

module.exports = mongoose.model("Table", tableSchema);
