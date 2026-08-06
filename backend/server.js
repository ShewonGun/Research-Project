import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/dbConfig.js";
import userRoutes from "./routes/userRoutes.js";
import waterPackageRoutes from "./routes/waterPackageRoutes.js";
import deviceRoutes from "./routes/deviceRoutes.js";
import readingRoutes from "./routes/readingRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import tariffRoutes from "./routes/tariffRoutes.js";
import billRoutes from "./routes/billRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";

dotenv.config();

connectDB();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Backend is running!");
});

app.use("/api/users", userRoutes);
app.use("/api/water-packages", waterPackageRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/readings", readingRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/tariff", tariffRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/alerts", alertRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});