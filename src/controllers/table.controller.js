const mongoose = require("mongoose");
const crypto = require("crypto");
const Table = require("../models/Table");
const Order = require("../models/Order");
const Tenant = require("../models/Tenant");
const TableQrToken = require("../models/TableQrToken");
const { ACTIVE_ORDER_STATUSES } = require("../constants/order");
const QRCode = require("qrcode");

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
  qrPayload: table.qrPayload || "",
  qrFormat: table.qrFormat || "dataUrl",
  qrCode: table.qrCode || "",
  qrUpdatedAt: table.qrUpdatedAt || null,
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
    const tenant = await Tenant.findById(tenantId).select("name slug");
    if (!tenant) return res.status(404).json({ message: "tenant not found" });

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

    const baseUrl =
      process.env.PUBLIC_QR_BASE_URL || `${req.protocol}://${req.get("host")}/api/public/menu`;

    const url = new URL(baseUrl);
    url.searchParams.set("tenantSlug", tenant.slug);
    url.searchParams.set("tableId", String(table._id));

    const qrPayload = url.toString();
    const qrFormat = "dataUrl";
    const qrCode = await QRCode.toDataURL(qrPayload, { width: 320, margin: 1 });

    table.qrPayload = qrPayload;
    table.qrFormat = qrFormat;
    table.qrCode = qrCode;
    table.qrUpdatedAt = new Date();
    await table.save();

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

exports.generateTableQr = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { tableId } = req.params;
    if (!isObjectId(tableId)) return res.status(400).json({ message: "invalid tableId" });

    const table = await Table.findOne({ _id: tableId, tenantId, isActive: true });
    if (!table) return res.status(404).json({ message: "table not found" });

    const tenant = await Tenant.findById(tenantId).select("name slug");
    if (!tenant) return res.status(404).json({ message: "tenant not found" });

    const baseUrl =
      (req.query?.baseUrl ? String(req.query.baseUrl).trim() : "") ||
      process.env.PUBLIC_QR_BASE_URL ||
      `${req.protocol}://${req.get("host")}/api/public/menu`;

    const url = new URL(baseUrl);
    url.searchParams.set("tenantSlug", tenant.slug);
    url.searchParams.set("tableId", String(table._id));

    const format = String(req.query?.format || "dataUrl").toLowerCase();
    const qrPayload = url.toString();
    const qrFormat = format === "svg" ? "svg" : "dataUrl";

    let qr = null;
    if (qrFormat === "svg") {
      qr = await QRCode.toString(qrPayload, { type: "svg" });
    } else {
      qr = await QRCode.toDataURL(qrPayload, { width: 320, margin: 1 });
    }

    await Table.updateOne(
      { _id: table._id, tenantId },
      {
        $set: {
          qrPayload,
          qrFormat,
          qrCode: qr,
          qrUpdatedAt: new Date(),
        },
      }
    );

    return res.json({
      table: {
        id: table._id,
        number: table.number,
        name: table.name || "",
      },
      tenant: {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
      },
      qrPayload,
      format: qrFormat,
      qr,
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.generateTableQrToken = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { tableId } = req.params;
    if (!isObjectId(tableId)) return res.status(400).json({ message: "invalid tableId" });

    const table = await Table.findOne({ _id: tableId, tenantId, isActive: true });
    if (!table) return res.status(404).json({ message: "table not found" });

    const tenant = await Tenant.findById(tenantId).select("name slug");
    if (!tenant) return res.status(404).json({ message: "tenant not found" });

    const expiresInHoursRaw = parseNumber(req.body?.expiresInHours ?? req.query?.expiresInHours);
    const expiresAtRaw = req.body?.expiresAt ? new Date(req.body.expiresAt) : null;
    if (expiresAtRaw && Number.isNaN(expiresAtRaw.getTime())) {
      return res.status(400).json({ message: "expiresAt must be a valid date" });
    }
    if (expiresInHoursRaw === null) {
      return res.status(400).json({ message: "expiresInHours must be a number" });
    }

    const expiresInHours = expiresAtRaw ? null : expiresInHoursRaw ?? 24 * 30;
    if (expiresInHours !== null && expiresInHours <= 0) {
      return res.status(400).json({ message: "expiresInHours must be > 0" });
    }

    const expiresAt = expiresAtRaw || new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    if (expiresAt <= new Date()) return res.status(400).json({ message: "expiresAt must be in the future" });

    let token = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = crypto.randomBytes(16).toString("hex");
      // eslint-disable-next-line no-await-in-loop
      const exists = await TableQrToken.exists({ token: candidate });
      if (!exists) {
        token = candidate;
        break;
      }
    }
    if (!token) return res.status(500).json({ message: "unable to generate token" });

    const created = await TableQrToken.create({
      tenantId,
      tableId: table._id,
      token,
      expiresAt,
      isActive: true,
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

    const baseUrl =
      (req.body?.baseUrl ? String(req.body.baseUrl).trim() : "") ||
      (req.query?.baseUrl ? String(req.query.baseUrl).trim() : "") ||
      process.env.PUBLIC_QR_BASE_URL ||
      `${req.protocol}://${req.get("host")}/api/public/menu`;

    const url = new URL(baseUrl);
    url.searchParams.set("token", created.token);

    const format = String(req.body?.format || req.query?.format || "dataUrl").toLowerCase();
    const qrPayload = url.toString();

    let qr = null;
    if (format === "svg") {
      qr = await QRCode.toString(qrPayload, { type: "svg" });
    } else {
      qr = await QRCode.toDataURL(qrPayload, { width: 320, margin: 1 });
    }

    return res.json({
      table: {
        id: table._id,
        number: table.number,
        name: table.name || "",
      },
      tenant: {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
      },
      token: created.token,
      expiresAt: created.expiresAt,
      qrPayload,
      format,
      qr,
    });
  } catch (error) {
    return formatError(res, error);
  }
};
