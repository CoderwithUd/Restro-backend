const mongoose = require("mongoose");

const menuCategorySchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuCategory",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

menuCategorySchema.index({ tenantId: 1, parentId: 1, name: 1 }, { unique: true });
menuCategorySchema.index({ tenantId: 1, sortOrder: 1, name: 1 });

module.exports = mongoose.model("MenuCategory", menuCategorySchema);
