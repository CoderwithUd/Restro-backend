const mongoose = require("mongoose");
const { ORDER_STATUSES } = require("../constants/order");

const orderItemOptionSchema = new mongoose.Schema(
  {
    optionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Option",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    price: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuVariant",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    variantName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    options: {
      type: [orderItemOptionSchema],
      default: [],
    },
    note: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },
    taxPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    lineSubTotal: {
      type: Number,
      min: 0,
      default: 0,
    },
    lineTax: {
      type: Number,
      min: 0,
      default: 0,
    },
    lineTotal: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
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
    tableNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    tableName: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUSES),
      default: ORDER_STATUSES.PLACED,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "order must contain at least one item",
      },
    },
    subTotal: {
      type: Number,
      min: 0,
      default: 0,
    },
    taxTotal: {
      type: Number,
      min: 0,
      default: 0,
    },
    grandTotal: {
      type: Number,
      min: 0,
      default: 0,
    },
    createdBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      role: { type: String, required: true },
      name: { type: String, trim: true, maxlength: 60, default: "" },
    },
    updatedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      role: { type: String, required: true },
      name: { type: String, trim: true, maxlength: 60, default: "" },
    },
  },
  { timestamps: true }
);

orderSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, tableId: 1, createdAt: -1 });
orderSchema.index({ tenantId: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
