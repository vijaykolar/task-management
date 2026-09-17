import "dotenv/config";
import app from "./app.js";
import connectDB from "./db/index.js";
import { startAutomationScheduler } from "./utils/automation.js";
import { startDueReminders } from "./utils/due-reminders.js";

const port = process.env.PORT || 3000;

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`Example app listening on port http://localhost:${port}`);
    });
    startDueReminders();
    startAutomationScheduler();
  })
  .catch((err) => {
    console.error("MongoDB connection error", err);
    process.exit(1);
  });
