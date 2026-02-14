const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
    },
    planCode: {
      type: String,
      default: "TRIAL",
      trim: true,
    },
    status: {
      type: String,
      enum: ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"],
      default: "TRIAL",
    },
    startsAt: {
      type: Date,
      required: true,
    },
    endsAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
