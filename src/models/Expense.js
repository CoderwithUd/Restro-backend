const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      min: 0,
      required: true,
    },
    category: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "",
    },
    note: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    expenseDate: {
      type: Date,
      required: true,
      default: () => new Date(),
      index: true,
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

expenseSchema.index({ tenantId: 1, expenseDate: -1 });

module.exports = mongoose.model("Expense", expenseSchema);
