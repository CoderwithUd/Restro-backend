const Subscription = require("../models/Subscription");

const isSubscriptionActive = (subscription) => {
  if (!subscription) return false;
  if (!["TRIAL", "ACTIVE"].includes(subscription.status)) return false;
  return subscription.endsAt > new Date();
};

const requireActiveSubscription = async (req, res, next) => {
  const subscription = await Subscription.findOne({ tenantId: req.auth.tenantId });
  if (!isSubscriptionActive(subscription)) {
    return res.status(402).json({ message: "subscription inactive" });
  }
  req.currentSubscription = subscription;
  next();
};

module.exports = { requireActiveSubscription, isSubscriptionActive };
