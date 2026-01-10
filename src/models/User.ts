import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  username: string;
  telegramId?: number;
  balance: number;
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    telegramId: {
      type: Number,
      unique: true,
      sparse: true,
    },

    balance: {
      type: Number,
      default: 1000,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IUser>("User", UserSchema);
