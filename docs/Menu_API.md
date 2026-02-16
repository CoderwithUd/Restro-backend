# Menu Module API Documentation

Base URL: `/api/menu`  
Auth: `Bearer <accessToken>`  
Global middleware: `requireAuth`, `requireActiveSubscription`

## Role Matrix

- OWNER, MANAGER: create/update/delete categories/items/option-groups/options
- WAITER, KITCHEN: read menu data
- KITCHEN: update availability for item/variant

## Tenant Isolation

All data is tenant-scoped using `tenantId` from `req.auth.tenantId`.  
Every collection and query enforces tenant isolation.

## Collections

- `MenuCategory`
- `MenuItem`
- `MenuVariant`
- `OptionGroup`
- `Option`
- `ItemOptionGroup`

---

## 1) Categories

### POST `/categories`
Create category with optional parent.

Roles: OWNER, MANAGER

Payload:
```json
{
  "name": "Main Course",
  "parentId": null,
  "sortOrder": 1
}
```

### GET `/categories?flat=false`
List categories in nested tree (default) or flat format (`flat=true`).

Roles: OWNER, MANAGER, KITCHEN, WAITER

### PUT `/categories/:categoryId`
Update category fields.

Roles: OWNER, MANAGER

Payload:
```json
{
  "name": "Mains",
  "parentId": null,
  "sortOrder": 2
}
```

### DELETE `/categories/:categoryId`
Delete category only if:
- no child categories
- no items in category

Roles: OWNER, MANAGER

Conflict response:
```json
{
  "message": "cannot delete category with child categories or items"
}
```

---

## 2) Items

### POST `/items`
Quick add item with variants and option-group mappings.

Roles: OWNER, MANAGER

Payload:
```json
{
  "categoryId": "65f0a9b0a1d2c3e4f5a6b7c1",
  "name": "Cold Coffee",
  "description": "Chilled coffee with ice cream",
  "image": "https://cdn.example.com/cold-coffee.jpg",
  "taxPercentage": 5,
  "sortOrder": 10,
  "variants": [
    { "name": "Small", "price": 120, "isAvailable": true, "sortOrder": 1 },
    { "name": "Large", "price": 180, "isAvailable": true, "sortOrder": 2 }
  ],
  "optionGroupIds": [
    "65f0a9b0a1d2c3e4f5a6b7d1",
    "65f0a9b0a1d2c3e4f5a6b7d2"
  ]
}
```

Note: `price` item level par nahi hota, sirf `variants` me hota hai.

### GET `/items`
List items with filters and pagination.

Roles: OWNER, MANAGER, KITCHEN, WAITER

Query params:
- `categoryId` (optional)
- `isAvailable=true|false` (optional)
- `q` (optional name search)
- `page` (optional)
- `limit` (optional, max 100)

### GET `/items/:itemId`
Get single item with variants + option groups/options.

Roles: OWNER, MANAGER, KITCHEN, WAITER

### PUT `/items/:itemId`
Full update for item, variants, and option-group mapping.

Roles: OWNER, MANAGER

Payload:
```json
{
  "categoryId": "65f0a9b0a1d2c3e4f5a6b7c1",
  "name": "Cold Coffee Premium",
  "description": "Updated desc",
  "image": "",
  "taxPercentage": 12,
  "sortOrder": 5,
  "variants": [
    { "name": "Regular", "price": 150, "isAvailable": true, "sortOrder": 1 },
    { "name": "Large", "price": 210, "isAvailable": false, "sortOrder": 2 }
  ],
  "optionGroupIds": ["65f0a9b0a1d2c3e4f5a6b7d1"]
}
```

### PATCH `/items/:itemId/availability`
Update item availability.

Roles: KITCHEN

Payload:
```json
{
  "isAvailable": false
}
```

### PATCH `/variants/:variantId/availability`
Update variant availability.

Roles: KITCHEN

Payload:
```json
{
  "isAvailable": true
}
```

### DELETE `/items/:itemId`
Delete item and related variants + mappings.

Roles: OWNER, MANAGER

---

## 3) Option Groups and Options

### POST `/option-groups`
Create option group.

Roles: OWNER, MANAGER

Payload:
```json
{
  "name": "Milk Type",
  "minSelect": 1,
  "maxSelect": 1,
  "sortOrder": 1
}
```

### GET `/option-groups`
List option groups with options.

Roles: OWNER, MANAGER, KITCHEN, WAITER

### PUT `/option-groups/:groupId`
Update option group.

Roles: OWNER, MANAGER

Payload:
```json
{
  "name": "Milk Preference",
  "minSelect": 0,
  "maxSelect": 2,
  "sortOrder": 2
}
```

### DELETE `/option-groups/:groupId`
Delete group only if not attached to any item.

Roles: OWNER, MANAGER

Conflict response:
```json
{
  "message": "cannot delete option group because it is attached to menu items"
}
```

### POST `/option-groups/:groupId/options`
Create option inside a group.

Roles: OWNER, MANAGER

Payload:
```json
{
  "name": "Almond Milk",
  "price": 30,
  "sortOrder": 1,
  "isAvailable": true
}
```

### PUT `/options/:optionId`
Update option.

Roles: OWNER, MANAGER

Payload:
```json
{
  "name": "Oat Milk",
  "price": 35,
  "sortOrder": 2,
  "isAvailable": true
}
```

### DELETE `/options/:optionId`
Delete option.

Roles: OWNER, MANAGER

---

## 4) Menu Aggregate

### GET `/menu?isAvailable=true`
Fast frontend endpoint with nested categories and embedded item data:
- items
- variants
- optionGroups with options

Roles: OWNER, MANAGER, KITCHEN, WAITER

---

## Response Shape Example

```json
{
  "message": "menu item created",
  "item": {
    "id": "65f...",
    "tenantId": "65a...",
    "name": "Cold Coffee",
    "description": "Chilled coffee with ice cream",
    "taxPercentage": 5,
    "isAvailable": true,
    "category": {
      "id": "65f...",
      "name": "Beverages",
      "parentId": null
    },
    "variants": [
      {
        "id": "65f...",
        "itemId": "65f...",
        "name": "Small",
        "price": 120,
        "isAvailable": true
      }
    ],
    "optionGroups": [
      {
        "id": "65f...",
        "name": "Milk Type",
        "minSelect": 1,
        "maxSelect": 1,
        "options": [
          {
            "id": "65f...",
            "groupId": "65f...",
            "name": "Almond Milk",
            "price": 30,
            "isAvailable": true
          }
        ]
      }
    ]
  }
}
```

---

## Validation and Error Handling

- ObjectId validation for all route params and ids in payload
- `price >= 0`
- `taxPercentage` between `0..100`
- `minSelect/maxSelect` must be integers, `>=0`, and `minSelect <= maxSelect`
- Duplicate key (`Mongo code 11000`) returns `409`
- Not found returns `404`
- Invalid payload returns `400`

Common error example:
```json
{
  "message": "menu item already exists in this category"
}
```

