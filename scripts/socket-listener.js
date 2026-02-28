const { io } = require("socket.io-client");

// const socketUrl = process.env.SOCKET_URL || "http://localhost:5000";
const socketUrl =
  process.env.SOCKET_URL ||
  "https://restro-backend-hpx8.onrender.com";
const accessToken = process.env.ACCESS_TOKEN;

if (!accessToken) {
  console.error("ACCESS_TOKEN missing. Example: ACCESS_TOKEN=... node scripts/socket-listener.js");
  process.exit(1);
}

const socket = io(socketUrl, {
  auth: { accessToken },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("Connected:", socket.id);
});

socket.on("connect_error", (err) => {
  console.error("Connect error:", err.message || err);
});

socket.on("order.created", (payload) => {
  console.log("order.created:", JSON.stringify(payload, null, 2));
});

socket.on("order.updated", (payload) => {
  console.log("order.updated:", JSON.stringify(payload, null, 2));
});

socket.on("order.deleted", (payload) => {
  console.log("order.deleted:", JSON.stringify(payload, null, 2));
});

process.on("SIGINT", () => {
  socket.disconnect();
  process.exit(0);
});
