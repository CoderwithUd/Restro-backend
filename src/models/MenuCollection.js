const mongoose = require("mongoose");

const menuCollectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuCategory",
      required: true,
    },
    image: {
      type: String,
      default: "",
      trim: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
      index: true,
    },
    taxPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
  },
  { timestamps: true }
);

menuCollectionSchema.index({ tenantId: 1, categoryId: 1 });
menuCollectionSchema.index({ tenantId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("MenuCollection", menuCollectionSchema);
