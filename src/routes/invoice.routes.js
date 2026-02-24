const express = require("express");
const invoiceController = require("../controllers/invoice.controller");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { ROLES } = require("../constants/roles");

const router = express.Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

const ALL_ROLES = [ROLES.OWNER, ROLES.MANAGER, ROLES.KITCHEN, ROLES.WAITER];

router.post("/", requireRole(ALL_ROLES), invoiceController.createInvoice);
router.get("/", requireRole(ALL_ROLES), invoiceController.listInvoices);
router.get("/:invoiceId", requireRole(ALL_ROLES), invoiceController.getInvoiceById);
router.put("/:invoiceId", requireRole(ALL_ROLES), invoiceController.updateInvoice);
router.post("/:invoiceId/pay", requireRole(ALL_ROLES), invoiceController.payInvoice);
router.delete("/:invoiceId", requireRole(ALL_ROLES), invoiceController.deleteInvoice);

module.exports = router;
