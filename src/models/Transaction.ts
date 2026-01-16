import mongoose, { Schema, Document } from "mongoose";

export interface ITransaction extends Document {
  user: mongoose.Types.ObjectId;
  type: "deposit" | "withdraw" | "bid_hold" | "bid_refund" | "bid_win";
  amount: number;
  auction?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["deposit", "withdraw", "bid_hold", "bid_refund", "bid_win"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    auction: {
      type: Schema.Types.ObjectId,
      ref: "Auction",
    },
  },
  { timestamps: true }
);

export default mongoose.model<ITransaction>(
  "Transaction",
  TransactionSchema
);
