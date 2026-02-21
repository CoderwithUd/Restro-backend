const express = require("express");
const tenantController = require("../controllers/tenant.controller");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { ROLES } = require("../constants/roles");

const router = express.Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

router.get(
  "/profile",
  requireRole([ROLES.OWNER, ROLES.MANAGER, ROLES.KITCHEN, ROLES.WAITER]),
  tenantController.profile
);
router.get("/staff", requireRole([ROLES.OWNER, ROLES.MANAGER]), tenantController.listStaff);
router.post("/staff", requireRole([ROLES.OWNER, ROLES.MANAGER]), tenantController.createStaff);
router.post("/staff/register", requireRole([ROLES.OWNER, ROLES.MANAGER]), tenantController.createStaff);

module.exports = router;
