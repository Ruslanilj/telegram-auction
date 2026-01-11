import express from "express";
import User from "./models/User";
import Auction from "./models/Auction";
import path from "path";
import crypto from "crypto";
import { io } from "./server";

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..")));

// ===== Health =====
app.get("/health", (_, res) => res.send("OK"));

// ===== Telegram auth utils =====
function verifyTelegramAuth(data: any): boolean {
  const { hash, ...rest } = data;

  const secret = crypto
    .createHash("sha256")
    .update(process.env.TG_BOT_TOKEN!)
    .digest();

  const checkString = Object.keys(rest)
    .sort()
    .map(key => `${key}=${rest[key]}`)
    .join("\n");

  const hmac = crypto
    .createHmac("sha256", secret)
    .update(checkString)
    .digest("hex");

  return hmac === hash;
}

// ===== Auth =====
app.post("/auth/local", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });

  let user = await User.findOne({ username });
  if (!user) {
    user = await User.create({ username, balance: 1000 });
  }

  res.json(user);
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

// ===== Auctions =====
app.post("/auctions", async (req, res) => {
  const { item, startingPrice } = req.body;
  const auction = await Auction.create({ item, startingPrice });

  res.status(201).json(auction);

  io.emit(
    "auctionUpdated",
    await Auction.findById(auction._id).populate("highestBidder")
  );
});

app.get("/auctions", async (_, res) => {
  res.json(await Auction.find().populate("highestBidder"));
});

// ===== Bid =====
app.post("/auctions/:id/bid", async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const auction = await Auction.findById(req.params.id).populate("highestBidder");

    if (!auction || !auction.isActive)
      return res.status(400).json({ error: "Auction not active" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (amount <= auction.highestBid)
      return res.status(400).json({ error: "Bid too low" });
    if (user.balance < amount)
      return res.status(400).json({ error: "Not enough balance" });

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

    const updated = await Auction.findById(auction._id).populate("highestBidder");
    io.emit("auctionUpdated", updated);

    res.json({ user, auction: updated });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ===== Reset =====
app.delete("/reset", async (_, res) => {
  await User.deleteMany({});
  await Auction.deleteMany({});
  res.send("Database cleared");
});

export default app;
