const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

app.use("/api", require("./routes"));
app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/tenant", require("./routes/tenant.routes"));
app.use("/api/menu", require("./routes/menu.routes"));

module.exports = app;
