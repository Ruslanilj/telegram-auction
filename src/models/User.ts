import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  username?: string;
  telegramId?: string;
  balance: number;
}

const UserSchema = new Schema<IUser>(
  {
    telegramId: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },

    username: {
      type: String,
      trim: true
    },

    balance: {
      type: Number,
      default: 1000,
      min: 0
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model<IUser>("User", UserSchema);
