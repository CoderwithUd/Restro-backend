
const mongoose = require("mongoose");
const env = require("./env");

const connectDB = async () => {
  try {
    mongoose.set("strictQuery", false);

    const conn = await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);

    setTimeout(connectDB, 5000);
  }
};

module.exports = connectDB;