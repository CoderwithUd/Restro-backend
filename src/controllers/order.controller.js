const mongoose = require("mongoose");
const Order = require("../models/Order");
const Table = require("../models/Table");
const MenuItem = require("../models/MenuItem");
const MenuVariant = require("../models/MenuVariant");
const ItemOptionGroup = require("../models/ItemOptionGroup");
const OptionGroup = require("../models/OptionGroup");
const Option = require("../models/Option");
const { ORDER_STATUSES } = require("../constants/order");
const { emitOrderEvent } = require("../socket");

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseStatus = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().toUpperCase();
  return Object.values(ORDER_STATUSES).includes(normalized) ? normalized : null;
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

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const toOrderResponse = (order) => ({
  id: order._id,
  tenantId: order.tenantId,
  table: {
    id: order.tableId,
    number: order.tableNumber,
    name: order.tableName || "",
  },
  status: order.status,
  note: order.note || "",
  items: order.items.map((item) => ({
    itemId: item.itemId,
    variantId: item.variantId,
    name: item.name,
    variantName: item.variantName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    taxPercentage: item.taxPercentage,
    options: item.options.map((option) => ({
      optionId: option.optionId,
      name: option.name,
      price: option.price,
    })),
    note: item.note || "",
    lineSubTotal: item.lineSubTotal,
    lineTax: item.lineTax,
    lineTotal: item.lineTotal,
  })),
  subTotal: order.subTotal,
  taxTotal: order.taxTotal,
  grandTotal: order.grandTotal,
  createdBy: order.createdBy,
  updatedBy: order.updatedBy,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
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

const normalizeOrderItemsPayload = (itemsPayload) => {
  if (!Array.isArray(itemsPayload) || itemsPayload.length === 0) {
    return { items: [], error: "items must be a non-empty array" };
  }

  const normalized = [];
  for (const [index, entry] of itemsPayload.entries()) {
    const itemId = entry?.itemId ? String(entry.itemId) : "";
    const variantId = entry?.variantId ? String(entry.variantId) : "";
    const quantityRaw = parseNumber(entry?.quantity);
    const note = entry?.note ? String(entry.note).trim() : "";
    const optionIds = Array.isArray(entry?.optionIds) ? entry.optionIds.map((id) => String(id)) : [];

    if (!isObjectId(itemId)) return { items: [], error: `items[${index}].itemId must be a valid ObjectId` };
    if (!isObjectId(variantId)) return { items: [], error: `items[${index}].variantId must be a valid ObjectId` };
    if (quantityRaw === null || !Number.isInteger(quantityRaw) || quantityRaw < 1) {
      return { items: [], error: `items[${index}].quantity must be an integer >= 1` };
    }

    const uniqueOptions = [...new Set(optionIds)];
    const invalidOption = uniqueOptions.find((id) => !isObjectId(id));
    if (invalidOption) {
      return { items: [], error: `items[${index}].optionIds must contain valid ObjectId values` };
    }

    normalized.push({
      itemId,
      variantId,
      quantity: quantityRaw,
      note,
      optionIds: uniqueOptions,
    });
  }

  return { items: normalized, error: null };
};

const buildOrderItems = async (tenantId, itemsPayload) => {
  const normalized = normalizeOrderItemsPayload(itemsPayload);
  if (normalized.error) return { items: [], totals: null, error: normalized.error };

  const itemIds = [...new Set(normalized.items.map((item) => item.itemId))];
  const variantIds = [...new Set(normalized.items.map((item) => item.variantId))];
  const optionIds = [...new Set(normalized.items.flatMap((item) => item.optionIds))];

  const [menuItems, variants, mappings, options] = await Promise.all([
    MenuItem.find({ tenantId, _id: { $in: itemIds } }),
    MenuVariant.find({ tenantId, _id: { $in: variantIds } }),
    ItemOptionGroup.find({ tenantId, itemId: { $in: itemIds } }),
    optionIds.length ? Option.find({ tenantId, _id: { $in: optionIds } }) : Promise.resolve([]),
  ]);

  if (menuItems.length !== itemIds.length) {
    return { items: [], totals: null, error: "one or more items not found" };
  }
  if (variants.length !== variantIds.length) {
    return { items: [], totals: null, error: "one or more variants not found" };
  }

  const itemById = new Map(menuItems.map((item) => [String(item._id), item]));
  const variantById = new Map(variants.map((variant) => [String(variant._id), variant]));
  const optionById = new Map(options.map((option) => [String(option._id), option]));

  for (const item of menuItems) {
    if (!item.isAvailable) return { items: [], totals: null, error: `item not available: ${item.name}` };
  }
  for (const variant of variants) {
    if (!variant.isAvailable) {
      return { items: [], totals: null, error: `variant not available: ${variant.name}` };
    }
  }

  const groupIdsByItem = new Map();
  for (const mapping of mappings) {
    const itemKey = String(mapping.itemId);
    if (!groupIdsByItem.has(itemKey)) groupIdsByItem.set(itemKey, new Set());
    groupIdsByItem.get(itemKey).add(String(mapping.groupId));
  }

  const allGroupIds = [...new Set(mappings.map((mapping) => String(mapping.groupId)))];
  const groups = allGroupIds.length
    ? await OptionGroup.find({ tenantId, _id: { $in: allGroupIds } })
    : [];
  const groupById = new Map(groups.map((group) => [String(group._id), group]));

  const orderItems = [];
  let subTotal = 0;
  let taxTotal = 0;
  let grandTotal = 0;

  for (const entry of normalized.items) {
    const item = itemById.get(entry.itemId);
    const variant = variantById.get(entry.variantId);

    if (!item || !variant) {
      return { items: [], totals: null, error: "item or variant not found" };
    }
    if (String(variant.itemId) !== String(item._id)) {
      return { items: [], totals: null, error: `variant does not belong to item: ${item.name}` };
    }

    const attachedGroupIds = groupIdsByItem.get(String(item._id)) || new Set();
    const selectedOptions = entry.optionIds.map((id) => optionById.get(id)).filter(Boolean);

    if (selectedOptions.length !== entry.optionIds.length) {
      return { items: [], totals: null, error: "one or more options not found" };
    }

    const selectedCounts = new Map();
    for (const option of selectedOptions) {
      if (!option.isAvailable) {
        return { items: [], totals: null, error: `option not available: ${option.name}` };
      }
      const groupId = String(option.groupId);
      if (!attachedGroupIds.has(groupId)) {
        return { items: [], totals: null, error: `option not allowed for item: ${item.name}` };
      }
      selectedCounts.set(groupId, (selectedCounts.get(groupId) || 0) + 1);
    }

    for (const groupId of attachedGroupIds) {
      const group = groupById.get(groupId);
      if (!group) {
        return { items: [], totals: null, error: "option group not found for selected item" };
      }
      const count = selectedCounts.get(groupId) || 0;
      if (count < group.minSelect) {
        return {
          items: [],
          totals: null,
          error: `minSelect not satisfied for group ${group.name}`,
        };
      }
      if (count > group.maxSelect) {
        return {
          items: [],
          totals: null,
          error: `maxSelect exceeded for group ${group.name}`,
        };
      }
    }

    const optionsPayload = selectedOptions.map((option) => ({
      optionId: option._id,
      name: option.name,
      price: option.price,
    }));
    const optionsTotal = roundMoney(optionsPayload.reduce((sum, option) => sum + option.price, 0));
    const unitPrice = roundMoney(variant.price + optionsTotal);
    const lineSubTotal = roundMoney(unitPrice * entry.quantity);
    const taxPercentage = Number.isFinite(item.taxPercentage) ? item.taxPercentage : 0;
    const lineTax = roundMoney((lineSubTotal * taxPercentage) / 100);
    const lineTotal = roundMoney(lineSubTotal + lineTax);

    subTotal = roundMoney(subTotal + lineSubTotal);
    taxTotal = roundMoney(taxTotal + lineTax);
    grandTotal = roundMoney(grandTotal + lineTotal);

    orderItems.push({
      itemId: item._id,
      variantId: variant._id,
      name: item.name,
      variantName: variant.name,
      quantity: entry.quantity,
      unitPrice,
      options: optionsPayload,
      note: entry.note,
      taxPercentage,
      lineSubTotal,
      lineTax,
      lineTotal,
    });
  }

  return { items: orderItems, totals: { subTotal, taxTotal, grandTotal }, error: null };
};

exports.createOrder = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const tableId = req.body?.tableId ? String(req.body.tableId) : "";
    const note = req.body?.note ? String(req.body.note).trim() : "";

    if (!isObjectId(tableId)) return res.status(400).json({ message: "valid tableId is required" });

    const table = await Table.findOne({ _id: tableId, tenantId, isActive: true });
    if (!table) return res.status(404).json({ message: "table not found" });

    const { items, totals, error } = await buildOrderItems(tenantId, req.body?.items);
    if (error) return res.status(400).json({ message: error });

    const created = await Order.create({
      tenantId,
      tableId: table._id,
      tableNumber: table.number,
      tableName: table.name || "",
      status: ORDER_STATUSES.PLACED,
      note,
      items,
      subTotal: totals.subTotal,
      taxTotal: totals.taxTotal,
      grandTotal: totals.grandTotal,
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

    const response = toOrderResponse(created);
    emitOrderEvent(tenantId, "order.created", { order: response });

    return res.status(201).json({
      message: "order created",
      order: response,
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.listOrders = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const query = { tenantId };

    if (req.query?.tableId !== undefined) {
      if (!isObjectId(req.query.tableId)) return res.status(400).json({ message: "invalid tableId" });
      query.tableId = req.query.tableId;
    }

    if (req.query?.status) {
      const statuses = String(req.query.status)
        .split(",")
        .map((status) => status.trim().toUpperCase())
        .filter(Boolean);
      const invalid = statuses.find((status) => !Object.values(ORDER_STATUSES).includes(status));
      if (invalid) return res.status(400).json({ message: "invalid status filter" });
      query.status = { $in: statuses };
    }

    const pagination = parsePagination(req.query);
    if (!pagination && (req.query?.page !== undefined || req.query?.limit !== undefined)) {
      return res.status(400).json({ message: "page must be >= 1 and limit must be between 1 and 100" });
    }

    const total = await Order.countDocuments(query);
    let cursor = Order.find(query).sort({ createdAt: -1, _id: -1 });
    if (pagination) cursor = cursor.skip(pagination.skip).limit(pagination.limit);

    const orders = await cursor;
    // console.log("Queried Orders:", orders); // Debug log to check the retrieved orders
    return res.json({
      items: orders.map(toOrderResponse),
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

exports.getOrderById = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { orderId } = req.params;
    if (!isObjectId(orderId)) return res.status(400).json({ message: "invalid orderId" });

    const order = await Order.findOne({ _id: orderId, tenantId });
    if (!order) return res.status(404).json({ message: "order not found" });

    return res.json({ order: toOrderResponse(order) });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.updateOrder = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { orderId } = req.params;
    if (!isObjectId(orderId)) return res.status(400).json({ message: "invalid orderId" });

    const updates = {};

    if (req.body?.tableId !== undefined) {
      const tableId = String(req.body.tableId || "");
      if (!isObjectId(tableId)) return res.status(400).json({ message: "valid tableId is required" });
      const table = await Table.findOne({ _id: tableId, tenantId, isActive: true });
      if (!table) return res.status(404).json({ message: "table not found" });
      updates.tableId = table._id;
      updates.tableNumber = table.number;
      updates.tableName = table.name || "";
    }

    if (req.body?.status !== undefined) {
      const status = parseStatus(req.body.status);
      if (!status) return res.status(400).json({ message: "invalid status" });
      updates.status = status;
    }

    if (req.body?.note !== undefined) {
      updates.note = String(req.body.note || "").trim();
    }

    if (req.body?.items !== undefined) {
      const { items, totals, error } = await buildOrderItems(tenantId, req.body.items);
      if (error) return res.status(400).json({ message: error });
      updates.items = items;
      updates.subTotal = totals.subTotal;
      updates.taxTotal = totals.taxTotal;
      updates.grandTotal = totals.grandTotal;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "no updates provided" });
    }

    updates.updatedBy = {
      userId: req.auth.userId,
      role: req.auth.role,
      name: req.currentUser?.name || "",
    };

    const updated = await Order.findOneAndUpdate(
      { _id: orderId, tenantId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "order not found" });

    const response = toOrderResponse(updated);
    emitOrderEvent(tenantId, "order.updated", { order: response });

    return res.json({
      message: "order updated",
      order: response,
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { orderId } = req.params;
    if (!isObjectId(orderId)) return res.status(400).json({ message: "invalid orderId" });

    const deleted = await Order.findOneAndDelete({ _id: orderId, tenantId });
    if (!deleted) return res.status(404).json({ message: "order not found" });

    emitOrderEvent(tenantId, "order.deleted", { orderId: deleted._id });

    return res.json({ message: "order deleted" });
  } catch (error) {
    return formatError(res, error);
  }
};
