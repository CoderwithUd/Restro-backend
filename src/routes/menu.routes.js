const express = require("express");
const menuController = require("../controllers/menu.controller");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { ROLES } = require("../constants/roles");

const router = express.Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

router.post("/categories", requireRole([ROLES.OWNER, ROLES.MANAGER]), menuController.createCategory);
router.get(
  "/categories",
  requireRole([ROLES.OWNER, ROLES.MANAGER, ROLES.KITCHEN, ROLES.WAITER]),
  menuController.listCategories
);

router.post("/items", requireRole([ROLES.OWNER, ROLES.MANAGER]), menuController.createItem);
router.get(
  "/items",
  requireRole([ROLES.OWNER, ROLES.MANAGER, ROLES.KITCHEN, ROLES.WAITER]),
  menuController.listItems
);
router.get(
  "/items/:itemId",
  requireRole([ROLES.OWNER, ROLES.MANAGER, ROLES.KITCHEN, ROLES.WAITER]),
  menuController.getItemById
);
router.put("/items/:itemId", requireRole([ROLES.OWNER, ROLES.MANAGER]), menuController.updateItem);
router.patch(
  "/items/:itemId/availability",
  requireRole([ROLES.KITCHEN]),
  menuController.updateItemAvailability
);
router.delete("/items/:itemId", requireRole([ROLES.OWNER, ROLES.MANAGER]), menuController.deleteItem);

module.exports = router;
