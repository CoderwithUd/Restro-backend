const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuCategory",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    image: {
      type: String,
      default: "",
      trim: true,
    },
    taxPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
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

menuItemSchema.index({ tenantId: 1, categoryId: 1, name: 1 }, { unique: true });
menuItemSchema.index({ tenantId: 1, categoryId: 1, isAvailable: 1, sortOrder: 1 });
menuItemSchema.index({ tenantId: 1, name: 1 });

module.exports = mongoose.model("MenuItem", menuItemSchema);
