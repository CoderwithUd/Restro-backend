const mongoose = require("mongoose");
const Table = require("../models/Table");
const Order = require("../models/Order");
const { ACTIVE_ORDER_STATUSES } = require("../constants/order");

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseOptionalBoolean = (value) => {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
};

const toTableResponse = (table) => ({
  id: table._id,
  tenantId: table.tenantId,
  number: table.number,
  name: table.name || "",
  capacity: table.capacity ?? null,
  isActive: table.isActive,
  createdAt: table.createdAt,
  updatedAt: table.updatedAt,
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

exports.createTable = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const numberRaw = parseNumber(req.body?.number);
    const name = req.body?.name ? String(req.body.name).trim() : "";
    const capacityRaw = parseNumber(req.body?.capacity);
    const isActive = parseOptionalBoolean(req.body?.isActive);

    if (numberRaw === null || !Number.isInteger(numberRaw) || numberRaw < 1) {
      return res.status(400).json({ message: "number must be an integer >= 1" });
    }
    if (capacityRaw === null || (capacityRaw !== undefined && (!Number.isInteger(capacityRaw) || capacityRaw < 1))) {
      return res.status(400).json({ message: "capacity must be an integer >= 1" });
    }
    if (isActive === null) return res.status(400).json({ message: "isActive must be true or false" });

    const table = await Table.create({
      tenantId,
      number: numberRaw,
      name,
      capacity: capacityRaw ?? null,
      isActive: typeof isActive === "boolean" ? isActive : true,
    });

    return res.status(201).json({
      message: "table created",
      table: toTableResponse(table),
    });
  } catch (error) {
    return formatError(res, error, "table number already exists");
  }
};

exports.listTables = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const isActive = parseOptionalBoolean(req.query?.isActive);
    if (isActive === null) return res.status(400).json({ message: "isActive must be true or false" });

    const query = { tenantId };
    if (typeof isActive === "boolean") query.isActive = isActive;

    const tables = await Table.find(query).sort({ number: 1, name: 1, _id: 1 });
    return res.json({ items: tables.map(toTableResponse) });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.updateTable = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { tableId } = req.params;
    if (!isObjectId(tableId)) return res.status(400).json({ message: "invalid tableId" });

    const table = await Table.findOne({ _id: tableId, tenantId });
    if (!table) return res.status(404).json({ message: "table not found" });

    const updates = {};
    if (req.body?.number !== undefined) {
      const numberRaw = parseNumber(req.body.number);
      if (numberRaw === null || !Number.isInteger(numberRaw) || numberRaw < 1) {
        return res.status(400).json({ message: "number must be an integer >= 1" });
      }
      updates.number = numberRaw;
    }

    if (req.body?.name !== undefined) {
      updates.name = String(req.body.name || "").trim();
    }

    if (req.body?.capacity !== undefined) {
      const capacityRaw = parseNumber(req.body.capacity);
      if (capacityRaw === null || !Number.isInteger(capacityRaw) || capacityRaw < 1) {
        return res.status(400).json({ message: "capacity must be an integer >= 1" });
      }
      updates.capacity = capacityRaw;
    }

    if (req.body?.isActive !== undefined) {
      const isActive = parseOptionalBoolean(req.body.isActive);
      if (isActive === null) return res.status(400).json({ message: "isActive must be true or false" });
      updates.isActive = isActive;
    }

    const updated = await Table.findOneAndUpdate({ _id: tableId, tenantId }, { $set: updates }, { new: true });
    return res.json({
      message: "table updated",
      table: toTableResponse(updated),
    });
  } catch (error) {
    return formatError(res, error, "table number already exists");
  }
};

exports.deleteTable = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { tableId } = req.params;
    if (!isObjectId(tableId)) return res.status(400).json({ message: "invalid tableId" });

    const table = await Table.findOne({ _id: tableId, tenantId });
    if (!table) return res.status(404).json({ message: "table not found" });

    const hasActiveOrder = await Order.exists({
      tenantId,
      tableId,
      status: { $in: ACTIVE_ORDER_STATUSES },
    });
    if (hasActiveOrder) {
      return res.status(409).json({ message: "cannot delete table with active orders" });
    }

    await Table.deleteOne({ _id: tableId, tenantId });
    return res.json({ message: "table deleted" });
  } catch (error) {
    return formatError(res, error);
  }
};
