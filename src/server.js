const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const env = require("./config/env");
const { initSocket } = require("./socket");

const startServer = async () => {
  try {
    await connectDB();
    const server = http.createServer(app);
    initSocket(server);

    server.listen(env.PORT, () => {
      console.log("Server running on port", env.PORT);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();
