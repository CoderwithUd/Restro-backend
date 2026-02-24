# Expense API

Base URL: `/api`

Auth: Bearer token (`Authorization: Bearer <accessToken>`) or `accessToken` cookie.

Roles: OWNER, MANAGER only.

---

## 1) Create Expense
`POST /expenses`

Payload:
```json
{
  "amount": 250,
  "category": "Groceries",
  "note": "Fresh veggies",
  "expenseDate": "2026-02-24T08:00:00.000Z"
}
```

Response (201):
```json
{
  "message": "expense created",
  "expense": {
    "id": "65f1f2c9c8f7f6a2d4000001",
    "tenantId": "65f1f2c9c8f7f6a2d1000001",
    "amount": 250,
    "category": "Groceries",
    "note": "Fresh veggies",
    "expenseDate": "2026-02-24T08:00:00.000Z",
    "createdAt": "2026-02-24T08:01:00.000Z",
    "updatedAt": "2026-02-24T08:01:00.000Z"
  }
}
```

---

## 2) List Expenses
`GET /expenses?from=2026-02-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z&page=1&limit=20`

---

## 3) Update Expense
`PUT /expenses/:expenseId`

Payload:
```json
{
  "amount": 300,
  "note": "updated note"
}
```

---

## 4) Delete Expense
`DELETE /expenses/:expenseId`
