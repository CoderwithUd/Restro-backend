const Tenant = require("../models/Tenant");
const Subscription = require("../models/Subscription");
const Table = require("../models/Table");
const TableQrToken = require("../models/TableQrToken");
const Order = require("../models/Order");
const MenuCategory = require("../models/MenuCategory");
const MenuItem = require("../models/MenuItem");
const MenuVariant = require("../models/MenuVariant");
const ItemOptionGroup = require("../models/ItemOptionGroup");
const OptionGroup = require("../models/OptionGroup");
const Option = require("../models/Option");
const { ORDER_STATUSES } = require("../constants/order");
const { resolveTenantSlugFromRequest } = require("../helpers/tenant");
const { isSubscriptionActive } = require("../middleware/subscription");
const { _buildOrderItems } = require("./order.controller");
const { emitOrderEvent } = require("../socket");

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getTenantOrError = async (req, res) => {
  const slug = resolveTenantSlugFromRequest(req);
  if (!slug) {
    res.status(400).json({ message: "tenantSlug is required (header/body/query/subdomain)" });
    return null;
  }

  const tenant = await Tenant.findOne({ slug, status: "ACTIVE" });
  if (!tenant) {
    res.status(404).json({ message: "tenant not found or inactive" });
    return null;
  }

  const subscription = await Subscription.findOne({ tenantId: tenant._id });
  if (!isSubscriptionActive(subscription)) {
    res.status(402).json({ message: "subscription inactive" });
    return null;
  }

  return tenant;
};

const resolveTokenContext = async (tokenValue, res) => {
  const token = String(tokenValue || "").trim();
  if (!token) return null;

  const tokenDoc = await TableQrToken.findOne({ token, isActive: true });
  if (!tokenDoc) {
    res.status(404).json({ message: "token not found" });
    return null;
  }
  if (tokenDoc.expiresAt && tokenDoc.expiresAt <= new Date()) {
    res.status(400).json({ message: "token expired" });
    return null;
  }

  const [tenant, subscription, table] = await Promise.all([
    Tenant.findOne({ _id: tokenDoc.tenantId, status: "ACTIVE" }),
    Subscription.findOne({ tenantId: tokenDoc.tenantId }),
    Table.findOne({ _id: tokenDoc.tableId, tenantId: tokenDoc.tenantId, isActive: true }),
  ]);

  if (!tenant) {
    res.status(404).json({ message: "tenant not found or inactive" });
    return null;
  }
  if (!isSubscriptionActive(subscription)) {
    res.status(402).json({ message: "subscription inactive" });
    return null;
  }
  if (!table) {
    res.status(404).json({ message: "table not found" });
    return null;
  }

  return { tenant, table };
};

const toCategoryResponse = (category) => ({
  id: category._id,
  tenantId: category.tenantId,
  name: category.name,
  parentId: category.parentId,
  sortOrder: category.sortOrder,
  createdAt: category.createdAt,
  updatedAt: category.updatedAt,
});

const toVariantResponse = (variant) => ({
  id: variant._id,
  itemId: variant.itemId,
  name: variant.name,
  price: variant.price,
  sortOrder: variant.sortOrder,
  isAvailable: variant.isAvailable,
  createdAt: variant.createdAt,
  updatedAt: variant.updatedAt,
});

const toOptionResponse = (option) => ({
  id: option._id,
  groupId: option.groupId,
  name: option.name,
  price: option.price,
  sortOrder: option.sortOrder,
  isAvailable: option.isAvailable,
  createdAt: option.createdAt,
  updatedAt: option.updatedAt,
});

const toOptionGroupResponse = (group, options = []) => ({
  id: group._id,
  name: group.name,
  minSelect: group.minSelect,
  maxSelect: group.maxSelect,
  sortOrder: group.sortOrder,
  isActive: group.isActive,
  options,
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
});

const toItemResponse = (item, category, variants = [], optionGroups = []) => ({
  id: item._id,
  tenantId: item.tenantId,
  name: item.name,
  description: item.description,
  image: item.image,
  taxPercentage: item.taxPercentage,
  sortOrder: item.sortOrder,
  isAvailable: item.isAvailable,
  category: category
    ? {
        id: category._id,
        name: category.name,
        parentId: category.parentId,
      }
    : null,
  variants,
  optionGroups,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const buildCategoryTree = (categories, itemsByCategory = new Map()) => {
  const nodeMap = new Map();
  const roots = [];

  for (const category of categories) {
    nodeMap.set(String(category._id), {
      ...toCategoryResponse(category),
      items: itemsByCategory.get(String(category._id)) || [],
      children: [],
    });
  }

  for (const category of categories) {
    const node = nodeMap.get(String(category._id));
    if (category.parentId && nodeMap.has(String(category.parentId))) {
      nodeMap.get(String(category.parentId)).children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);

  return roots;
};

const buildPublicMenu = async (tenantId) => {
  const [categories, items] = await Promise.all([
    MenuCategory.find({ tenantId }).sort({ sortOrder: 1, name: 1 }),
    MenuItem.find({ tenantId, isAvailable: true }).sort({ sortOrder: 1, name: 1 }),
  ]);

  if (!items.length) {
    return buildCategoryTree(categories, new Map());
  }

  const itemIds = items.map((item) => item._id);
  const categoryIds = [...new Set(items.map((item) => String(item.categoryId)))];

  const [variants, mappings, categoriesForItems] = await Promise.all([
    MenuVariant.find({ tenantId, itemId: { $in: itemIds }, isAvailable: true }).sort({ sortOrder: 1, name: 1 }),
    ItemOptionGroup.find({ tenantId, itemId: { $in: itemIds } }).sort({ sortOrder: 1, createdAt: 1 }),
    MenuCategory.find({ tenantId, _id: { $in: categoryIds } }).select("_id name parentId"),
  ]);

  const groupIds = [...new Set(mappings.map((mapping) => String(mapping.groupId)))];
  const [groups, options] = await Promise.all([
    groupIds.length
      ? OptionGroup.find({ tenantId, _id: { $in: groupIds }, isActive: true }).sort({ sortOrder: 1, name: 1 })
      : Promise.resolve([]),
    groupIds.length
      ? Option.find({ tenantId, groupId: { $in: groupIds }, isAvailable: true }).sort({ sortOrder: 1, name: 1 })
      : Promise.resolve([]),
  ]);

  const categoryById = new Map(categoriesForItems.map((category) => [String(category._id), category]));
  const variantsByItem = new Map();
  const mappingsByItem = new Map();
  const optionsByGroup = new Map();
  const groupById = new Map(groups.map((group) => [String(group._id), group]));

  for (const variant of variants) {
    const key = String(variant.itemId);
    if (!variantsByItem.has(key)) variantsByItem.set(key, []);
    variantsByItem.get(key).push(toVariantResponse(variant));
  }

  for (const mapping of mappings) {
    const key = String(mapping.itemId);
    if (!mappingsByItem.has(key)) mappingsByItem.set(key, []);
    mappingsByItem.get(key).push(mapping);
  }

  for (const option of options) {
    const key = String(option.groupId);
    if (!optionsByGroup.has(key)) optionsByGroup.set(key, []);
    optionsByGroup.get(key).push(toOptionResponse(option));
  }

  const detailedItems = items.map((item) => {
    const itemKey = String(item._id);
    const category = categoryById.get(String(item.categoryId)) || null;
    const itemVariants = variantsByItem.get(itemKey) || [];
    const itemGroups =
      (mappingsByItem.get(itemKey) || [])
        .map((mapping) => {
          const group = groupById.get(String(mapping.groupId));
          if (!group) return null;
          return toOptionGroupResponse(group, optionsByGroup.get(String(group._id)) || []);
        })
        .filter(Boolean) || [];

    return toItemResponse(item, category, itemVariants, itemGroups);
  });

  const itemsByCategory = new Map();
  for (const item of detailedItems) {
    const categoryId = String(item.category?.id || "");
    if (!categoryId) continue;
    if (!itemsByCategory.has(categoryId)) itemsByCategory.set(categoryId, []);
    itemsByCategory.get(categoryId).push(item);
  }

  return buildCategoryTree(categories, itemsByCategory);
};

exports.getPublicMenu = async (req, res) => {
  try {
    const tokenValue = req.query?.token;
    let tenant = null;
    let table = null;

    if (tokenValue) {
      const tokenContext = await resolveTokenContext(tokenValue, res);
      if (!tokenContext) return null;
      tenant = tokenContext.tenant;
      table = tokenContext.table;
    } else {
      tenant = await getTenantOrError(req, res);
      if (!tenant) return null;

      const tableId = req.query?.tableId ? String(req.query.tableId) : "";
      const tableNumberRaw = req.query?.tableNumber ? parseNumber(req.query.tableNumber) : undefined;

      if (tableId) {
        table = await Table.findOne({ _id: tableId, tenantId: tenant._id, isActive: true });
      } else if (tableNumberRaw !== undefined) {
        if (tableNumberRaw === null || !Number.isInteger(tableNumberRaw) || tableNumberRaw < 1) {
          return res.status(400).json({ message: "tableNumber must be an integer >= 1" });
        }
        table = await Table.findOne({ tenantId: tenant._id, number: tableNumberRaw, isActive: true });
      }
    }

    const categories = await buildPublicMenu(tenant._id);
    return res.json({
      tenant: {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
      },
      table: table
        ? {
            id: table._id,
            number: table.number,
            name: table.name || "",
          }
        : null,
      categories,
    });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "internal server error" });
  }
};

exports.createPublicOrder = async (req, res) => {
  try {
    const tokenValue = req.body?.token || req.query?.token;
    let tenant = null;
    let table = null;

    if (tokenValue) {
      const tokenContext = await resolveTokenContext(tokenValue, res);
      if (!tokenContext) return null;
      tenant = tokenContext.tenant;
      table = tokenContext.table;
    } else {
      tenant = await getTenantOrError(req, res);
      if (!tenant) return null;

      const tableId = req.body?.tableId ? String(req.body.tableId) : "";
      const tableNumberRaw = req.body?.tableNumber ? parseNumber(req.body.tableNumber) : undefined;

      if (tableId) {
        table = await Table.findOne({ _id: tableId, tenantId: tenant._id, isActive: true });
      } else if (tableNumberRaw !== undefined) {
        if (tableNumberRaw === null || !Number.isInteger(tableNumberRaw) || tableNumberRaw < 1) {
          return res.status(400).json({ message: "tableNumber must be an integer >= 1" });
        }
        table = await Table.findOne({ tenantId: tenant._id, number: tableNumberRaw, isActive: true });
      }
    }

    if (!table) return res.status(404).json({ message: "table not found" });

    const customerName = String(req.body?.customerName || req.body?.name || "").trim();
    const customerPhone = String(req.body?.customerPhone || req.body?.phone || req.body?.mobile || "").trim();
    const note = req.body?.note ? String(req.body.note).trim() : "";

    if (!customerName) return res.status(400).json({ message: "customerName is required" });
    if (!customerPhone || customerPhone.length < 7 || customerPhone.length > 20) {
      return res.status(400).json({ message: "customerPhone must be 7-20 characters" });
    }

    const { items, totals, error } = await _buildOrderItems(String(tenant._id), req.body?.items);
    if (error) return res.status(400).json({ message: error });

    const created = await Order.create({
      tenantId: tenant._id,
      tableId: table._id,
      tableNumber: table.number,
      tableName: table.name || "",
      source: "QR",
      customerName,
      customerPhone,
      status: ORDER_STATUSES.PLACED,
      note,
      items,
      subTotal: totals.subTotal,
      taxTotal: totals.taxTotal,
      grandTotal: totals.grandTotal,
      createdBy: {
        userId: null,
        role: "GUEST",
        name: customerName,
      },
      updatedBy: {
        userId: null,
        role: "GUEST",
        name: customerName,
      },
    });

    const response = {
      id: created._id,
      tenantId: created.tenantId,
      table: {
        id: created.tableId,
        number: created.tableNumber,
        name: created.tableName || "",
      },
      source: created.source,
      customer: {
        name: created.customerName || "",
        phone: created.customerPhone || "",
      },
      status: created.status,
      note: created.note || "",
      items: created.items,
      subTotal: created.subTotal,
      taxTotal: created.taxTotal,
      grandTotal: created.grandTotal,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };

    emitOrderEvent(String(tenant._id), "order.created", { order: response });

    return res.status(201).json({
      message: "order created",
      order: response,
    });
  } catch (error) {
    return res.status(500).json({ message: error?.message || "internal server error" });
  }
};
