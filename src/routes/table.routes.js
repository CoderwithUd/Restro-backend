const express = require("express");
const tableController = require("../controllers/table.controller");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { ROLES } = require("../constants/roles");

const router = express.Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

router.post("/", requireRole([ROLES.OWNER, ROLES.MANAGER]), tableController.createTable);
router.get("/", requireRole([ROLES.OWNER, ROLES.MANAGER, ROLES.KITCHEN, ROLES.WAITER]), tableController.listTables);
router.get(
  "/:tableId/qr",
  requireRole([ROLES.OWNER, ROLES.MANAGER]),
  tableController.generateTableQr
);
router.post(
  "/:tableId/qr-token",
  requireRole([ROLES.OWNER, ROLES.MANAGER]),
  tableController.generateTableQrToken
);
router.put("/:tableId", requireRole([ROLES.OWNER, ROLES.MANAGER]), tableController.updateTable);
router.delete("/:tableId", requireRole([ROLES.OWNER, ROLES.MANAGER]), tableController.deleteTable);

module.exports = router;
