const mongoose = require("mongoose");
const MenuCollection = require("../models/MenuCollection");
const MenuCategory = require("../models/MenuCategory");

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const parseOptionalBoolean = (value) => {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
};

const toItemResponse = (item) => ({
  id: item._id,
  name: item.name,
  description: item.description,
  price: item.price,
  image: item.image,
  isAvailable: item.isAvailable,
  taxPercentage: item.taxPercentage,
  category: item.categoryId
    ? {
        id: item.categoryId._id,
        name: item.categoryId.name,
      }
    : null,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

exports.createCategory = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "name is required" });

    const category = await MenuCategory.create({
      name,
      tenantId: req.auth.tenantId,
    });

    return res.status(201).json({
      message: "category created",
      category: {
        id: category._id,
        name: category.name,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "category already exists" });
    }
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.listCategories = async (req, res) => {
  try {
    const categories = await MenuCategory.find({ tenantId: req.auth.tenantId }).sort({ name: 1 });
    return res.json({
      items: categories.map((category) => ({
        id: category._id,
        name: category.name,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.createItem = async (req, res) => {
  try {
    const { name, description, image, categoryId } = req.body;
    const price = Number(req.body?.price);
    const taxPercentage = Number(req.body?.taxPercentage);

    if (!name || !description || !categoryId) {
      return res.status(400).json({ message: "name, description and categoryId are required" });
    }
    if (!isObjectId(categoryId)) {
      return res.status(400).json({ message: "invalid categoryId" });
    }
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "price must be a valid number >= 0" });
    }
    if (!Number.isFinite(taxPercentage) || taxPercentage < 0 || taxPercentage > 100) {
      return res.status(400).json({ message: "taxPercentage must be between 0 and 100" });
    }

    const category = await MenuCategory.findOne({ _id: categoryId, tenantId: req.auth.tenantId });
    if (!category) return res.status(404).json({ message: "category not found" });

    const item = await MenuCollection.create({
      name: String(name).trim(),
      description: String(description).trim(),
      image: image ? String(image).trim() : "",
      categoryId: category._id,
      tenantId: req.auth.tenantId,
      price,
      taxPercentage,
    });

    const populated = await MenuCollection.findById(item._id).populate("categoryId", "name");
    return res.status(201).json({
      message: "menu item created",
      item: toItemResponse(populated),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "menu item with same name already exists" });
    }
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.listItems = async (req, res) => {
  try {
    const query = { tenantId: req.auth.tenantId };

    if (req.query?.categoryId) {
      if (!isObjectId(req.query.categoryId)) {
        return res.status(400).json({ message: "invalid categoryId" });
      }
      query.categoryId = req.query.categoryId;
    }

    const isAvailable = parseOptionalBoolean(req.query?.isAvailable);
    if (isAvailable === null) {
      return res.status(400).json({ message: "isAvailable must be true or false" });
    }
    if (typeof isAvailable === "boolean") {
      query.isAvailable = isAvailable;
    }

    const items = await MenuCollection.find(query)
      .populate("categoryId", "name")
      .sort({ createdAt: -1 });

    return res.json({
      items: items.map(toItemResponse),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.getItemById = async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!isObjectId(itemId)) return res.status(400).json({ message: "invalid itemId" });

    const item = await MenuCollection.findOne({ _id: itemId, tenantId: req.auth.tenantId }).populate(
      "categoryId",
      "name"
    );
    if (!item) return res.status(404).json({ message: "menu item not found" });

    return res.json({ item: toItemResponse(item) });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!isObjectId(itemId)) return res.status(400).json({ message: "invalid itemId" });

    const { name, description, image, categoryId } = req.body;
    const price = Number(req.body?.price);
    const taxPercentage = Number(req.body?.taxPercentage);

    if (!name || !description || !categoryId) {
      return res.status(400).json({ message: "name, description and categoryId are required" });
    }
    if (!isObjectId(categoryId)) {
      return res.status(400).json({ message: "invalid categoryId" });
    }
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "price must be a valid number >= 0" });
    }
    if (!Number.isFinite(taxPercentage) || taxPercentage < 0 || taxPercentage > 100) {
      return res.status(400).json({ message: "taxPercentage must be between 0 and 100" });
    }

    const category = await MenuCategory.findOne({ _id: categoryId, tenantId: req.auth.tenantId });
    if (!category) return res.status(404).json({ message: "category not found" });

    const item = await MenuCollection.findOneAndUpdate(
      { _id: itemId, tenantId: req.auth.tenantId },
      {
        $set: {
          name: String(name).trim(),
          description: String(description).trim(),
          image: image ? String(image).trim() : "",
          categoryId: category._id,
          price,
          taxPercentage,
        },
      },
      { new: true, runValidators: true }
    ).populate("categoryId", "name");

    if (!item) return res.status(404).json({ message: "menu item not found" });

    return res.json({
      message: "menu item updated",
      item: toItemResponse(item),
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "menu item with same name already exists" });
    }
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.updateItemAvailability = async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!isObjectId(itemId)) return res.status(400).json({ message: "invalid itemId" });

    const isAvailable = parseOptionalBoolean(req.body?.isAvailable);
    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({ message: "isAvailable must be true or false" });
    }

    const item = await MenuCollection.findOneAndUpdate(
      { _id: itemId, tenantId: req.auth.tenantId },
      { $set: { isAvailable } },
      { new: true, runValidators: true }
    ).populate("categoryId", "name");

    if (!item) return res.status(404).json({ message: "menu item not found" });

    return res.json({
      message: "availability updated",
      item: toItemResponse(item),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    if (!isObjectId(itemId)) return res.status(400).json({ message: "invalid itemId" });

    const item = await MenuCollection.findOneAndDelete({ _id: itemId, tenantId: req.auth.tenantId });
    if (!item) return res.status(404).json({ message: "menu item not found" });

    return res.json({ message: "menu item deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message || "internal server error" });
  }
};
