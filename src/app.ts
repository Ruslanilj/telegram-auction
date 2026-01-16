import express from "express";
import path from "path";
import crypto from "crypto";

import User from "./models/User";
import Auction from "./models/Auction";
import Transaction from "./models/Transaction";
import { io } from "./server";

const app = express();
app.use(express.json());

// Статику лучше держать ПОСЛЕ API, но у тебя всё на одном домене — оставим в конце файла
// app.use(express.static(path.join(__dirname, "..")));

// ===== Health =====
app.get("/health", (_, res) => res.send("OK"));

// ===== Telegram auth verify =====
function verifyTelegramAuth(data: any): boolean {
  const { hash, ...rest } = data;

  const secret = crypto
    .createHash("sha256")
    .update(process.env.TG_BOT_TOKEN || "")
    .digest();

  const checkString = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("\n");

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(checkString)
    .digest("hex");

  return hmac === hash;
}

// ===== Auth =====
app.post("/auth/local", async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "username required" });

    let user = await User.findOne({ username });
    if (!user) user = await User.create({ username, balance: 1000 });

    res.json(user);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/auth/telegram", async (req, res) => {
  try {
    const data = req.body;

    if (!verifyTelegramAuth(data)) {
      return res.status(401).json({ error: "Invalid Telegram auth" });
    }

    const telegramId = data.id;
    const username =
      data.username || `${data.first_name || "tg"}_${telegramId}`;

    let user = await User.findOne({ telegramId });

    if (!user) {
      user = await User.create({
        telegramId,
        username,
        balance: 1000,
      });
    }

    res.json(user);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ===== Users =====
app.get("/users", async (_, res) => {
  res.json(await User.find());
});

// ===== Wallet + Transactions =====
app.post("/wallet/adjust", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || typeof amount !== "number") {
      return res.status(400).json({ error: "userId and amount required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (amount < 0 && user.balance + amount < 0) {
      return res.status(400).json({ error: "Not enough balance" });
    }

    user.balance += amount;
    await user.save();

    await Transaction.create({
      user: user._id,
      type: amount > 0 ? "deposit" : "withdraw",
      amount,
    });

    res.json(user);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/transactions", async (req, res) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const txs = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(txs);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Auctions =====
app.post("/auctions", async (req, res) => {
  try {
    const { item, startingPrice, durationSec, snipingWindowSec, extendSec } =
      req.body;

    if (!item || typeof startingPrice !== "number") {
      return res.status(400).json({ error: "item and startingPrice required" });
    }

    const duration = Number(durationSec) || 60;
    const endsAt = new Date(Date.now() + duration * 1000);

    const auction = await Auction.create({
      item,
      startingPrice,
      endsAt,
      snipingWindowSec: Number(snipingWindowSec) || 15,
      extendSec: Number(extendSec) || 15,
    });

    res.status(201).json(auction);

    io.emit(
      "auctionUpdated",
      await Auction.findById(auction._id).populate("highestBidder")
    );
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/auctions", async (_, res) => {
  res.json(await Auction.find().populate("highestBidder"));
});

// ===== Bid =====
app.post("/auctions/:id/bid", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || typeof amount !== "number") {
      return res.status(400).json({ error: "userId and amount required" });
    }

    const auction = await Auction.findById(req.params.id).populate(
      "highestBidder"
    );

    if (!auction || !auction.isActive) {
      return res.status(400).json({ error: "Auction not active" });
    }

    // ✅ сперва проверяем таймер и anti-sniping
    const now = Date.now();
    const timeLeftMs = new Date(auction.endsAt).getTime() - now;

    if (timeLeftMs <= 0) {
      auction.isActive = false;
      await auction.save();

      const updated = await Auction.findById(auction._id).populate(
        "highestBidder"
      );
      io.emit("auctionUpdated", updated);

      return res.status(400).json({ error: "Auction ended" });
    }

    if (timeLeftMs <= auction.snipingWindowSec * 1000) {
      auction.endsAt = new Date(
        new Date(auction.endsAt).getTime() + auction.extendSec * 1000
      );
    }

    // ✅ проверка минимальной ставки
    if (amount < auction.startingPrice) {
      return res
        .status(400)
        .json({ error: "Bid must be >= starting price" });
    }

    if (amount <= auction.highestBid) {
      return res.status(400).json({ error: "Bid too low" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.balance < amount) {
      return res.status(400).json({ error: "Not enough balance" });
    }

    // ✅ возврат предыдущему лидеру
    if (auction.highestBidder) {
      const prev = await User.findById((auction.highestBidder as any)._id);
      if (prev) {
        prev.balance += auction.highestBid;
        await prev.save();

        await Transaction.create({
          user: prev._id,
          type: "bid_refund",
          amount: auction.highestBid,
          auction: auction._id,
        });
      }
    }

    // ✅ списание у текущего
    user.balance -= amount;
    await user.save();

    await Transaction.create({
      user: user._id,
      type: "bid_hold",
      amount: -amount,
      auction: auction._id,
    });

    // ✅ обновление аукциона
    auction.highestBid = amount;
    auction.highestBidder = user._id;

    await auction.save();

    const updated = await Auction.findById(auction._id).populate("highestBidder");
    io.emit("auctionUpdated", updated);

    res.json({ user, auction: updated });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ===== Reset (dev only) =====
app.get("/reset", async (_, res) => {
  await User.deleteMany({});
  await Auction.deleteMany({});
  await Transaction.deleteMany({});
  res.send("Database cleared!");
});

// ===== Static LAST =====
app.use(express.static(path.join(__dirname, "..")));

export default app;
