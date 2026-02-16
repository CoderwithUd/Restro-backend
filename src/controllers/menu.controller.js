const mongoose = require("mongoose");
const MenuCategory = require("../models/MenuCategory");
const MenuItem = require("../models/MenuItem");
const MenuVariant = require("../models/MenuVariant");
const OptionGroup = require("../models/OptionGroup");
const Option = require("../models/Option");
const ItemOptionGroup = require("../models/ItemOptionGroup");

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const parseOptionalBoolean = (value) => {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
};

const parseNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

const validateSelectionRules = (minSelect, maxSelect) => {
  if (!Number.isInteger(minSelect) || minSelect < 0) return "minSelect must be an integer >= 0";
  if (!Number.isInteger(maxSelect) || maxSelect < 0) return "maxSelect must be an integer >= 0";
  if (minSelect > maxSelect) return "minSelect cannot be greater than maxSelect";
  return null;
};

const normalizeObjectIdList = (values) => {
  if (!Array.isArray(values)) return { ids: [], error: null };
  const unique = [...new Set(values.map((id) => String(id)))];
  const invalid = unique.find((id) => !isObjectId(id));
  if (invalid) return { ids: [], error: "optionGroupIds must contain valid ObjectId values" };
  return { ids: unique, error: null };
};

const validateVariantsPayload = (variants) => {
  if (!Array.isArray(variants) || variants.length === 0) {
    return "variants is required and must contain at least one variant";
  }

  const normalized = [];
  const seenNames = new Set();
  for (const entry of variants) {
    const name = String(entry?.name || "").trim();
    const price = Number(entry?.price);
    const isAvailable = parseOptionalBoolean(entry?.isAvailable);
    const sortOrder = parseNumber(entry?.sortOrder);

    if (!name) return "each variant must have a valid name";
    if (!Number.isFinite(price) || price < 0) return "variant price must be a number >= 0";
    if (isAvailable === null) return "variant isAvailable must be true or false";
    if (sortOrder === null) return "variant sortOrder must be a number";
    if (seenNames.has(name.toLowerCase())) return "duplicate variant names are not allowed in one item payload";

    seenNames.add(name.toLowerCase());
    normalized.push({
      name,
      price,
      isAvailable: typeof isAvailable === "boolean" ? isAvailable : true,
      sortOrder: sortOrder ?? 0,
    });
  }
  return normalized;
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

const formatError = (res, error, fallbackMessage) => {
  if (error?.code === 11000) return res.status(409).json({ message: fallbackMessage || "duplicate value conflict" });

  if (error?.name === "ValidationError") {
    const firstError = Object.values(error.errors || {})[0];
    return res.status(400).json({ message: firstError?.message || "validation failed" });
  }

  if (error?.name === "CastError") return res.status(400).json({ message: `invalid ${error.path}` });
  return res.status(500).json({ message: error?.message || "internal server error" });
};

const buildItemDetails = async (tenantId, itemDocs) => {
  if (!itemDocs.length) return [];

  const itemIds = itemDocs.map((item) => item._id);
  const categoryIds = [...new Set(itemDocs.map((item) => String(item.categoryId)))];

  const [variants, mappings, categories] = await Promise.all([
    MenuVariant.find({ tenantId, itemId: { $in: itemIds } }).sort({ sortOrder: 1, name: 1 }),
    ItemOptionGroup.find({ tenantId, itemId: { $in: itemIds } }).sort({ sortOrder: 1, createdAt: 1 }),
    MenuCategory.find({ tenantId, _id: { $in: categoryIds } }).select("_id name parentId"),
  ]);

  const groupIds = [...new Set(mappings.map((mapping) => String(mapping.groupId)))];
  const [groups, options] = await Promise.all([
    groupIds.length
      ? OptionGroup.find({ tenantId, _id: { $in: groupIds } }).sort({ sortOrder: 1, name: 1 })
      : Promise.resolve([]),
    groupIds.length
      ? Option.find({ tenantId, groupId: { $in: groupIds } }).sort({ sortOrder: 1, name: 1 })
      : Promise.resolve([]),
  ]);

  const categoryById = new Map(categories.map((category) => [String(category._id), category]));
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

  return itemDocs.map((item) => {
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
};

const ensureCategoryBelongsToTenant = async (tenantId, categoryId, session) =>
  MenuCategory.findOne({ _id: categoryId, tenantId }).session(session || null);

const validateParentCategory = async (tenantId, parentId, categoryIdToExclude = null) => {
  if (!parentId) return { parentCategory: null, error: null };
  if (!isObjectId(parentId)) return { parentCategory: null, error: "invalid parentId" };
  if (categoryIdToExclude && String(categoryIdToExclude) === String(parentId)) {
    return { parentCategory: null, error: "category cannot be its own parent" };
  }

  const parentCategory = await MenuCategory.findOne({ _id: parentId, tenantId }).select("_id parentId");
  if (!parentCategory) return { parentCategory: null, error: "parent category not found" };
  return { parentCategory, error: null };
};

const createsCycle = async (tenantId, categoryId, nextParentId) => {
  if (!nextParentId) return false;

  let cursor = await MenuCategory.findOne({ _id: nextParentId, tenantId }).select("_id parentId");
  while (cursor) {
    if (String(cursor._id) === String(categoryId)) return true;
    if (!cursor.parentId) return false;
    cursor = await MenuCategory.findOne({ _id: cursor.parentId, tenantId }).select("_id parentId");
  }
  return false;
};

exports.createCategory = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const name = String(req.body?.name || "").trim();
    const sortOrderRaw = parseNumber(req.body?.sortOrder);
    const parentId = req.body?.parentId || null;

    if (!name) return res.status(400).json({ message: "name is required" });
    if (sortOrderRaw === null) return res.status(400).json({ message: "sortOrder must be a number" });

    const parentValidation = await validateParentCategory(tenantId, parentId);
    if (parentValidation.error) return res.status(400).json({ message: parentValidation.error });

    const category = await MenuCategory.create({
      tenantId,
      name,
      parentId: parentValidation.parentCategory ? parentValidation.parentCategory._id : null,
      sortOrder: sortOrderRaw ?? 0,
    });

    return res.status(201).json({
      message: "category created",
      category: toCategoryResponse(category),
    });
  } catch (error) {
    return formatError(res, error, "category with same name already exists under this parent");
  }
};

exports.listCategories = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const flat = req.query?.flat === "true";

    const categories = await MenuCategory.find({ tenantId }).sort({ sortOrder: 1, name: 1 });
    const nested = buildCategoryTree(categories);

    if (flat) {
      const childrenByParent = new Map();
      for (const category of categories) {
        const parentKey = category.parentId ? String(category.parentId) : "__ROOT__";
        if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
        childrenByParent.get(parentKey).push({
          id: category._id,
          name: category.name,
          sortOrder: category.sortOrder,
        });
      }

      return res.json({
        items: categories.map((category) => ({
          ...toCategoryResponse(category),
          children: childrenByParent.get(String(category._id)) || [],
        })),
      });
    }

    return res.json({ items: nested });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { categoryId } = req.params;

    if (!isObjectId(categoryId)) return res.status(400).json({ message: "invalid categoryId" });

    const category = await MenuCategory.findOne({ _id: categoryId, tenantId });
    if (!category) return res.status(404).json({ message: "category not found" });

    const updates = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ message: "name cannot be empty" });
      updates.name = name;
    }

    if (req.body?.sortOrder !== undefined) {
      const sortOrder = parseNumber(req.body.sortOrder);
      if (sortOrder === null) return res.status(400).json({ message: "sortOrder must be a number" });
      updates.sortOrder = sortOrder;
    }

    if (req.body?.parentId !== undefined) {
      const parentId = req.body.parentId || null;
      const parentValidation = await validateParentCategory(tenantId, parentId, categoryId);
      if (parentValidation.error) return res.status(400).json({ message: parentValidation.error });
      const cycle = await createsCycle(tenantId, categoryId, parentId);
      if (cycle) return res.status(400).json({ message: "parentId creates a circular hierarchy" });
      updates.parentId = parentValidation.parentCategory ? parentValidation.parentCategory._id : null;
    }

    const updated = await MenuCategory.findOneAndUpdate({ _id: categoryId, tenantId }, { $set: updates }, { new: true });
    return res.json({
      message: "category updated",
      category: toCategoryResponse(updated),
    });
  } catch (error) {
    return formatError(res, error, "category with same name already exists under this parent");
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { categoryId } = req.params;
    if (!isObjectId(categoryId)) return res.status(400).json({ message: "invalid categoryId" });

    const category = await MenuCategory.findOne({ _id: categoryId, tenantId }).select("_id");
    if (!category) return res.status(404).json({ message: "category not found" });

    const [childExists, itemExists] = await Promise.all([
      MenuCategory.exists({ tenantId, parentId: categoryId }),
      MenuItem.exists({ tenantId, categoryId }),
    ]);

    if (childExists || itemExists) {
      return res.status(409).json({
        message: "cannot delete category with child categories or items",
      });
    }

    await MenuCategory.deleteOne({ _id: categoryId, tenantId });
    return res.json({ message: "category deleted" });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.createItem = async (req, res) => {
  const session = await mongoose.startSession();
  let createdItemId = null;

  try {
    const tenantId = req.auth.tenantId;
    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const image = req.body?.image ? String(req.body.image).trim() : "";
    const categoryId = req.body?.categoryId;
    const taxPercentageRaw = parseNumber(req.body?.taxPercentage);
    const sortOrderRaw = parseNumber(req.body?.sortOrder);
    const parsedVariants = validateVariantsPayload(req.body?.variants);
    const { ids: optionGroupIds, error: optionGroupError } = normalizeObjectIdList(req.body?.optionGroupIds || []);

    if (!name) return res.status(400).json({ message: "name is required" });
    if (!categoryId || !isObjectId(categoryId)) return res.status(400).json({ message: "valid categoryId is required" });
    if (taxPercentageRaw === null) return res.status(400).json({ message: "taxPercentage must be a number between 0 and 100" });
    if (sortOrderRaw === null) return res.status(400).json({ message: "sortOrder must be a number" });
    if (!Number.isFinite(taxPercentageRaw ?? 0) || (taxPercentageRaw ?? 0) < 0 || (taxPercentageRaw ?? 0) > 100) {
      return res.status(400).json({ message: "taxPercentage must be between 0 and 100" });
    }
    if (typeof parsedVariants === "string") return res.status(400).json({ message: parsedVariants });
    if (optionGroupError) return res.status(400).json({ message: optionGroupError });

    await session.withTransaction(async () => {
      const category = await ensureCategoryBelongsToTenant(tenantId, categoryId, session);
      if (!category) {
        const error = new Error("category not found");
        error.statusCode = 404;
        throw error;
      }

      if (optionGroupIds.length) {
        const groupsCount = await OptionGroup.countDocuments({
          tenantId,
          _id: { $in: optionGroupIds },
        }).session(session);

        if (groupsCount !== optionGroupIds.length) {
          const error = new Error("one or more option groups not found for this tenant");
          error.statusCode = 404;
          throw error;
        }
      }

      const item = await MenuItem.create(
        [
          {
            tenantId,
            categoryId,
            name,
            description,
            image,
            taxPercentage: taxPercentageRaw ?? 0,
            sortOrder: sortOrderRaw ?? 0,
          },
        ],
        { session }
      );

      createdItemId = item[0]._id;

      await MenuVariant.insertMany(
        parsedVariants.map((variant) => ({
          tenantId,
          itemId: createdItemId,
          ...variant,
        })),
        { session }
      );

      if (optionGroupIds.length) {
        await ItemOptionGroup.insertMany(
          optionGroupIds.map((groupId, index) => ({
            tenantId,
            itemId: createdItemId,
            groupId,
            sortOrder: index,
          })),
          { session }
        );
      }
    });

    const createdItem = await MenuItem.findOne({ _id: createdItemId, tenantId });
    const [itemResponse] = await buildItemDetails(tenantId, [createdItem]);

    return res.status(201).json({
      message: "menu item created",
      item: itemResponse,
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return formatError(res, error, "menu item already exists in this category");
  } finally {
    session.endSession();
  }
};

exports.listItems = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const query = { tenantId };

    if (req.query?.categoryId !== undefined) {
      if (!isObjectId(req.query.categoryId)) return res.status(400).json({ message: "invalid categoryId" });
      query.categoryId = req.query.categoryId;
    }

    const isAvailable = parseOptionalBoolean(req.query?.isAvailable);
    if (isAvailable === null) return res.status(400).json({ message: "isAvailable must be true or false" });
    if (typeof isAvailable === "boolean") query.isAvailable = isAvailable;

    if (req.query?.q) {
      query.name = { $regex: escapeRegex(String(req.query.q).trim()), $options: "i" };
    }

    const pagination = parsePagination(req.query);
    if (!pagination && (req.query?.page !== undefined || req.query?.limit !== undefined)) {
      return res.status(400).json({ message: "page must be >= 1 and limit must be between 1 and 100" });
    }

    const total = await MenuItem.countDocuments(query);

    let cursor = MenuItem.find(query).sort({ sortOrder: 1, name: 1, _id: 1 });
    if (pagination) cursor = cursor.skip(pagination.skip).limit(pagination.limit);

    const items = await cursor;
    const detailed = await buildItemDetails(tenantId, items);

    return res.json({
      items: detailed,
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

exports.getItemById = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { itemId } = req.params;

    if (!isObjectId(itemId)) return res.status(400).json({ message: "invalid itemId" });

    const item = await MenuItem.findOne({ _id: itemId, tenantId });
    if (!item) return res.status(404).json({ message: "menu item not found" });

    const [responseItem] = await buildItemDetails(tenantId, [item]);
    return res.json({ item: responseItem });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.updateItem = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const tenantId = req.auth.tenantId;
    const { itemId } = req.params;
    if (!isObjectId(itemId)) return res.status(400).json({ message: "invalid itemId" });

    const name = String(req.body?.name || "").trim();
    const description = String(req.body?.description || "").trim();
    const image = req.body?.image ? String(req.body.image).trim() : "";
    const categoryId = req.body?.categoryId;
    const taxPercentageRaw = parseNumber(req.body?.taxPercentage);
    const sortOrderRaw = parseNumber(req.body?.sortOrder);
    const parsedVariants = validateVariantsPayload(req.body?.variants);
    const { ids: optionGroupIds, error: optionGroupError } = normalizeObjectIdList(req.body?.optionGroupIds || []);

    if (!name) return res.status(400).json({ message: "name is required" });
    if (!categoryId || !isObjectId(categoryId)) return res.status(400).json({ message: "valid categoryId is required" });
    if (taxPercentageRaw === null) return res.status(400).json({ message: "taxPercentage must be a number between 0 and 100" });
    if (sortOrderRaw === null) return res.status(400).json({ message: "sortOrder must be a number" });
    if (!Number.isFinite(taxPercentageRaw ?? 0) || (taxPercentageRaw ?? 0) < 0 || (taxPercentageRaw ?? 0) > 100) {
      return res.status(400).json({ message: "taxPercentage must be between 0 and 100" });
    }
    if (typeof parsedVariants === "string") return res.status(400).json({ message: parsedVariants });
    if (optionGroupError) return res.status(400).json({ message: optionGroupError });

    await session.withTransaction(async () => {
      const existingItem = await MenuItem.findOne({ _id: itemId, tenantId }).session(session);
      if (!existingItem) {
        const error = new Error("menu item not found");
        error.statusCode = 404;
        throw error;
      }

      const category = await ensureCategoryBelongsToTenant(tenantId, categoryId, session);
      if (!category) {
        const error = new Error("category not found");
        error.statusCode = 404;
        throw error;
      }

      if (optionGroupIds.length) {
        const groupsCount = await OptionGroup.countDocuments({
          tenantId,
          _id: { $in: optionGroupIds },
        }).session(session);
        if (groupsCount !== optionGroupIds.length) {
          const error = new Error("one or more option groups not found for this tenant");
          error.statusCode = 404;
          throw error;
        }
      }

      await MenuItem.updateOne(
        { _id: itemId, tenantId },
        {
          $set: {
            categoryId,
            name,
            description,
            image,
            taxPercentage: taxPercentageRaw ?? 0,
            sortOrder: sortOrderRaw ?? 0,
          },
        },
        { runValidators: true, session }
      );

      await MenuVariant.deleteMany({ tenantId, itemId }).session(session);
      await ItemOptionGroup.deleteMany({ tenantId, itemId }).session(session);

      await MenuVariant.insertMany(
        parsedVariants.map((variant) => ({
          tenantId,
          itemId,
          ...variant,
        })),
        { session }
      );

      if (optionGroupIds.length) {
        await ItemOptionGroup.insertMany(
          optionGroupIds.map((groupId, index) => ({
            tenantId,
            itemId,
            groupId,
            sortOrder: index,
          })),
          { session }
        );
      }
    });

    const updatedItem = await MenuItem.findOne({ _id: itemId, tenantId });
    const [responseItem] = await buildItemDetails(tenantId, [updatedItem]);
    return res.json({
      message: "menu item updated",
      item: responseItem,
    });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return formatError(res, error, "menu item already exists in this category");
  } finally {
    session.endSession();
  }
};

exports.updateItemAvailability = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { itemId } = req.params;
    if (!isObjectId(itemId)) return res.status(400).json({ message: "invalid itemId" });

    const isAvailable = parseOptionalBoolean(req.body?.isAvailable);
    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({ message: "isAvailable must be true or false" });
    }

    const item = await MenuItem.findOneAndUpdate(
      { _id: itemId, tenantId },
      { $set: { isAvailable } },
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ message: "menu item not found" });

    const [responseItem] = await buildItemDetails(tenantId, [item]);
    return res.json({
      message: "item availability updated",
      item: responseItem,
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.updateVariantAvailability = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { variantId } = req.params;
    if (!isObjectId(variantId)) return res.status(400).json({ message: "invalid variantId" });

    const isAvailable = parseOptionalBoolean(req.body?.isAvailable);
    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({ message: "isAvailable must be true or false" });
    }

    const variant = await MenuVariant.findOneAndUpdate(
      { _id: variantId, tenantId },
      { $set: { isAvailable } },
      { new: true, runValidators: true }
    );
    if (!variant) return res.status(404).json({ message: "variant not found" });

    return res.json({
      message: "variant availability updated",
      variant: toVariantResponse(variant),
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.deleteItem = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const tenantId = req.auth.tenantId;
    const { itemId } = req.params;
    if (!isObjectId(itemId)) return res.status(400).json({ message: "invalid itemId" });

    await session.withTransaction(async () => {
      const item = await MenuItem.findOneAndDelete({ _id: itemId, tenantId }).session(session);
      if (!item) {
        const error = new Error("menu item not found");
        error.statusCode = 404;
        throw error;
      }

      await Promise.all([
        MenuVariant.deleteMany({ tenantId, itemId }).session(session),
        ItemOptionGroup.deleteMany({ tenantId, itemId }).session(session),
      ]);
    });

    return res.json({ message: "menu item deleted" });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ message: error.message });
    return formatError(res, error);
  } finally {
    session.endSession();
  }
};

exports.createOptionGroup = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const name = String(req.body?.name || "").trim();
    const minSelectRaw = parseNumber(req.body?.minSelect);
    const maxSelectRaw = parseNumber(req.body?.maxSelect);
    const sortOrderRaw = parseNumber(req.body?.sortOrder);

    if (!name) return res.status(400).json({ message: "name is required" });
    if (minSelectRaw === null || maxSelectRaw === null || sortOrderRaw === null) {
      return res.status(400).json({ message: "minSelect, maxSelect and sortOrder must be numbers" });
    }

    const minSelect = Number.isInteger(minSelectRaw ?? 0) ? minSelectRaw ?? 0 : null;
    const maxSelect = Number.isInteger(maxSelectRaw ?? 1) ? maxSelectRaw ?? 1 : null;
    const validationMessage = validateSelectionRules(minSelect, maxSelect);
    if (validationMessage) return res.status(400).json({ message: validationMessage });

    const group = await OptionGroup.create({
      tenantId,
      name,
      minSelect,
      maxSelect,
      sortOrder: sortOrderRaw ?? 0,
    });

    return res.status(201).json({
      message: "option group created",
      optionGroup: toOptionGroupResponse(group, []),
    });
  } catch (error) {
    return formatError(res, error, "option group name already exists");
  }
};

exports.listOptionGroups = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const groups = await OptionGroup.find({ tenantId }).sort({ sortOrder: 1, name: 1 });
    const groupIds = groups.map((group) => group._id);
    const options = groupIds.length
      ? await Option.find({ tenantId, groupId: { $in: groupIds } }).sort({ sortOrder: 1, name: 1 })
      : [];

    const optionsByGroup = new Map();
    for (const option of options) {
      const groupId = String(option.groupId);
      if (!optionsByGroup.has(groupId)) optionsByGroup.set(groupId, []);
      optionsByGroup.get(groupId).push(toOptionResponse(option));
    }

    return res.json({
      items: groups.map((group) => toOptionGroupResponse(group, optionsByGroup.get(String(group._id)) || [])),
    });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.updateOptionGroup = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { groupId } = req.params;
    if (!isObjectId(groupId)) return res.status(400).json({ message: "invalid groupId" });

    const group = await OptionGroup.findOne({ _id: groupId, tenantId });
    if (!group) return res.status(404).json({ message: "option group not found" });

    const updates = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ message: "name cannot be empty" });
      updates.name = name;
    }

    if (req.body?.sortOrder !== undefined) {
      const sortOrder = parseNumber(req.body.sortOrder);
      if (sortOrder === null) return res.status(400).json({ message: "sortOrder must be a number" });
      updates.sortOrder = sortOrder;
    }

    const minSelectCandidate = req.body?.minSelect !== undefined ? parseNumber(req.body.minSelect) : group.minSelect;
    const maxSelectCandidate = req.body?.maxSelect !== undefined ? parseNumber(req.body.maxSelect) : group.maxSelect;

    if (minSelectCandidate === null || maxSelectCandidate === null) {
      return res.status(400).json({ message: "minSelect and maxSelect must be numbers" });
    }

    if (!Number.isInteger(minSelectCandidate) || !Number.isInteger(maxSelectCandidate)) {
      return res.status(400).json({ message: "minSelect and maxSelect must be integers" });
    }

    const ruleError = validateSelectionRules(minSelectCandidate, maxSelectCandidate);
    if (ruleError) return res.status(400).json({ message: ruleError });

    updates.minSelect = minSelectCandidate;
    updates.maxSelect = maxSelectCandidate;

    const updated = await OptionGroup.findOneAndUpdate({ _id: groupId, tenantId }, { $set: updates }, { new: true });
    const options = await Option.find({ tenantId, groupId }).sort({ sortOrder: 1, name: 1 });

    return res.json({
      message: "option group updated",
      optionGroup: toOptionGroupResponse(updated, options.map(toOptionResponse)),
    });
  } catch (error) {
    return formatError(res, error, "option group name already exists");
  }
};

exports.deleteOptionGroup = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { groupId } = req.params;
    if (!isObjectId(groupId)) return res.status(400).json({ message: "invalid groupId" });

    const group = await OptionGroup.findOne({ _id: groupId, tenantId });
    if (!group) return res.status(404).json({ message: "option group not found" });

    const attached = await ItemOptionGroup.exists({ tenantId, groupId });
    if (attached) {
      return res.status(409).json({ message: "cannot delete option group because it is attached to menu items" });
    }

    await Promise.all([
      OptionGroup.deleteOne({ _id: groupId, tenantId }),
      Option.deleteMany({ tenantId, groupId }),
    ]);

    return res.json({ message: "option group deleted" });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.createOption = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { groupId } = req.params;
    const name = String(req.body?.name || "").trim();
    const priceRaw = parseNumber(req.body?.price);
    const sortOrderRaw = parseNumber(req.body?.sortOrder);
    const isAvailable = parseOptionalBoolean(req.body?.isAvailable);

    if (!isObjectId(groupId)) return res.status(400).json({ message: "invalid groupId" });
    if (!name) return res.status(400).json({ message: "name is required" });
    if (priceRaw === null || !Number.isFinite(priceRaw ?? 0) || (priceRaw ?? 0) < 0) {
      return res.status(400).json({ message: "price must be a number >= 0" });
    }
    if (sortOrderRaw === null) return res.status(400).json({ message: "sortOrder must be a number" });
    if (isAvailable === null) return res.status(400).json({ message: "isAvailable must be true or false" });

    const group = await OptionGroup.findOne({ _id: groupId, tenantId }).select("_id");
    if (!group) return res.status(404).json({ message: "option group not found" });

    const option = await Option.create({
      tenantId,
      groupId,
      name,
      price: priceRaw ?? 0,
      sortOrder: sortOrderRaw ?? 0,
      isAvailable: typeof isAvailable === "boolean" ? isAvailable : true,
    });

    return res.status(201).json({
      message: "option created",
      option: toOptionResponse(option),
    });
  } catch (error) {
    return formatError(res, error, "option with same name already exists in this group");
  }
};

exports.updateOption = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { optionId } = req.params;
    if (!isObjectId(optionId)) return res.status(400).json({ message: "invalid optionId" });

    const option = await Option.findOne({ _id: optionId, tenantId });
    if (!option) return res.status(404).json({ message: "option not found" });

    const updates = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ message: "name cannot be empty" });
      updates.name = name;
    }
    if (req.body?.price !== undefined) {
      const price = parseNumber(req.body.price);
      if (price === null || price < 0) return res.status(400).json({ message: "price must be a number >= 0" });
      updates.price = price;
    }
    if (req.body?.sortOrder !== undefined) {
      const sortOrder = parseNumber(req.body.sortOrder);
      if (sortOrder === null) return res.status(400).json({ message: "sortOrder must be a number" });
      updates.sortOrder = sortOrder;
    }
    if (req.body?.isAvailable !== undefined) {
      const isAvailable = parseOptionalBoolean(req.body.isAvailable);
      if (isAvailable === null) return res.status(400).json({ message: "isAvailable must be true or false" });
      updates.isAvailable = isAvailable;
    }

    const updated = await Option.findOneAndUpdate({ _id: optionId, tenantId }, { $set: updates }, { new: true });
    return res.json({
      message: "option updated",
      option: toOptionResponse(updated),
    });
  } catch (error) {
    return formatError(res, error, "option with same name already exists in this group");
  }
};

exports.deleteOption = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const { optionId } = req.params;
    if (!isObjectId(optionId)) return res.status(400).json({ message: "invalid optionId" });

    const deleted = await Option.findOneAndDelete({ _id: optionId, tenantId });
    if (!deleted) return res.status(404).json({ message: "option not found" });

    return res.json({ message: "option deleted" });
  } catch (error) {
    return formatError(res, error);
  }
};

exports.getMenuAggregate = async (req, res) => {
  try {
    const tenantId = req.auth.tenantId;
    const itemAvailability = parseOptionalBoolean(req.query?.isAvailable);
    if (itemAvailability === null) return res.status(400).json({ message: "isAvailable must be true or false" });

    const itemQuery = { tenantId };
    if (typeof itemAvailability === "boolean") itemQuery.isAvailable = itemAvailability;

    const [categories, items] = await Promise.all([
      MenuCategory.find({ tenantId }).sort({ sortOrder: 1, name: 1 }),
      MenuItem.find(itemQuery).sort({ sortOrder: 1, name: 1 }),
    ]);

    const detailedItems = await buildItemDetails(tenantId, items);
    const itemsByCategory = new Map();
    for (const item of detailedItems) {
      const categoryId = String(item.category?.id || "");
      if (!categoryId) continue;
      if (!itemsByCategory.has(categoryId)) itemsByCategory.set(categoryId, []);
      itemsByCategory.get(categoryId).push(item);
    }

    return res.json({
      categories: buildCategoryTree(categories, itemsByCategory),
    });
  } catch (error) {
    return formatError(res, error);
  }
};
