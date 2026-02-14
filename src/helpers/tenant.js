const Tenant = require("../models/Tenant");

const slugify = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

const parseSubdomainSlug = (hostname) => {
  if (!hostname) return null;
  const cleanHost = hostname.split(":")[0].toLowerCase();
  if (cleanHost === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(cleanHost)) return null;
  const parts = cleanHost.split(".");
  if (parts.length < 3) return null;
  return parts[0];
};

const resolveTenantSlugFromRequest = (req) => {
  const headerSlug = req.headers["x-tenant-slug"];
  const bodySlug = req.body?.tenantSlug;
  const querySlug = req.query?.tenantSlug;
  return (
    slugify(headerSlug) ||
    slugify(bodySlug) ||
    slugify(querySlug) ||
    slugify(parseSubdomainSlug(req.hostname))
  );
};

const ensureUniqueTenantSlug = async (baseValue) => {
  const base = slugify(baseValue);
  if (!base || base.length < 3) {
    throw new Error("restaurantSlug must have at least 3 valid characters");
  }

  let candidate = base;
  let counter = 1;
  while (await Tenant.exists({ slug: candidate })) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  return candidate;
};

module.exports = {
  slugify,
  resolveTenantSlugFromRequest,
  ensureUniqueTenantSlug,
};
