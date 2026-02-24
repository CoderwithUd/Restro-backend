# Reports / Dashboard API

Base URL: `/api`

Auth: Bearer token (`Authorization: Bearer <accessToken>`) or `accessToken` cookie.

Roles: OWNER, MANAGER only.

---

## Summary Report
`GET /reports/summary`

Query params:
- `period`: `today` | `yesterday` | `this_week` | `last_week` | `this_month` | `last_month` | `all` | `custom`
- `from`: ISO date (required when `period=custom`)
- `to`: ISO date (required when `period=custom`) — end is exclusive
- `tzOffsetMinutes`: integer (e.g. `330` for IST, `-480` for PST)
- `weekStartsOn`: `0` (Sun) .. `6` (Sat), default `1` (Mon)

Example (today, IST):
```
GET /reports/summary?period=today&tzOffsetMinutes=330
```

Example (custom):
```
GET /reports/summary?period=custom&from=2026-02-01T00:00:00.000Z&to=2026-03-01T00:00:00.000Z
```

Response:
```json
{
  "range": {
    "period": "today",
    "from": "2026-02-24T00:00:00.000Z",
    "to": "2026-02-25T00:00:00.000Z",
    "tzOffsetMinutes": 330,
    "weekStartsOn": 1
  },
  "sales": {
    "paidInvoices": 5,
    "grossSales": 4200,
    "discountTotal": 100,
    "taxTotal": 210,
    "netSales": 4100,
    "paidTotal": 4100,
    "avgTicket": 820
  },
  "orders": {
    "total": 9,
    "byStatus": {
      "PLACED": 2,
      "IN_PROGRESS": 1,
      "READY": 1,
      "SERVED": 4,
      "CANCELLED": 1
    }
  },
  "invoices": {
    "total": 6,
    "byStatus": {
      "ISSUED": 1,
      "PAID": 5
    }
  },
  "expenses": {
    "total": 500,
    "count": 3
  },
  "profitLoss": {
    "netResult": 3600,
    "profit": 3600,
    "loss": 0,
    "note": "profit/loss calculated as netSales - expenses (COGS not included)"
  }
}
```

Notes:
- Sales are from **PAID invoices** only.
- Profit/Loss is based on `netSales - expenses`. If you want COGS-based profit, add item cost fields first.
