import mongoose from "mongoose";

const connectDB = async () => {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.error("Missing MONGODB_URI in environment variables.");
        process.exit(1);
    }

    try {
        const conn = await mongoose.connect(uri);
        console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    } catch (error) {
        console.error(`MongoDB connection error: ${error.message}`);
        process.exit(1);
    }

    // Log connection lifecycle events after the initial connect.
    mongoose.connection.on("disconnected", () => {
        console.warn("MongoDB disconnected.");
    });

    mongoose.connection.on("error", (err) => {
        console.error(`MongoDB runtime error: ${err.message}`);
    });
};

export default connectDB;
