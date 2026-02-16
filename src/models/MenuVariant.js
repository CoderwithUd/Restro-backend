const mongoose = require("mongoose");

const menuVariantSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 60,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isAvailable: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

menuVariantSchema.index({ tenantId: 1, itemId: 1, name: 1 }, { unique: true });
menuVariantSchema.index({ tenantId: 1, itemId: 1, isAvailable: 1, sortOrder: 1 });

module.exports = mongoose.model("MenuVariant", menuVariantSchema);
