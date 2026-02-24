const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const Expense = require("../models/Expense");
const { INVOICE_STATUSES } = require("../constants/invoice");

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const parseTzOffset = (value) => {
  const raw = parseNumber(value);
  if (raw === null || raw === undefined) return 0;
  const offset = Math.trunc(raw);
  if (offset < -720 || offset > 840) return null;
  return offset;
};

const startOfDayLocal = (localDate) =>
  new Date(Date.UTC(localDate.getUTCFullYear(), localDate.getUTCMonth(), localDate.getUTCDate(), 0, 0, 0, 0));

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const getRangeFromPeriod = (period, tzOffsetMinutes, weekStartsOn = 1) => {
  const offsetMs = tzOffsetMinutes * 60 * 1000;
  const nowUtc = new Date();
  const nowLocal = new Date(nowUtc.getTime() + offsetMs);

  let startLocal = null;
  let endLocal = null;

  switch (period) {
    case "today": {
      startLocal = startOfDayLocal(nowLocal);
      endLocal = addDays(startLocal, 1);
      break;
    }
    case "yesterday": {
      const todayLocal = startOfDayLocal(nowLocal);
      startLocal = addDays(todayLocal, -1);
      endLocal = todayLocal;
      break;
    }
    case "this_week": {
      const todayLocal = startOfDayLocal(nowLocal);
      const day = todayLocal.getUTCDay();
      const diff = (day - weekStartsOn + 7) % 7;
      startLocal = addDays(todayLocal, -diff);
      endLocal = addDays(startLocal, 7);
      break;
    }
    case "last_week": {
      const todayLocal = startOfDayLocal(nowLocal);
      const day = todayLocal.getUTCDay();
      const diff = (day - weekStartsOn + 7) % 7;
      const thisWeekStart = addDays(todayLocal, -diff);
      startLocal = addDays(thisWeekStart, -7);
      endLocal = thisWeekStart;
      break;
    }
    case "this_month": {
      startLocal = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), 1, 0, 0, 0, 0));
      endLocal = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth() + 1, 1, 0, 0, 0, 0));
      break;
    }
    case "last_month": {
      const monthStart = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), 1, 0, 0, 0, 0));
      startLocal = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth() - 1, 1, 0, 0, 0, 0));
      endLocal = monthStart;
      break;
    }
    case "all":
      return { start: null, end: null };
    default:
      return null;
  }

  const startUtc = startLocal ? new Date(startLocal.getTime() - offsetMs) : null;
  const endUtc = endLocal ? new Date(endLocal.getTime() - offsetMs) : null;
  return { start: startUtc, end: endUtc };
};

const buildDateMatch = (field, start, end) => {
  if (!start && !end) return {};
  const range = {};
  if (start) range.$gte = start;
  if (end) range.$lt = end;
  return { [field]: range };
};

exports.getSummaryReport = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const period = String(req.query?.period || "today").trim().toLowerCase();
    const tzOffsetMinutes = parseTzOffset(req.query?.tzOffsetMinutes);
    const weekStartsOnRaw = parseNumber(req.query?.weekStartsOn);

    if (tzOffsetMinutes === null) {
      return res.status(400).json({ message: "tzOffsetMinutes must be between -720 and 840" });
    }
    if (weekStartsOnRaw !== undefined && (weekStartsOnRaw < 0 || weekStartsOnRaw > 6)) {
      return res.status(400).json({ message: "weekStartsOn must be between 0 (Sun) and 6 (Sat)" });
    }

    let range = null;
    if (period === "custom") {
      const fromDate = req.query?.from ? new Date(req.query.from) : null;
      const toDate = req.query?.to ? new Date(req.query.to) : null;
      if (fromDate && Number.isNaN(fromDate.getTime())) return res.status(400).json({ message: "invalid from date" });
      if (toDate && Number.isNaN(toDate.getTime())) return res.status(400).json({ message: "invalid to date" });
      range = { start: fromDate, end: toDate };
    } else {
      range = getRangeFromPeriod(period, tzOffsetMinutes, weekStartsOnRaw ?? 1);
      if (!range) return res.status(400).json({ message: "invalid period" });
    }

    const orderMatch = { tenantId, ...buildDateMatch("createdAt", range.start, range.end) };
    const invoicePaidMatch = {
      tenantId,
      status: INVOICE_STATUSES.PAID,
      ...buildDateMatch("createdAt", range.start, range.end),
    };
    const invoiceAllMatch = { tenantId, ...buildDateMatch("createdAt", range.start, range.end) };
    const expenseMatch = { tenantId, ...buildDateMatch("expenseDate", range.start, range.end) };

    const [orderStatusAgg, paidInvoiceAgg, invoiceStatusAgg, expenseAgg] = await Promise.all([
      Order.aggregate([
        { $match: orderMatch },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Invoice.aggregate([
        { $match: invoicePaidMatch },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            grossSales: { $sum: "$grandTotal" },
            discountTotal: { $sum: "$discountAmount" },
            taxTotal: { $sum: "$taxTotal" },
            netSales: { $sum: "$totalDue" },
            paidTotal: { $sum: "$payment.paidAmount" },
          },
        },
      ]),
      Invoice.aggregate([
        { $match: invoiceAllMatch },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Expense.aggregate([
        { $match: expenseMatch },
        { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$amount" } } },
      ]),
    ]);

    const ordersByStatus = orderStatusAgg.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});
    const orderTotal = Object.values(ordersByStatus).reduce((sum, value) => sum + value, 0);

    const invoicesByStatus = invoiceStatusAgg.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});
    const invoiceTotal = Object.values(invoicesByStatus).reduce((sum, value) => sum + value, 0);

    const paid = paidInvoiceAgg[0] || {};
    const grossSales = roundMoney(paid.grossSales || 0);
    const discountTotal = roundMoney(paid.discountTotal || 0);
    const taxTotal = roundMoney(paid.taxTotal || 0);
    const netSales = roundMoney(paid.netSales || 0);
    const paidTotal = roundMoney(paid.paidTotal || 0);
    const paidCount = paid.count || 0;
    const avgTicket = paidCount ? roundMoney(netSales / paidCount) : 0;

    const expenses = expenseAgg[0] || { total: 0, count: 0 };
    const expenseTotal = roundMoney(expenses.total || 0);
    const netResult = roundMoney(netSales - expenseTotal);
    const profit = netResult >= 0 ? netResult : 0;
    const loss = netResult < 0 ? Math.abs(netResult) : 0;

    return res.json({
      range: {
        period,
        from: range.start,
        to: range.end,
        tzOffsetMinutes,
        weekStartsOn: weekStartsOnRaw ?? 1,
      },
      sales: {
        paidInvoices: paidCount,
        grossSales,
        discountTotal,
        taxTotal,
        netSales,
        paidTotal,
        avgTicket,
      },
      orders: {
        total: orderTotal,
        byStatus: ordersByStatus,
      },
      invoices: {
        total: invoiceTotal,
        byStatus: invoicesByStatus,
      },
      expenses: {
        total: expenseTotal,
        count: expenses.count || 0,
      },
      profitLoss: {
        netResult,
        profit,
        loss,
        note: "profit/loss calculated as netSales - expenses (COGS not included)",
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "internal server error" });
  }
};
