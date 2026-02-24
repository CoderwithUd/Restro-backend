# Restro Backend API (Developer Doc)

Last updated: 2026-02-24

This document is generated from the current backend code in this repo. It is intended for developers who need to integrate, debug, or extend the API.

**Base URL**
`/api`

**Auth**
- Access token is a JWT. It is returned in responses and also set in an `accessToken` httpOnly cookie.
- Refresh token is set in `refreshToken` httpOnly cookie.
- You can authenticate using `Authorization: Bearer <accessToken>` or by sending cookies.
- Most endpoints require `requireAuth` + `requireActiveSubscription`.

**Roles**
- `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`
- Staff roles list is returned by `GET /api/auth/staff-roles`.

**Tenant resolution**
- `tenantSlug` can be passed in header `x-tenant-slug`, request body, query, or via subdomain.
- Public endpoints rely on `tenantSlug` unless a QR token is used.

**Pagination**
- `page` (>= 1), `limit` (1..100)
- Response includes `pagination` with totals.

**Error format**
```json
{ "message": "error message" }
```

**Real-time (Socket.IO)**
- Socket server requires access token in `socket.handshake.auth.accessToken`, or `Authorization` header, or `accessToken` cookie.
- On connect, the socket joins rooms:
  - `tenant:{tenantId}`
  - `tenant:{tenantId}:kitchen` for role `KITCHEN`
  - `tenant:{tenantId}:management` for role `OWNER` or `MANAGER`
- Events:
  - `order.created`
  - `order.updated`
  - `order.deleted`

---

## Health

### GET `/api/health`
Response:
```json
{ "status": "ok", "message": "server is running", "timestamp": "2026-02-24T06:25:22.123Z" }
```

---

## Auth

### POST `/api/auth/register-owner`
Alias: `/api/auth/register`
Creates owner + tenant + subscription (trial).

Payload:
```json
{
  "name": "Owner Name",
  "email": "owner@example.com",
  "password": "secret123",
  "restaurantName": "My Cafe",
  "restaurantSlug": "my-cafe",
  "contactNumber": "9999999999",
  "gstNumber": "22AAAAA0000A1Z5",
  "address": {
    "line1": "Street 1",
    "line2": "Area",
    "city": "Raipur",
    "state": "CG",
    "country": "IN",
    "postalCode": "492001"
  }
}
```

Response:
```json
{
  "message": "owner registered",
  "accessToken": "jwt",
  "user": { "id": "...", "name": "Owner Name", "email": "owner@example.com" },
  "tenant": { "id": "...", "name": "My Cafe", "slug": "my-cafe" },
  "role": "OWNER"
}
```

### POST `/api/auth/login`
Payload:
```json
{
  "email": "owner@example.com",
  "password": "secret123",
  "role": "OWNER"
}
```

Response:
```json
{
  "message": "login success",
  "accessToken": "jwt",
  "user": { "id": "...", "name": "Owner Name", "email": "owner@example.com" },
  "tenant": { "id": "...", "name": "My Cafe", "slug": "my-cafe" },
  "role": "OWNER"
}
```

If user has multiple tenants and no `tenantSlug` is provided, response includes `options`.

### POST `/api/auth/refresh`
Uses `refreshToken` cookie.

Response:
```json
{ "message": "token refreshed", "accessToken": "jwt" }
```

### POST `/api/auth/logout`
Clears cookies.

Response:
```json
{ "message": "logout success" }
```

### GET `/api/auth/me`
Auth required.

Response:
```json
{
  "user": { "id": "...", "name": "...", "email": "..." },
  "tenant": { "id": "...", "name": "...", "slug": "..." },
  "role": "OWNER"
}
```

### GET `/api/auth/staff-roles`
Response:
```json
{ "roles": ["MANAGER", "KITCHEN", "WAITER"] }
```

---

## Tenant / Staff

### GET `/api/tenant/profile`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Response:
```json
{
  "tenant": {
    "id": "...",
    "name": "My Cafe",
    "slug": "my-cafe",
    "status": "ACTIVE",
    "contactNumber": "9999999999",
    "gstNumber": "22AAAAA0000A1Z5",
    "address": { "line1": "...", "line2": "...", "city": "...", "state": "...", "country": "...", "postalCode": "..." }
  },
  "user": { "id": "...", "name": "...", "email": "..." },
  "role": "OWNER",
  "subscription": { "planCode": "TRIAL", "status": "TRIAL", "startsAt": "...", "endsAt": "..." }
}
```

### GET `/api/tenant/staff`
Roles: `OWNER`, `MANAGER`.

Response:
```json
{
  "items": [
    {
      "membershipId": "...",
      "role": "MANAGER",
      "isActive": true,
      "user": { "id": "...", "name": "User", "email": "user@x.com", "isActive": true }
    }
  ]
}
```

### POST `/api/tenant/staff`
Alias: `/api/tenant/staff/register`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{
  "name": "Manager",
  "email": "manager@x.com",
  "password": "secret123",
  "role": "MANAGER"
}
```

Response:
```json
{ "message": "staff created", "staff": { "...": "..." } }
```

---

## Tables

### POST `/api/tables`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{ "number": 1, "name": "Table 1", "capacity": 4, "isActive": true }
```

Response:
```json
{
  "message": "table created",
  "table": {
    "id": "...",
    "tenantId": "...",
    "number": 1,
    "name": "Table 1",
    "capacity": 4,
    "isActive": true,
    "qrPayload": "https://host/api/public/menu?tenantSlug=my-cafe&tableId=...",
    "qrFormat": "dataUrl",
    "qrCode": "data:image/png;base64,...",
    "qrUpdatedAt": "2026-02-24T06:25:22.123Z",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### GET `/api/tables`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Query:
- `isActive=true|false`

Response:
```json
{ "items": [ { "id": "...", "number": 1, "name": "Table 1", "qrCode": "..." } ] }
```

### GET `/api/tables/:tableId/qr`
Roles: `OWNER`, `MANAGER`.

Query:
- `format=dataUrl|svg`
- `baseUrl` (optional, overrides default `PUBLIC_QR_BASE_URL` or `/api/public/menu`)

Response:
```json
{
  "table": { "id": "...", "number": 1, "name": "Table 1" },
  "tenant": { "id": "...", "name": "My Cafe", "slug": "my-cafe" },
  "qrPayload": "https://host/api/public/menu?tenantSlug=my-cafe&tableId=...",
  "format": "dataUrl",
  "qr": "data:image/png;base64,..."
}
```

### POST `/api/tables/:tableId/qr-token`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{
  "expiresInHours": 720,
  "format": "dataUrl",
  "baseUrl": "https://host/api/public/menu"
}
```

Response:
```json
{
  "token": "generatedToken",
  "expiresAt": "2026-03-24T06:25:22.123Z",
  "qrPayload": "https://host/api/public/menu?token=generatedToken",
  "format": "dataUrl",
  "qr": "data:image/png;base64,..."
}
```

### PUT `/api/tables/:tableId`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{ "number": 2, "name": "Table 2", "capacity": 6, "isActive": false }
```

Response:
```json
{ "message": "table updated", "table": { "...": "..." } }
```

### DELETE `/api/tables/:tableId`
Roles: `OWNER`, `MANAGER`.

Response:
```json
{ "message": "table deleted" }
```

---

## Public Menu + Orders (No auth)

Rate limits:
- `GET /api/public/menu`: 120 requests / minute / IP
- `POST /api/public/orders`: 30 requests / minute / IP

### GET `/api/public/menu`
Query:
- `tenantSlug` (required unless token is used)
- `tableId` or `tableNumber` (optional)
- `token` (optional, QR token)

Response:
```json
{
  "tenant": { "id": "...", "name": "My Cafe", "slug": "my-cafe" },
  "table": { "id": "...", "number": 1, "name": "Table 1" },
  "categories": [ { "id": "...", "name": "Starters", "items": [ ... ], "children": [] } ]
}
```

### POST `/api/public/orders`
Payload (token based):
```json
{
  "token": "qrToken",
  "customerName": "Ravi",
  "customerPhone": "9999999999",
  "note": "Less spicy",
  "items": [
    { "itemId": "...", "variantId": "...", "quantity": 2, "optionIds": ["..."] }
  ]
}
```

Payload (static QR):
```json
{
  "tenantSlug": "my-cafe",
  "tableId": "tableObjectId",
  "customerName": "Ravi",
  "customerPhone": "9999999999",
  "items": [
    { "itemId": "...", "variantId": "...", "quantity": 2, "optionIds": ["..."] }
  ]
}
```

Response:
```json
{
  "message": "order created",
  "order": {
    "id": "...",
    "tenantId": "...",
    "table": { "id": "...", "number": 1, "name": "Table 1" },
    "source": "QR",
    "customer": { "name": "Ravi", "phone": "9999999999" },
    "status": "PLACED",
    "items": [ { "itemId": "...", "variantId": "...", "quantity": 2, "lineTotal": 200 } ],
    "subTotal": 180,
    "taxTotal": 20,
    "grandTotal": 200,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

## Menu

### POST `/api/menu/categories`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{ "name": "Starters", "parentId": null, "sortOrder": 1 }
```

Response:
```json
{ "message": "category created", "category": { "id": "...", "name": "Starters", "sortOrder": 1 } }
```

### GET `/api/menu/categories`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Query:
- `flat=true|false`

Response (nested):
```json
{ "items": [ { "id": "...", "name": "Starters", "children": [] } ] }
```

### PUT `/api/menu/categories/:categoryId`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{ "name": "Veg Starters", "parentId": null, "sortOrder": 2 }
```

Response:
```json
{ "message": "category updated", "category": { "...": "..." } }
```

### DELETE `/api/menu/categories/:categoryId`
Roles: `OWNER`, `MANAGER`.

Response:
```json
{ "message": "category deleted" }
```

### POST `/api/menu/items`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{
  "name": "Paneer Tikka",
  "description": "Smoky paneer",
  "image": "https://...",
  "categoryId": "categoryObjectId",
  "taxPercentage": 5,
  "sortOrder": 1,
  "variants": [
    { "name": "Half", "price": 150, "sortOrder": 0, "isAvailable": true },
    { "name": "Full", "price": 250, "sortOrder": 1, "isAvailable": true }
  ],
  "optionGroupIds": ["optionGroupId1", "optionGroupId2"]
}
```

Response:
```json
{ "message": "menu item created", "item": { "...": "..." } }
```

### GET `/api/menu/items`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Query:
- `categoryId`
- `isAvailable=true|false`
- `q` (search by name)
- `page`, `limit`

Response:
```json
{ "items": [ { "...": "..." } ], "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 } }
```

### GET `/api/menu/items/:itemId`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Response:
```json
{ "item": { "...": "..." } }
```

### PUT `/api/menu/items/:itemId`
Roles: `OWNER`, `MANAGER`.

Payload is same as create item.

### PATCH `/api/menu/items/:itemId/availability`
Roles: `KITCHEN`.

Payload:
```json
{ "isAvailable": false }
```

### PATCH `/api/menu/variants/:variantId/availability`
Roles: `KITCHEN`.

Payload:
```json
{ "isAvailable": false }
```

### DELETE `/api/menu/items/:itemId`
Roles: `OWNER`, `MANAGER`.

Response:
```json
{ "message": "menu item deleted" }
```

### POST `/api/menu/option-groups`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{ "name": "Spice Level", "minSelect": 0, "maxSelect": 1, "sortOrder": 0 }
```

### GET `/api/menu/option-groups`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Response:
```json
{ "items": [ { "id": "...", "name": "Spice Level", "options": [ ... ] } ] }
```

### PUT `/api/menu/option-groups/:groupId`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{ "name": "Spice", "minSelect": 0, "maxSelect": 2, "sortOrder": 1 }
```

### DELETE `/api/menu/option-groups/:groupId`
Roles: `OWNER`, `MANAGER`.

Response:
```json
{ "message": "option group deleted" }
```

### POST `/api/menu/option-groups/:groupId/options`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{ "name": "Medium", "price": 0, "sortOrder": 1, "isAvailable": true }
```

### PUT `/api/menu/options/:optionId`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{ "name": "Hot", "price": 10, "sortOrder": 2, "isAvailable": true }
```

### DELETE `/api/menu/options/:optionId`
Roles: `OWNER`, `MANAGER`.

Response:
```json
{ "message": "option deleted" }
```

### GET `/api/menu/menu`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Query:
- `isAvailable=true|false`

Response:
```json
{ "categories": [ { "id": "...", "name": "Starters", "items": [ ... ], "children": [] } ] }
```

---

## Orders (Staff)

### POST `/api/orders`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Payload:
```json
{
  "tableId": "tableObjectId",
  "note": "No onions",
  "items": [
    { "itemId": "...", "variantId": "...", "quantity": 2, "optionIds": ["..."], "note": "" }
  ]
}
```

Response:
```json
{ "message": "order created", "order": { "...": "..." } }
```

### GET `/api/orders`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Query:
- `tableId`
- `status=PLACED,IN_PROGRESS`
- `page`, `limit`

Response:
```json
{ "items": [ { "...": "..." } ], "pagination": { "page": 1, "limit": 20, "total": 10, "totalPages": 1 } }
```

### GET `/api/orders/:orderId`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Response:
```json
{ "order": { "...": "..." } }
```

### PUT `/api/orders/:orderId`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Payload (any subset allowed):
```json
{
  "status": "IN_PROGRESS",
  "note": "Rush",
  "customerName": "Ravi",
  "customerPhone": "9999999999"
}
```

Order status transitions:
- `PLACED -> IN_PROGRESS -> READY -> SERVED`
- `PLACED -> CANCELLED`
- `IN_PROGRESS -> CANCELLED`

### DELETE `/api/orders/:orderId`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Response:
```json
{ "message": "order deleted" }
```

---

## Invoices

### POST `/api/invoices`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Payload:
```json
{
  "orderId": "orderObjectId",
  "note": "Thank you",
  "discountType": "PERCENTAGE",
  "discountValue": 10
}
```

Response:
```json
{ "message": "invoice created", "invoice": { "...": "..." } }
```

### GET `/api/invoices`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Query:
- `orderId`
- `tableId`
- `status=PAID,ISSUED`
- `page`, `limit`

### GET `/api/invoices/:invoiceId`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

### PUT `/api/invoices/:invoiceId`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Payload:
```json
{ "note": "Updated note", "discountType": "FLAT", "discountValue": 50 }
```

### POST `/api/invoices/:invoiceId/pay`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

Payload:
```json
{ "paidAmount": 500, "method": "CASH", "reference": "INV-1001" }
```

### DELETE `/api/invoices/:invoiceId`
Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

---

## Expenses

### POST `/api/expenses`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{ "amount": 1200, "category": "Supplies", "note": "Gas refill", "expenseDate": "2026-02-01" }
```

### GET `/api/expenses`
Roles: `OWNER`, `MANAGER`.

Query:
- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`
- `page`, `limit`

### PUT `/api/expenses/:expenseId`
Roles: `OWNER`, `MANAGER`.

Payload:
```json
{ "amount": 1500, "category": "Supplies", "note": "Updated", "expenseDate": "2026-02-02" }
```

### DELETE `/api/expenses/:expenseId`
Roles: `OWNER`, `MANAGER`.

---

## Reports

### GET `/api/reports/summary`
Roles: `OWNER`, `MANAGER`.

Query:
- `period=today|yesterday|this_week|last_week|this_month|last_month|all|custom`
- `from` and `to` when `period=custom`
- `tzOffsetMinutes` (minutes, -720 to 840)
- `weekStartsOn` (0..6, default 1)

Response:
```json
{
  "range": { "period": "today", "from": "...", "to": "...", "tzOffsetMinutes": 330, "weekStartsOn": 1 },
  "sales": { "paidInvoices": 3, "grossSales": 1200, "discountTotal": 50, "taxTotal": 60, "netSales": 1150, "paidTotal": 1150, "avgTicket": 383.33 },
  "orders": { "total": 10, "byStatus": { "PLACED": 2, "IN_PROGRESS": 3 } },
  "invoices": { "total": 5, "byStatus": { "PAID": 3, "ISSUED": 2 } },
  "expenses": { "total": 200, "count": 2 },
  "profitLoss": { "netResult": 950, "profit": 950, "loss": 0, "note": "profit/loss calculated as netSales - expenses (COGS not included)" }
}
```

---

## Data Objects (Key Fields)

**Table**
- `number` (int, >= 1)
- `name` (string, <= 40)
- `capacity` (int or null)
- `isActive` (boolean)
- `qrPayload`, `qrFormat`, `qrCode`, `qrUpdatedAt`

**Order**
- `source` is `QR` for public orders and `STAFF` for staff orders
- `status` one of `PLACED`, `IN_PROGRESS`, `READY`, `SERVED`, `CANCELLED`
- `items` require at least one item

**Invoice**
- `status` one of `DRAFT`, `ISSUED`, `PAID`, `VOID`
- `discountType` one of `PERCENTAGE`, `FLAT`

**Option Group Rules**
- `minSelect <= maxSelect`

---

## Known Risks and Improvements (SaaS Checklist)

1. CORS is configured with `origin: true` and `credentials: true`, which reflects any Origin. For SaaS this allows any website to make authenticated requests if cookies are present. Consider restricting origins to a whitelist.
2. Cookies are httpOnly but there is no CSRF protection. If you rely on cookies for auth, add CSRF protection or enforce `Authorization` header tokens only.
3. If running behind a proxy/load balancer, set `app.set("trust proxy", 1)` so rate limiting uses the real client IP.
4. `register-owner` slug generation relies on a uniqueness check before insert; a race could throw duplicate key on `Tenant.slug`. Consider retry on duplicate.
5. QR `qrCode` stored as full data URL may be large. If DB size becomes an issue, store only payload and render client-side.
6. There is no audit trail for menu/price changes. If needed, add history logs.

---

## Suggested Debugging Tips

1. Verify tenant slug resolution by checking `x-tenant-slug` header or query.
2. When menu is empty, ensure categories and items exist and `isAvailable` is true.
3. For public orders, confirm QR payload includes correct `tenantSlug` and `tableId`.
4. If realtime events not received, verify Socket.IO authentication and that the client is in `tenant:{tenantId}` room.
