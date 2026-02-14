const mongoose = require("mongoose");
const env = require("./env");

module.exports = async () => {
  await mongoose.connect(env.MONGO_URI);
  console.log("MongoDB connected");
};
