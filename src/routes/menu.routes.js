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
router.put(
  "/categories/:categoryId",
  requireRole([ROLES.OWNER, ROLES.MANAGER]),
  menuController.updateCategory
);
router.delete(
  "/categories/:categoryId",
  requireRole([ROLES.OWNER, ROLES.MANAGER]),
  menuController.deleteCategory
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
router.patch(
  "/variants/:variantId/availability",
  requireRole([ROLES.KITCHEN]),
  menuController.updateVariantAvailability
);
router.delete("/items/:itemId", requireRole([ROLES.OWNER, ROLES.MANAGER]), menuController.deleteItem);

router.post(
  "/option-groups",
  requireRole([ROLES.OWNER, ROLES.MANAGER]),
  menuController.createOptionGroup
);
router.get(
  "/option-groups",
  requireRole([ROLES.OWNER, ROLES.MANAGER, ROLES.KITCHEN, ROLES.WAITER]),
  menuController.listOptionGroups
);
router.put(
  "/option-groups/:groupId",
  requireRole([ROLES.OWNER, ROLES.MANAGER]),
  menuController.updateOptionGroup
);
router.delete(
  "/option-groups/:groupId",
  requireRole([ROLES.OWNER, ROLES.MANAGER]),
  menuController.deleteOptionGroup
);

router.post(
  "/option-groups/:groupId/options",
  requireRole([ROLES.OWNER, ROLES.MANAGER]),
  menuController.createOption
);
router.put("/options/:optionId", requireRole([ROLES.OWNER, ROLES.MANAGER]), menuController.updateOption);
router.delete("/options/:optionId", requireRole([ROLES.OWNER, ROLES.MANAGER]), menuController.deleteOption);

router.get(
  "/menu",
  requireRole([ROLES.OWNER, ROLES.MANAGER, ROLES.KITCHEN, ROLES.WAITER]),
  menuController.getMenuAggregate
);

module.exports = router;
