import mongoose from "mongoose";

const connectDB = async () => {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        console.error("Missing MONGODB_URI in environment variables.");
        return;
    }

    try {
        const conn = await mongoose.connect(uri);
        console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    } catch (error) {
        // Don't crash the process (that would leave nodemon stuck "waiting for
        // file changes" and running stale code). Log and retry in the background.
        console.error(`MongoDB connection error: ${error.message}`);
        console.error("Retrying in 5s…");
        setTimeout(connectDB, 5000);
        return;
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
