import mongoose from "mongoose";
import { runMigrations } from "./migrations.js";

const connectDB = async (): Promise<void> => {
  try {
    // Indexes are built by runMigrations, after data fixes have run
    mongoose.set("autoIndex", false);
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");
  } catch (error) {
    console.error("❌ MongoDB connection error", error);
    process.exit(1);
  }

  try {
    await runMigrations();
  } catch (error) {
    // Don't take the API down over a failed migration; surface it loudly
    console.error("❌ Database migrations failed", error);
  }
};

export default connectDB;
