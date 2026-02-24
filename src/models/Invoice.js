const mongoose = require("mongoose");
const { INVOICE_STATUSES, DISCOUNT_TYPES } = require("../constants/invoice");

const invoiceItemOptionSchema = new mongoose.Schema(
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

const invoiceItemSchema = new mongoose.Schema(
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
      type: [invoiceItemOptionSchema],
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

const invoiceSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
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
      enum: Object.values(INVOICE_STATUSES),
      default: INVOICE_STATUSES.ISSUED,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    items: {
      type: [invoiceItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "invoice must contain at least one item",
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
    discountType: {
      type: String,
      enum: Object.values(DISCOUNT_TYPES),
      default: null,
    },
    discountValue: {
      type: Number,
      min: 0,
      default: 0,
    },
    discountAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalDue: {
      type: Number,
      min: 0,
      default: 0,
    },
    payment: {
      method: { type: String, trim: true, maxlength: 30, default: "" },
      reference: { type: String, trim: true, maxlength: 80, default: "" },
      paidAmount: { type: Number, min: 0, default: 0 },
      paidAt: { type: Date, default: null },
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

invoiceSchema.index({ tenantId: 1, orderId: 1 }, { unique: true });
invoiceSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
invoiceSchema.index({ tenantId: 1, tableId: 1, createdAt: -1 });

module.exports = mongoose.model("Invoice", invoiceSchema);
