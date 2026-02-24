const express = require("express");
const reportController = require("../controllers/report.controller");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { ROLES } = require("../constants/roles");

const router = express.Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

const MANAGER_ROLES = [ROLES.OWNER, ROLES.MANAGER];

router.get("/summary", requireRole(MANAGER_ROLES), reportController.getSummaryReport);

module.exports = router;
