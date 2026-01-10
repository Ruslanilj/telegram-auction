import express from "express";
import User from "./models/User";
import Auction from "./models/Auction";
import path from "path";
import crypto from "crypto";
import { io } from "./server"; // импорт Socket.IO

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

// ===== Проверка сервера =====
app.get("/health", (_, res) => res.send("OK"));

// ===== Пользователи =====
app.post("/auth/local", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });

  let user = await User.findOne({ username });
  if (!user) {
    user = await User.create({ username, balance: 1000 });
  }

  res.json(user);
});

app.get("/users", async (_, res) => {
  const users = await User.find();
  res.json(users);
});

// ===== Аукционы =====
app.post("/auctions", async (req, res) => {
  const { item, startingPrice } = req.body;
  const auction = await Auction.create({ item, startingPrice });
  res.status(201).json(auction);

  // пушим новый аукцион всем клиентам
  io.emit("auctionUpdated", await Auction.findById(auction._id).populate("highestBidder"));
});

app.get("/auctions", async (_, res) => {
  const auctions = await Auction.find().populate("highestBidder");
  res.json(auctions);
});

// ===== Сделать ставку =====
app.post("/auctions/:id/bid", async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const auction = await Auction.findById(req.params.id).populate("highestBidder");
    if (!auction || !auction.isActive) return res.status(400).json({ error: "Auction not active" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (amount <= auction.highestBid) return res.status(400).json({ error: "Bid too low" });
    if (user.balance < amount) return res.status(400).json({ error: "Not enough balance" });

    // вернуть деньги предыдущему лидеру
    if (auction.highestBidder) {
      const prev = await User.findById(auction.highestBidder._id);
      if (prev) {
        prev.balance += auction.highestBid;
        await prev.save();
      }
    }

    user.balance -= amount;
    await user.save();

    auction.highestBid = amount;
    auction.highestBidder = user._id;
    await auction.save();

    const updatedAuction = await Auction.findById(auction._id).populate("highestBidder");

    // пушим обновление всем клиентам
    io.emit("auctionUpdated", updatedAuction);

    res.json({ user, auction: updatedAuction });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ===== Очистка базы =====
app.delete("/reset", async (_, res) => {
  await User.deleteMany({});
  await Auction.deleteMany({});
  res.send("Database cleared!");
});

export default app;
