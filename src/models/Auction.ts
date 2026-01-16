import mongoose from "mongoose";

const auctionSchema = new mongoose.Schema(
  {
    item: { type: String, required: true },

    startingPrice: { type: Number, required: true },

    highestBid: { type: Number, default: 0 },

    highestBidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isActive: { type: Boolean, default: true },

    //Таймер аукциона
    endsAt: { type: Date, required: true },

    //Anti-sniping
    snipingWindowSec: { type: Number, default: 15 }, 
    extendSec: { type: Number, default: 15 },       
  },
  { timestamps: true }
);

const Auction = mongoose.model("Auction", auctionSchema);
export default Auction;
