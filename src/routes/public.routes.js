const express = require("express");
const rateLimit = require("express-rate-limit");
const publicController = require("../controllers/public.controller");

const router = express.Router();

const publicMenuLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "too many requests, please try again later" },
});

const publicOrderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "too many requests, please try again later" },
});

router.get("/menu", publicMenuLimiter, publicController.getPublicMenu);
router.post("/orders", publicOrderLimiter, publicController.createPublicOrder);

module.exports = router;
