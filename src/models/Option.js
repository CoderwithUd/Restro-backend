const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OptionGroup",
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
    price: {
      type: Number,
      min: 0,
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

optionSchema.index({ tenantId: 1, groupId: 1, name: 1 }, { unique: true });
optionSchema.index({ tenantId: 1, groupId: 1, isAvailable: 1, sortOrder: 1 });

module.exports = mongoose.model("Option", optionSchema);
