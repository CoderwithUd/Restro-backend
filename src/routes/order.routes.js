const express = require("express");
const orderController = require("../controllers/order.controller");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { ROLES } = require("../constants/roles");

const router = express.Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

const ALL_ROLES = [ROLES.OWNER, ROLES.MANAGER, ROLES.KITCHEN, ROLES.WAITER];

router.post("/", requireRole(ALL_ROLES), orderController.createOrder);
router.get("/", requireRole(ALL_ROLES), orderController.listOrders);
router.get("/:orderId", requireRole(ALL_ROLES), orderController.getOrderById);
router.put("/:orderId", requireRole(ALL_ROLES), orderController.updateOrder);
router.delete("/:orderId", requireRole(ALL_ROLES), orderController.deleteOrder);

module.exports = router;
