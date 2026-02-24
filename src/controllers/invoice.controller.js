const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const { ORDER_STATUSES } = require("../constants/order");
const { INVOICE_STATUSES, DISCOUNT_TYPES } = require("../constants/invoice");

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

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const parseDiscountPayload = (body) => {
  let type = body?.discountType;
  let value = body?.discountValue;

  if (body?.discount && typeof body.discount === "object") {
    if (type === undefined) type = body.discount.type;
    if (value === undefined) value = body.discount.value;
  }

  const provided = type !== undefined || value !== undefined;
  if (!provided) return { provided: false, type: null, value: 0, error: null };

  const normalizedType = String(type || "").trim().toUpperCase();
  if (!Object.values(DISCOUNT_TYPES).includes(normalizedType)) {
    return { provided: true, type: null, value: 0, error: "discountType must be PERCENTAGE or FLAT" };
  }

  const valueRaw = parseNumber(value);
  if (valueRaw === null || valueRaw === undefined) {
    return { provided: true, type: null, value: 0, error: "discountValue must be a number" };
  }
  if (valueRaw < 0) {
    return { provided: true, type: null, value: 0, error: "discountValue must be >= 0" };
  }
  if (normalizedType === DISCOUNT_TYPES.PERCENTAGE && valueRaw > 100) {
    return { provided: true, type: null, value: 0, error: "discountValue must be between 0 and 100" };
  }

  return { provided: true, type: normalizedType, value: valueRaw, error: null };
};

const computeDiscountAmount = (grandTotal, type, value) => {
  if (!type || value === undefined || value === null) return 0;
  if (type === DISCOUNT_TYPES.PERCENTAGE) return roundMoney((grandTotal * value) / 100);
  return roundMoney(value);
};

const snapshotOrderItems = (items) =>
  (items || []).map((item) => ({
    itemId: item.itemId,
    variantId: item.variantId,
    name: item.name,
    variantName: item.variantName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    options: (item.options || []).map((option) => ({
      optionId: option.optionId,
      name: option.name,
      price: option.price,
    })),
    note: item.note || "",
    taxPercentage: item.taxPercentage,
    lineSubTotal: item.lineSubTotal,
    lineTax: item.lineTax,
    lineTotal: item.lineTotal,
  }));

const toInvoiceResponse = (invoice) => {
  const paidAmount = invoice.payment?.paidAmount || 0;
  const balanceDue = roundMoney(Math.max(0, invoice.totalDue - paidAmount));

  return {
    id: invoice._id,
    tenantId: invoice.tenantId,
    orderId: invoice.orderId,
    table: {
      id: invoice.tableId,
      number: invoice.tableNumber,
      name: invoice.tableName || "",
    },
    status: invoice.status,
    note: invoice.note || "",
    items: (invoice.items || []).map((item) => ({
      itemId: item.itemId,
      variantId: item.variantId,
      name: item.name,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxPercentage: item.taxPercentage,
      options: (item.options || []).map((option) => ({
        optionId: option.optionId,
        name: option.name,
        price: option.price,
      })),
      note: item.note || "",
      lineSubTotal: item.lineSubTotal,
      lineTax: item.lineTax,
      lineTotal: item.lineTotal,
    })),
    subTotal: invoice.subTotal,
    taxTotal: invoice.taxTotal,
    grandTotal: invoice.grandTotal,
    discount: {
      type: invoice.discountType || null,
      value: invoice.discountValue || 0,
      amount: invoice.discountAmount || 0,
    },
    totalDue: invoice.totalDue,
    balanceDue,
    payment: invoice.payment?.paidAt
      ? {
          method: invoice.payment.method || "",
          reference: invoice.payment.reference || "",
          paidAmount: invoice.payment.paidAmount,
          paidAt: invoice.payment.paidAt,
        }
      : null,
    createdBy: invoice.createdBy,
    updatedBy: invoice.updatedBy,
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
};

const formatError = (res, error, fallbackMessage) => {
  if (error?.code === 11000) return res.status(409).json({ message: fallbackMessage || "duplicate value conflict" });
  if (error?.name === "ValidationError") {
    const firstError = Object.values(error.errors || {})[0];
    return res.status(400).json({ message: firstError?.message || "validation failed" });
  }
  if (error?.name === "CastError") return res.status(400).json({ message: `invalid ${error.path}` });
  return res.status(500).json({ message: error?.message || "internal server error" });
};

exports.createInvoice = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const orderId = req.body?.orderId ? String(req.body.orderId) : "";
    const note = req.body?.note ? String(req.body.note).trim() : "";

    if (!isObjectId(orderId)) return res.status(400).json({ message: "valid orderId is required" });

    const order = await Order.findOne({ _id: orderId, tenantId });
    if (!order) return res.status(404).json({ message: "order not found" });
    if (order.status === ORDER_STATUSES.CANCELLED) {
      return res.status(409).json({ message: "cannot create invoice for cancelled order" });
    }

    const existing = await Invoice.findOne({ tenantId, orderId }).select("_id");
    if (existing) return res.status(409).json({ message: "invoice already exists for this order" });

    const discountInfo = parseDiscountPayload(req.body);
    if (discountInfo.error) return res.status(400).json({ message: discountInfo.error });

    const discountAmount = computeDiscountAmount(order.grandTotal, discountInfo.type, discountInfo.value);
    if (discountAmount > order.grandTotal) {
      return res.status(400).json({ message: "discount exceeds grand total" });
    }

    const totalDue = roundMoney(order.grandTotal - discountAmount);

    const created = await Invoice.create({
      tenantId,
      orderId: order._id,
      tableId: order.tableId,
      tableNumber: order.tableNumber,
      tableName: order.tableName || "",
      status: INVOICE_STATUSES.ISSUED,
      note,
      items: snapshotOrderItems(order.items),
      subTotal: order.subTotal,
      taxTotal: order.taxTotal,
      grandTotal: order.grandTotal,
      discountType: discountInfo.type,
      discountValue: discountInfo.value,
      discountAmount,
      totalDue,
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
      message: "invoice created",
      invoice: toInvoiceResponse(created),
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.listInvoices = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const query = { tenantId };

    if (req.query?.orderId !== undefined) {
      if (!isObjectId(req.query.orderId)) return res.status(400).json({ message: "invalid orderId" });
      query.orderId = req.query.orderId;
    }

    if (req.query?.tableId !== undefined) {
      if (!isObjectId(req.query.tableId)) return res.status(400).json({ message: "invalid tableId" });
      query.tableId = req.query.tableId;
    }

    if (req.query?.status) {
      const statuses = String(req.query.status)
        .split(",")
        .map((status) => status.trim().toUpperCase())
        .filter(Boolean);
      const invalid = statuses.find((status) => !Object.values(INVOICE_STATUSES).includes(status));
      if (invalid) return res.status(400).json({ message: "invalid status filter" });
      query.status = { $in: statuses };
    }

    const pagination = parsePagination(req.query);
    if (!pagination && (req.query?.page !== undefined || req.query?.limit !== undefined)) {
      return res.status(400).json({ message: "page must be >= 1 and limit must be between 1 and 100" });
    }

    const total = await Invoice.countDocuments(query);
    let cursor = Invoice.find(query).sort({ createdAt: -1, _id: -1 });
    if (pagination) cursor = cursor.skip(pagination.skip).limit(pagination.limit);

    const invoices = await cursor;
    return res.json({
      items: invoices.map(toInvoiceResponse),
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

exports.getInvoiceById = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { invoiceId } = req.params;
    if (!isObjectId(invoiceId)) return res.status(400).json({ message: "invalid invoiceId" });

    const invoice = await Invoice.findOne({ _id: invoiceId, tenantId });
    if (!invoice) return res.status(404).json({ message: "invoice not found" });

    return res.json({ invoice: toInvoiceResponse(invoice) });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.updateInvoice = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { invoiceId } = req.params;
    if (!isObjectId(invoiceId)) return res.status(400).json({ message: "invalid invoiceId" });

    const invoice = await Invoice.findOne({ _id: invoiceId, tenantId });
    if (!invoice) return res.status(404).json({ message: "invoice not found" });

    const updates = {};
    if (req.body?.note !== undefined) {
      updates.note = String(req.body.note || "").trim();
    }

    const discountInfo = parseDiscountPayload(req.body);
    if (discountInfo.provided) {
      if ([INVOICE_STATUSES.PAID, INVOICE_STATUSES.VOID].includes(invoice.status)) {
        return res.status(409).json({ message: "cannot update discount for paid or void invoice" });
      }
      if (discountInfo.error) return res.status(400).json({ message: discountInfo.error });

      const discountAmount = computeDiscountAmount(invoice.grandTotal, discountInfo.type, discountInfo.value);
      if (discountAmount > invoice.grandTotal) {
        return res.status(400).json({ message: "discount exceeds grand total" });
      }

      updates.discountType = discountInfo.type;
      updates.discountValue = discountInfo.value;
      updates.discountAmount = discountAmount;
      updates.totalDue = roundMoney(invoice.grandTotal - discountAmount);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "no updates provided" });
    }

    updates.updatedBy = {
      userId: req.auth.userId,
      role: req.auth.role,
      name: req.currentUser?.name || "",
    };

    const updated = await Invoice.findOneAndUpdate(
      { _id: invoiceId, tenantId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ message: "invoice not found" });

    return res.json({
      message: "invoice updated",
      invoice: toInvoiceResponse(updated),
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.payInvoice = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { invoiceId } = req.params;
    if (!isObjectId(invoiceId)) return res.status(400).json({ message: "invalid invoiceId" });

    const invoice = await Invoice.findOne({ _id: invoiceId, tenantId });
    if (!invoice) return res.status(404).json({ message: "invoice not found" });
    if (invoice.status === INVOICE_STATUSES.PAID) {
      return res.status(409).json({ message: "invoice already paid" });
    }
    if (invoice.status === INVOICE_STATUSES.VOID) {
      return res.status(409).json({ message: "cannot pay a void invoice" });
    }

    const paidAmountRaw =
      req.body?.paidAmount !== undefined ? parseNumber(req.body.paidAmount) : invoice.totalDue;
    if (paidAmountRaw === null || paidAmountRaw === undefined || paidAmountRaw < 0) {
      return res.status(400).json({ message: "paidAmount must be a number >= 0" });
    }
    if (paidAmountRaw < invoice.totalDue) {
      return res.status(400).json({ message: "paidAmount must be >= totalDue" });
    }

    const method = req.body?.method ? String(req.body.method).trim() : "";
    const reference = req.body?.reference ? String(req.body.reference).trim() : "";

    const updated = await Invoice.findOneAndUpdate(
      { _id: invoiceId, tenantId },
      {
        $set: {
          status: INVOICE_STATUSES.PAID,
          payment: {
            method,
            reference,
            paidAmount: roundMoney(paidAmountRaw),
            paidAt: new Date(),
          },
          updatedBy: {
            userId: req.auth.userId,
            role: req.auth.role,
            name: req.currentUser?.name || "",
          },
        },
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "invoice not found" });

    return res.json({
      message: "invoice paid",
      invoice: toInvoiceResponse(updated),
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.deleteInvoice = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { invoiceId } = req.params;
    if (!isObjectId(invoiceId)) return res.status(400).json({ message: "invalid invoiceId" });

    const invoice = await Invoice.findOne({ _id: invoiceId, tenantId }).select("status");
    if (!invoice) return res.status(404).json({ message: "invoice not found" });

    if (invoice.status === INVOICE_STATUSES.PAID) {
      return res.status(409).json({ message: "cannot delete a paid invoice" });
    }

    await Invoice.deleteOne({ _id: invoiceId, tenantId });
    return res.json({ message: "invoice deleted" });
  } catch (error) {
    return formatError(res, error);
  }
};
