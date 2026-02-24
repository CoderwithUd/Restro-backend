const mongoose = require("mongoose");
const Expense = require("../models/Expense");

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePagination = (query) => {
  const pageRaw = parseNumber(query?.page);
  const limitRaw = parseNumber(query?.limit);

  if (pageRaw === null || limitRaw === null) return null;
  if (pageRaw !== undefined && pageRaw < 1) return null;
  if (limitRaw !== undefined && (limitRaw < 1 || limitRaw > 100)) return null;

  const page = pageRaw || 1;
  const limit = limitRaw || 20;
  return { page, limit, skip: (page - 1) * limit };
};

const toExpenseResponse = (expense) => ({
  id: expense._id,
  tenantId: expense.tenantId,
  amount: expense.amount,
  category: expense.category || "",
  note: expense.note || "",
  expenseDate: expense.expenseDate,
  createdBy: expense.createdBy,
  updatedBy: expense.updatedBy,
  createdAt: expense.createdAt,
  updatedAt: expense.updatedAt,
});

const formatError = (res, error, fallbackMessage) => {
  if (error?.code === 11000) return res.status(409).json({ message: fallbackMessage || "duplicate value conflict" });
  if (error?.name === "ValidationError") {
    const firstError = Object.values(error.errors || {})[0];
    return res.status(400).json({ message: firstError?.message || "validation failed" });
  }
  if (error?.name === "CastError") return res.status(400).json({ message: `invalid ${error.path}` });
  return res.status(500).json({ message: error?.message || "internal server error" });
};

exports.createExpense = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const amountRaw = parseNumber(req.body?.amount);
    const category = req.body?.category ? String(req.body.category).trim() : "";
    const note = req.body?.note ? String(req.body.note).trim() : "";
    const expenseDateRaw = req.body?.expenseDate ? new Date(req.body.expenseDate) : null;

    if (amountRaw === null || amountRaw === undefined || amountRaw < 0) {
      return res.status(400).json({ message: "amount must be a number >= 0" });
    }
    if (expenseDateRaw && Number.isNaN(expenseDateRaw.getTime())) {
      return res.status(400).json({ message: "expenseDate must be a valid date" });
    }

    const created = await Expense.create({
      tenantId,
      amount: amountRaw,
      category,
      note,
      expenseDate: expenseDateRaw || new Date(),
      createdBy: {
        userId: req.auth.userId,
        role: req.auth.role,
        name: req.currentUser?.name || "",
      },
      updatedBy: {
        userId: req.auth.userId,
        role: req.auth.role,
        name: req.currentUser?.name || "",
      },
    });

    return res.status(201).json({
      message: "expense created",
      expense: toExpenseResponse(created),
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.listExpenses = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const query = { tenantId };

    if (req.query?.from || req.query?.to) {
      const fromDate = req.query?.from ? new Date(req.query.from) : null;
      const toDate = req.query?.to ? new Date(req.query.to) : null;
      if (fromDate && Number.isNaN(fromDate.getTime())) return res.status(400).json({ message: "invalid from date" });
      if (toDate && Number.isNaN(toDate.getTime())) return res.status(400).json({ message: "invalid to date" });

      query.expenseDate = {};
      if (fromDate) query.expenseDate.$gte = fromDate;
      if (toDate) query.expenseDate.$lt = toDate;
    }

    const pagination = parsePagination(req.query);
    if (!pagination && (req.query?.page !== undefined || req.query?.limit !== undefined)) {
      return res.status(400).json({ message: "page must be >= 1 and limit must be between 1 and 100" });
    }

    const total = await Expense.countDocuments(query);
    let cursor = Expense.find(query).sort({ expenseDate: -1, _id: -1 });
    if (pagination) cursor = cursor.skip(pagination.skip).limit(pagination.limit);

    const expenses = await cursor;
    return res.json({
      items: expenses.map(toExpenseResponse),
      pagination: pagination
        ? {
            page: pagination.page,
            limit: pagination.limit,
            total,
            totalPages: Math.ceil(total / pagination.limit),
          }
        : { total },
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.updateExpense = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { expenseId } = req.params;
    if (!isObjectId(expenseId)) return res.status(400).json({ message: "invalid expenseId" });

    const expense = await Expense.findOne({ _id: expenseId, tenantId });
    if (!expense) return res.status(404).json({ message: "expense not found" });

    const updates = {};
    if (req.body?.amount !== undefined) {
      const amountRaw = parseNumber(req.body.amount);
      if (amountRaw === null || amountRaw < 0) return res.status(400).json({ message: "amount must be >= 0" });
      updates.amount = amountRaw;
    }
    if (req.body?.category !== undefined) {
      updates.category = String(req.body.category || "").trim();
    }
    if (req.body?.note !== undefined) {
      updates.note = String(req.body.note || "").trim();
    }
    if (req.body?.expenseDate !== undefined) {
      const expenseDate = req.body.expenseDate ? new Date(req.body.expenseDate) : null;
      if (!expenseDate || Number.isNaN(expenseDate.getTime())) {
        return res.status(400).json({ message: "expenseDate must be a valid date" });
      }
      updates.expenseDate = expenseDate;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "no updates provided" });
    }

    updates.updatedBy = {
      userId: req.auth.userId,
      role: req.auth.role,
      name: req.currentUser?.name || "",
    };

    const updated = await Expense.findOneAndUpdate(
      { _id: expenseId, tenantId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "expense not found" });

    return res.json({
      message: "expense updated",
      expense: toExpenseResponse(updated),
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.deleteExpense = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { expenseId } = req.params;
    if (!isObjectId(expenseId)) return res.status(400).json({ message: "invalid expenseId" });

    const deleted = await Expense.findOneAndDelete({ _id: expenseId, tenantId });
    if (!deleted) return res.status(404).json({ message: "expense not found" });

    return res.json({ message: "expense deleted" });
  } catch (error) {
    return formatError(res, error);
  }
};
