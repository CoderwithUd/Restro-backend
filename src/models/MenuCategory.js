const mongoose = require("mongoose");

const menuCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
  },
  { timestamps: true }
);

menuCategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("MenuCategory", menuCategorySchema);
