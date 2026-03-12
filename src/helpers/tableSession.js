const Order = require("../models/Order");
const Invoice = require("../models/Invoice");
const { ORDER_STATUSES } = require("../constants/order");
const { INVOICE_STATUSES } = require("../constants/invoice");
const { TABLE_STATUSES } = require("../constants/table");
const Table = require("../models/Table");

const hasPendingTableSession = async (tenantId, tableId) => {
  const orders = await Order.find({
    tenantId,
    tableId,
    status: { $ne: ORDER_STATUSES.CANCELLED },
  }).select("_id");

  if (!orders.length) return false;

  const orderIds = orders.map((order) => order._id);
  const invoices = await Invoice.find({
    tenantId,
    orderId: { $in: orderIds },
  }).select("orderId status");

  const invoiceStatusByOrderId = new Map(
    invoices.map((invoice) => [String(invoice.orderId), invoice.status])
  );

  for (const order of orders) {
    const invoiceStatus = invoiceStatusByOrderId.get(String(order._id));
    if (!invoiceStatus) return true;
    if (invoiceStatus !== INVOICE_STATUSES.PAID) return true;
  }

  return false;
};

const syncTableStatusFromOrders = async (tenantId, tableId) => {
  const hasPendingSession = await hasPendingTableSession(tenantId, tableId);
  const nextStatus = hasPendingSession
    ? TABLE_STATUSES.OCCUPIED
    : TABLE_STATUSES.AVAILABLE;

  await Table.updateOne(
    { _id: tableId, tenantId },
    { $set: { status: nextStatus } }
  );

  return nextStatus;
};

module.exports = { hasPendingTableSession, syncTableStatusFromOrders };
