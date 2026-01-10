import mongoose from "mongoose";
import app from "./app";
import { Server as SocketIOServer } from "socket.io";
import http from "http";
import "dotenv/config";

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer(app);
export const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

async function start() {
  try {
    // Берём MongoDB из Railway
    const mongoUrl = process.env.MONGO_URL;
    if (!mongoUrl) {
      console.error(
        "MongoDB URL not set in environment variables! Check Railway Variables."
      );
      process.exit(1);
    }

    await mongoose.connect(mongoUrl);
    console.log("MongoDB connected");

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server", err);
  }
}

start();
