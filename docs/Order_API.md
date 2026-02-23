# Order + Table API (with Socket.IO)

Base URL: `/api`

Auth: Bearer token (`Authorization: Bearer <accessToken>`) or `accessToken` cookie.

Roles:
- Orders: OWNER, MANAGER, KITCHEN, WAITER (sab kar sakte hai).
- Tables: OWNER, MANAGER (create/update/delete). All roles can list tables.

---

## Table APIs (Table Number Standard)

### 1) Create Table
`POST /tables`

Payload:
```json
{
  "number": 12,
  "name": "Patio 12",
  "capacity": 4,
  "isActive": true
}
```

Response (201):
```json
{
  "message": "table created",
  "table": {
    "id": "65f1f2c9c8f7f6a2d1011111",
    "tenantId": "65f1f2c9c8f7f6a2d1000001",
    "number": 12,
    "name": "Patio 12",
    "capacity": 4,
    "isActive": true,
    "createdAt": "2026-02-23T08:10:00.000Z",
    "updatedAt": "2026-02-23T08:10:00.000Z"
  }
}
```

### 2) List Tables
`GET /tables?isActive=true`

Response:
```json
{
  "items": [
    {
      "id": "65f1f2c9c8f7f6a2d1011111",
      "tenantId": "65f1f2c9c8f7f6a2d1000001",
      "number": 12,
      "name": "Patio 12",
      "capacity": 4,
      "isActive": true,
      "createdAt": "2026-02-23T08:10:00.000Z",
      "updatedAt": "2026-02-23T08:10:00.000Z"
    }
  ]
}
```

### 3) Update Table
`PUT /tables/:tableId`

Payload:
```json
{
  "number": 15,
  "name": "Patio 15",
  "capacity": 6,
  "isActive": true
}
```

### 4) Delete Table
`DELETE /tables/:tableId`

Note: Active orders (PLACED/IN_PROGRESS/READY) ho to delete block hoga.

---

## Order APIs

### Order Status
`PLACED`, `IN_PROGRESS`, `READY`, `SERVED`, `CANCELLED`

### 1) Create Order
`POST /orders`

Payload:
```json
{
  "tableId": "65f1f2c9c8f7f6a2d1011111",
  "note": "table needs extra water",
  "items": [
    {
      "itemId": "65f1f2c9c8f7f6a2d1020001",
      "variantId": "65f1f2c9c8f7f6a2d1021001",
      "quantity": 2,
      "note": "less spicy",
      "optionIds": ["65f1f2c9c8f7f6a2d1031001"]
    }
  ]
}
```

Response (201):
```json
{
  "message": "order created",
  "order": {
    "id": "65f1f2c9c8f7f6a2d2000001",
    "tenantId": "65f1f2c9c8f7f6a2d1000001",
    "table": {
      "id": "65f1f2c9c8f7f6a2d1011111",
      "number": 12,
      "name": "Patio 12"
    },
    "status": "PLACED",
    "note": "table needs extra water",
    "items": [
      {
        "itemId": "65f1f2c9c8f7f6a2d1020001",
        "variantId": "65f1f2c9c8f7f6a2d1021001",
        "name": "Paneer Tikka",
        "variantName": "Full",
        "quantity": 2,
        "unitPrice": 320,
        "taxPercentage": 5,
        "options": [
          {
            "optionId": "65f1f2c9c8f7f6a2d1031001",
            "name": "Extra Cheese",
            "price": 20
          }
        ],
        "note": "less spicy",
        "lineSubTotal": 640,
        "lineTax": 32,
        "lineTotal": 672
      }
    ],
    "subTotal": 640,
    "taxTotal": 32,
    "grandTotal": 672,
    "createdBy": {
      "userId": "65f1f2c9c8f7f6a2d1000101",
      "role": "WAITER",
      "name": "Amit"
    },
    "updatedBy": {
      "userId": "65f1f2c9c8f7f6a2d1000101",
      "role": "WAITER",
      "name": "Amit"
    },
    "createdAt": "2026-02-23T08:12:00.000Z",
    "updatedAt": "2026-02-23T08:12:00.000Z"
  }
}
```

### 2) List Orders
`GET /orders?status=PLACED,IN_PROGRESS&tableId=65f1f2c9c8f7f6a2d1011111&page=1&limit=20`

Response:
```json
{
  "items": [
    {
      "id": "65f1f2c9c8f7f6a2d2000001",
      "tenantId": "65f1f2c9c8f7f6a2d1000001",
      "table": {
        "id": "65f1f2c9c8f7f6a2d1011111",
        "number": 12,
        "name": "Patio 12"
      },
      "status": "PLACED",
      "note": "",
      "items": [],
      "subTotal": 640,
      "taxTotal": 32,
      "grandTotal": 672,
      "createdBy": {
        "userId": "65f1f2c9c8f7f6a2d1000101",
        "role": "WAITER",
        "name": "Amit"
      },
      "updatedBy": {
        "userId": "65f1f2c9c8f7f6a2d1000101",
        "role": "WAITER",
        "name": "Amit"
      },
      "createdAt": "2026-02-23T08:12:00.000Z",
      "updatedAt": "2026-02-23T08:12:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### 3) Get Order By Id
`GET /orders/:orderId`

### 4) Update Order
`PUT /orders/:orderId`

Payload (status change):
```json
{
  "status": "IN_PROGRESS"
}
```

Payload (items replace):
```json
{
  "items": [
    {
      "itemId": "65f1f2c9c8f7f6a2d1020001",
      "variantId": "65f1f2c9c8f7f6a2d1021001",
      "quantity": 1,
      "optionIds": []
    }
  ]
}
```

### 5) Delete Order
`DELETE /orders/:orderId`

---

## Socket.IO (Real-Time for Kitchen + Owner/Manager)

### Connect
Client connect example:
```js
import { io } from "socket.io-client";

const socket = io("http://localhost:5000", {
  auth: { accessToken: "<accessToken>" }
});
```

### Events (Server -> Client)
- `order.created`
- `order.updated`
- `order.deleted`

Payload examples:
```json
{ "order": { "...": "same as order response" } }
```

```json
{ "orderId": "65f1f2c9c8f7f6a2d2000001" }
```

Note: Events go to all authenticated staff of the same tenant (OWNER/MANAGER/KITCHEN/WAITER).
