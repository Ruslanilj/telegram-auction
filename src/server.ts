import mongoose from "mongoose";
import app from "./app";
import { Server as SocketIOServer } from "socket.io";
import http from "http";
import "dotenv/config";

const PORT = 3000;

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
    await mongoose.connect("mongodb://localhost:27017/auction");
    console.log("MongoDB connected");

    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server", err);
  }
}

console.log("TG TOKEN:", process.env.TG_BOT_TOKEN);
start();
