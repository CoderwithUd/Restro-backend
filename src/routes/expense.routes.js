const express = require("express");
const expenseController = require("../controllers/expense.controller");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { ROLES } = require("../constants/roles");

const router = express.Router();

router.use(requireAuth);
router.use(requireActiveSubscription);

const MANAGER_ROLES = [ROLES.OWNER, ROLES.MANAGER];

router.post("/", requireRole(MANAGER_ROLES), expenseController.createExpense);
router.get("/", requireRole(MANAGER_ROLES), expenseController.listExpenses);
router.put("/:expenseId", requireRole(MANAGER_ROLES), expenseController.updateExpense);
router.delete("/:expenseId", requireRole(MANAGER_ROLES), expenseController.deleteExpense);

module.exports = router;
