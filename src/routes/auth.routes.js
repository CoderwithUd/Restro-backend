const express = require("express");
const authController = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/register-owner", authController.registerOwner);
router.post("/register", authController.registerOwner);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", requireAuth, authController.me);
router.get("/staff-roles", authController.staffRoles);

module.exports = router;
