const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

app.use("/api/health", require("./routes/health.routes"));

app.use("/api", require("./routes"));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/tenant", require("./routes/tenant.routes"));
app.use("/api/menu", require("./routes/menu.routes"));
app.use("/api/tables", require("./routes/table.routes"));
app.use("/api/orders", require("./routes/order.routes"));

module.exports = app;
