const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const app = express();

const corsOptions = {
  origin: [
    'http://localhost:3000',                    // development
    'http://localhost:5173',                     // Vite dev
    'https://tera-frontend.vercel.app',          // production frontend
    'https://tera-frontend.netlify.app'           // jo bhi ho
  ],
  credentials: true,                              // IMPORTANT
  optionsSuccessStatus: 200
};

app.use(express.json());
app.use(cookieParser());
// app.use(cors({ origin: true, credentials: true }));
app.use(cors(corsOptions));

app.use("/api/health", require("./routes/health.routes"));

app.use("/api", require("./routes"));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/tenant", require("./routes/tenant.routes"));
app.use("/api/menu", require("./routes/menu.routes"));
app.use("/api/tables", require("./routes/table.routes"));
app.use("/api/orders", require("./routes/order.routes"));
app.use("/api/invoices", require("./routes/invoice.routes"));
app.use("/api/expenses", require("./routes/expense.routes"));
app.use("/api/reports", require("./routes/report.routes"));
app.use("/api/public", require("./routes/public.routes"));

module.exports = app;
