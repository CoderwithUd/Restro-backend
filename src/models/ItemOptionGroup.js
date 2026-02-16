const mongoose = require("mongoose");

const itemOptionGroupSchema = new mongoose.Schema(
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
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OptionGroup",
      required: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

itemOptionGroupSchema.index({ tenantId: 1, itemId: 1, groupId: 1 }, { unique: true });
itemOptionGroupSchema.index({ tenantId: 1, itemId: 1, sortOrder: 1 });
itemOptionGroupSchema.index({ tenantId: 1, groupId: 1 });

module.exports = mongoose.model("ItemOptionGroup", itemOptionGroupSchema);
