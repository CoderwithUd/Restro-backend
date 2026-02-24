# Invoice API

Base URL: `/api`

Auth: Bearer token (`Authorization: Bearer <accessToken>`) or `accessToken` cookie.

Roles: OWNER, MANAGER, KITCHEN, WAITER (sab kar sakte hai).

---

## Invoice Status

- `ISSUED`
- `PAID`
- `VOID` (reserved for future)
- `DRAFT` (reserved for future)

## Discount Types

- `PERCENTAGE`
- `FLAT`

---

## 1) Create Invoice
`POST /invoices`

Payload:
```json
{
  "orderId": "65f1f2c9c8f7f6a2d2000001",
  "note": "optional note",
  "discountType": "PERCENTAGE",
  "discountValue": 10
}
```

Notes:
- One invoice per order (duplicate create blocked).
- Cancelled order ka invoice create nahi hoga.
- Discount `grandTotal` par apply hota hai.

Response (201):
```json
{
  "message": "invoice created",
  "invoice": {
    "id": "65f1f2c9c8f7f6a2d3000001",
    "tenantId": "65f1f2c9c8f7f6a2d1000001",
    "orderId": "65f1f2c9c8f7f6a2d2000001",
    "table": {
      "id": "65f1f2c9c8f7f6a2d1011111",
      "number": 12,
      "name": "Patio 12"
    },
    "status": "ISSUED",
    "note": "optional note",
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
        "note": "",
        "lineSubTotal": 640,
        "lineTax": 32,
        "lineTotal": 672
      }
    ],
    "subTotal": 640,
    "taxTotal": 32,
    "grandTotal": 672,
    "discount": {
      "type": "PERCENTAGE",
      "value": 10,
      "amount": 67.2
    },
    "totalDue": 604.8,
    "balanceDue": 604.8,
    "payment": null,
    "createdAt": "2026-02-24T08:10:00.000Z",
    "updatedAt": "2026-02-24T08:10:00.000Z"
  }
}
```

---

## 2) List Invoices
`GET /invoices?status=ISSUED,PAID&tableId=65f1f2c9c8f7f6a2d1011111&page=1&limit=20`

Response:
```json
{
  "items": [
    {
      "id": "65f1f2c9c8f7f6a2d3000001",
      "tenantId": "65f1f2c9c8f7f6a2d1000001",
      "orderId": "65f1f2c9c8f7f6a2d2000001",
      "table": {
        "id": "65f1f2c9c8f7f6a2d1011111",
        "number": 12,
        "name": "Patio 12"
      },
      "status": "ISSUED",
      "note": "",
      "items": [],
      "subTotal": 640,
      "taxTotal": 32,
      "grandTotal": 672,
      "discount": {
        "type": "PERCENTAGE",
        "value": 10,
        "amount": 67.2
      },
      "totalDue": 604.8,
      "balanceDue": 604.8,
      "payment": null,
      "createdAt": "2026-02-24T08:10:00.000Z",
      "updatedAt": "2026-02-24T08:10:00.000Z"
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

---

## 3) Get Invoice By Id
`GET /invoices/:invoiceId`

---

## 4) Update Invoice (note / discount)
`PUT /invoices/:invoiceId`

Payload:
```json
{
  "note": "updated note",
  "discountType": "FLAT",
  "discountValue": 50
}
```

Notes:
- Paid/void invoice ka discount update nahi hota.

---

## 5) Pay Invoice
`POST /invoices/:invoiceId/pay`

Payload:
```json
{
  "method": "CASH",
  "reference": "TXN123",
  "paidAmount": 605
}
```

Notes:
- `paidAmount` >= `totalDue` hona chahiye.

---

## 6) Delete Invoice
`DELETE /invoices/:invoiceId`

Notes:
- Paid invoice delete nahi hota.
