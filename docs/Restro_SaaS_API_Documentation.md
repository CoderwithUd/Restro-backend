# Restro Backend SaaS Documentation

## 1. Overview

This backend is built as a multi-tenant SaaS for restaurant operations.

- One restaurant = one tenant.
- Owner registers and creates a new tenant.
- Staff users (manager, kitchen, waiter) are mapped to the same tenant via role-based membership.
- Authentication uses access + refresh token cookies.
- Subscription is validated before tenant-protected operations.

## 2. Roles

- OWNER
- MANAGER
- KITCHEN
- WAITER

## 3. Tenant Resolution (How same URL identifies restaurant)

Tenant is resolved using this order:

1. `x-tenant-slug` header
2. `tenantSlug` in request body
3. `tenantSlug` in query params
4. Subdomain from hostname (example: `abc.myapp.com` -> `abc`)

So even if multiple users open the same frontend route (`/waiter`), backend can identify the correct restaurant by tenant slug/subdomain and by tenantId embedded in JWT.

## 4. Database Design

### 4.1 users

Purpose: Master user profile and credentials.

Fields:
- `_id` ObjectId
- `name` String
- `email` String (unique, lowercase)
- `password` String (bcrypt hash, select false)
- `isActive` Boolean
- `createdAt`, `updatedAt`

Indexes:
- unique index on `email`

### 4.2 tenants

Purpose: Restaurant workspace.

Fields:
- `_id` ObjectId
- `name` String
- `slug` String (unique, URL-safe)
- `status` Enum: `ACTIVE`, `SUSPENDED`
- `ownerUserId` ObjectId -> `users._id`
- `contactNumber` String (optional)
- `gstNumber` String (optional)
- `address` Object (optional): `line1`, `line2`, `city`, `state`, `country`, `postalCode`
- `createdAt`, `updatedAt`

Indexes:
- unique index on `slug`

### 4.3 memberships

Purpose: Many-to-many link between users and tenants with role.

Fields:
- `_id` ObjectId
- `userId` ObjectId -> `users._id`
- `tenantId` ObjectId -> `tenants._id`
- `role` Enum: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`
- `isActive` Boolean
- `createdAt`, `updatedAt`

Indexes:
- unique compound index on `(userId, tenantId, role)`

### 4.4 subscriptions

Purpose: Billing state per tenant.

Fields:
- `_id` ObjectId
- `tenantId` ObjectId -> `tenants._id` (unique)
- `planCode` String (example: `TRIAL`)
- `status` Enum: `TRIAL`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `EXPIRED`
- `startsAt` Date
- `endsAt` Date
- `createdAt`, `updatedAt`

### 4.5 refreshsessions

Purpose: Session-level refresh token storage with rotation and revocation.

Fields:
- `_id` ObjectId (used as session id in JWT `sid`)
- `userId` ObjectId -> `users._id`
- `tenantId` ObjectId -> `tenants._id`
- `role` String
- `tokenHash` String (sha256 hash of refresh token, select false)
- `expiresAt` Date (TTL index)
- `revokedAt` Date or null
- `createdAt`, `updatedAt`

Indexes:
- TTL index on `expiresAt`
- index on `(userId, tenantId, role)`

## 5. Authentication & Authorization Flow

### 5.1 Owner Register

`POST /api/auth/register-owner` (alias: `/api/auth/register`)

Creates:
- User
- Tenant
- Membership (OWNER)
- Trial subscription (14 days)
- Refresh session + auth cookies

### 5.2 Login

`POST /api/auth/login`

Checks:
- user credentials
- tenant membership
- optional role filter
- tenant active
- subscription active

Then issues session tokens and cookies.

### 5.3 Refresh

`POST /api/auth/refresh`

Checks:
- refresh token valid
- session exists and not revoked/expired
- token hash match
- membership still active
- subscription still active

Then rotates refresh token and reissues access token.

### 5.4 Logout

`POST /api/auth/logout`

Revokes current refresh session and clears cookies.

### 5.5 Protected access

Middleware validates:
- access token
- user active
- tenant active
- membership active
- optional role checks

## 6. API Endpoints

Base URL prefix: `/api`

### 6.1 Health

- `GET /api/health`

Response:
```json
{ "status": "ok" }
```

### 6.2 Auth APIs

1. `POST /api/auth/register-owner`
2. `POST /api/auth/register` (same as above)
3. `POST /api/auth/login`
4. `POST /api/auth/refresh`
5. `POST /api/auth/logout`
6. `GET /api/auth/me`
7. `GET /api/auth/staff-roles`

#### 6.2.1 Register Owner

Request:
```json
{
  "name": "Uday",
  "email": "uday@example.com",
  "password": "StrongPass123",
  "restaurantName": "Spicy Hub",
  "restaurantSlug": "spicy-hub",
  "contactNumber": "+919999999999",
  "gstNumber": "22AAAAA0000A1Z5",
  "address": {
    "line1": "Main Road",
    "city": "Raipur",
    "state": "Chhattisgarh",
    "country": "India",
    "postalCode": "492001"
  }
}
```

Success response:
```json
{
  "message": "owner registered",
  "user": {
    "id": "USER_ID",
    "name": "Uday",
    "email": "uday@example.com"
  },
  "tenant": {
    "id": "TENANT_ID",
    "name": "Spicy Hub",
    "slug": "spicy-hub"
  },
  "role": "OWNER"
}
```

#### 6.2.2 Login

Request:
```json
{
  "email": "waiter@example.com",
  "password": "StrongPass123",
  "role": "WAITER",
  "tenantSlug": "spicy-hub"
}
```

You can pass tenant slug through:
- `x-tenant-slug` header, or
- `tenantSlug` body/query, or
- subdomain.

#### 6.2.3 Me

`GET /api/auth/me` (requires access token)

Returns authenticated user + tenant + role.

### 6.3 Tenant Staff APIs

All require:
- authenticated user
- active subscription

Endpoints:
1. `GET /api/tenant/staff` (OWNER, MANAGER)
2. `POST /api/tenant/staff` (OWNER, MANAGER)
3. `POST /api/tenant/staff/register` (OWNER, MANAGER; alias of create staff)
4. `GET /api/tenant/profile` (OWNER, MANAGER, KITCHEN, WAITER)

#### 6.3.1 Create Staff

Request:
```json
{
  "name": "Ravi",
  "email": "ravi.waiter@example.com",
  "password": "StrongPass123",
  "role": "WAITER"
}
```

Notes:
- Allowed roles: `MANAGER`, `KITCHEN`, `WAITER`
- Existing email is blocked in current implementation for safety.

#### 6.3.2 Tenant Profile (for waiter/manager/kitchen/owner)

`GET /api/tenant/profile`

Response includes:
- Logged-in user info
- Current role
- Full tenant details (`slug`, `address`, `contactNumber`, `gstNumber`, etc.)
- Active subscription summary (`planCode`, `status`, `startsAt`, `endsAt`)

### 6.4 Menu APIs

All require:
- authenticated user
- active subscription

Role rules:
- Create category/item: `OWNER`, `MANAGER`
- Update item details (name/price/tax/desc/category/image): `OWNER`, `MANAGER`
- Update availability only: `KITCHEN`
- Delete item: `OWNER`, `MANAGER`
- Get/list categories/items: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`

Endpoints:
1. `POST /api/menu/categories`
2. `GET /api/menu/categories`
3. `POST /api/menu/items`
4. `GET /api/menu/items`
5. `GET /api/menu/items/:itemId`
6. `PUT /api/menu/items/:itemId`
7. `PATCH /api/menu/items/:itemId/availability`
8. `DELETE /api/menu/items/:itemId`

Create item request:
```json
{
  "name": "Paneer Tikka",
  "description": "Smoky paneer cubes with spices",
  "price": 299,
  "taxPercentage": 5,
  "categoryId": "CATEGORY_ID",
  "image": "https://cdn.example.com/paneer-tikka.jpg"
}
```

Availability update request:
```json
{
  "isAvailable": false
}
```

### 6.5 Invoice APIs

All require:
- authenticated user
- active subscription

Roles:
- OWNER, MANAGER, KITCHEN, WAITER (all allowed)

Endpoints:
1. `POST /api/invoices`
2. `GET /api/invoices`
3. `GET /api/invoices/:invoiceId`
4. `PUT /api/invoices/:invoiceId`
5. `POST /api/invoices/:invoiceId/pay`
6. `DELETE /api/invoices/:invoiceId`

Detailed examples and payloads: `docs/Invoice_API.md`

### 6.6 Expense APIs

All require:
- authenticated user
- active subscription

Roles:
- OWNER, MANAGER only

Endpoints:
1. `POST /api/expenses`
2. `GET /api/expenses`
3. `PUT /api/expenses/:expenseId`
4. `DELETE /api/expenses/:expenseId`

Detailed examples and payloads: `docs/Expense_API.md`

### 6.7 Reports / Dashboard APIs

All require:
- authenticated user
- active subscription

Roles:
- OWNER, MANAGER only

Endpoints:
1. `GET /api/reports/summary`

Detailed examples and payloads: `docs/Reports_API.md`

### 6.8 Public QR Menu + Order APIs

Public (no auth).

Endpoints:
1. `GET /api/public/menu`
2. `POST /api/public/orders`

Detailed examples and payloads: `docs/Public_QR_API.md`

### 6.9 Table QR Generate (Staff)

Auth required.

Endpoints:
1. `GET /api/tables/:tableId/qr`
2. `POST /api/tables/:tableId/qr-token`

Detailed examples and payloads: `docs/Public_QR_API.md`

## 7. Environment Variables

Required:
- `PORT`
- `MONGO_URI` (or `MONGO_URL`, fallback supported)
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`

Optional:
- `ACCESS_TOKEN_EXPIRES_IN` (default `15m`)
- `REFRESH_TOKEN_EXPIRES_IN` (default `7d`)
- `COOKIE_SECURE` (`true` for HTTPS production)
- `COOKIE_DOMAIN` (example `.myapp.com` for shared subdomain cookies)

## 8. Production Recommendations

1. Use HTTPS and set `COOKIE_SECURE=true`.
2. Use strong JWT secrets from secret manager.
3. Add rate limiting for `/login` and `/refresh`.
4. Add audit logs for staff create/deactivate actions.
5. Add invitation flow for existing users (instead of blocking).
6. Add billing webhook to update `subscriptions.status`.
