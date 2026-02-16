const mongoose = require("mongoose");

const optionGroupSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    minSelect: {
      type: Number,
      min: 0,
      default: 0,
    },
    maxSelect: {
      type: Number,
      min: 0,
      default: 1,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

optionGroupSchema.pre("validate", function validateSelectionRange() {
  if (this.minSelect > this.maxSelect) {
    throw new Error("minSelect cannot be greater than maxSelect");
  }
});

optionGroupSchema.index({ tenantId: 1, name: 1 }, { unique: true });
optionGroupSchema.index({ tenantId: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model("OptionGroup", optionGroupSchema);
