# Public QR Menu + Order API

Base URL: `/api/public`

Auth: Not required (public).

Tenant resolution:
- `x-tenant-slug` header, or
- `tenantSlug` in query/body, or
- subdomain (if configured).

---

## 1) Public Menu (QR scan)
`GET /menu`

Query (optional):
- `tableId` or `tableNumber` (to show table info)
- `token` (recommended, hides tableId)
- `tenantSlug` if not using header/subdomain

Example:
```
GET /api/public/menu?tenantSlug=spicy-hub&tableNumber=12
```

Example (secure token):
```
GET /api/public/menu?token=TABLE_QR_TOKEN
```

Response:
```json
{
  "tenant": { "id": "TENANT_ID", "name": "Spicy Hub", "slug": "spicy-hub" },
  "table": { "id": "TABLE_ID", "number": 12, "name": "Patio 12" },
  "categories": [
    {
      "id": "CAT_ID",
      "name": "Starters",
      "items": [
        {
          "id": "ITEM_ID",
          "name": "Paneer Tikka",
          "isAvailable": true,
          "variants": [{ "id": "VARIANT_ID", "name": "Full", "price": 320 }]
        }
      ],
      "children": []
    }
  ]
}
```

---

## QR Code Generate (Table, legacy)
`GET /api/tables/:tableId/qr`

Auth: required (OWNER/MANAGER).

Query:
- `baseUrl` (optional) → QR me jo URL chahiye
- `format`: `dataUrl` (default) or `svg`

Example:
```
GET /api/tables/65f1f2c9c8f7f6a2d1011111/qr?baseUrl=https://your-frontend.com/qr&format=dataUrl
```

Response:
```json
{
  "table": { "id": "TABLE_ID", "number": 12, "name": "Patio 12" },
  "tenant": { "id": "TENANT_ID", "name": "Spicy Hub", "slug": "spicy-hub" },
  "qrPayload": "https://your-frontend.com/qr?tenantSlug=spicy-hub&tableId=TABLE_ID",
  "format": "dataUrl",
  "qr": "data:image/png;base64,....."
}
```

Notes:
- QR payload me `tenantSlug` + `tableId` set hota hai.
- Frontend is URL ko read karke menu call karta hai.

---

## QR Code Generate (Table, secure token)
`POST /api/tables/:tableId/qr-token`

Auth: required (OWNER/MANAGER).

Payload (optional):
```json
{
  "baseUrl": "https://your-frontend.com/qr",
  "format": "dataUrl",
  "expiresInHours": 720
}
```

Response:
```json
{
  "table": { "id": "TABLE_ID", "number": 12, "name": "Patio 12" },
  "tenant": { "id": "TENANT_ID", "name": "Spicy Hub", "slug": "spicy-hub" },
  "token": "TABLE_QR_TOKEN",
  "expiresAt": "2026-03-26T10:00:00.000Z",
  "qrPayload": "https://your-frontend.com/qr?token=TABLE_QR_TOKEN",
  "format": "dataUrl",
  "qr": "data:image/png;base64,....."
}
```

Notes:
- QR payload me sirf `token` hota hai (tableId hide).
- Token expire hone ke baad QR invalid ho jayega.

---

## 2) Public Order (Guest)
`POST /orders`

Payload:
```json
{
  "token": "TABLE_QR_TOKEN",
  "customerName": "Rahul",
  "customerPhone": "9999999999",
  "note": "no onion",
  "items": [
    {
      "itemId": "ITEM_ID",
      "variantId": "VARIANT_ID",
      "quantity": 2,
      "optionIds": ["OPTION_ID"]
    }
  ]
}
```

Notes:
- `customerName` and `customerPhone` required.
- `token` ya `tableId`/`tableNumber` required.
- Order source: `QR`

Response (201):
```json
{
  "message": "order created",
  "order": {
    "id": "ORDER_ID",
    "table": { "id": "TABLE_ID", "number": 12, "name": "Patio 12" },
    "source": "QR",
    "customer": { "name": "Rahul", "phone": "9999999999" },
    "status": "PLACED",
    "grandTotal": 672
  }
}
```
