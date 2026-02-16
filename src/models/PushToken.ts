import mongoose, { Schema } from "mongoose";

export interface IPushToken {
  userId: mongoose.Types.ObjectId;
  token: string;
  platform: "ios" | "android";
  createdAt: Date;
  updatedAt: Date;
}

const PushTokenSchema = new Schema<IPushToken>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  token: { type: String, required: true },
  platform: { type: String, enum: ["ios", "android"], required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

PushTokenSchema.index({ userId: 1, token: 1 }, { unique: true });

export default mongoose.models.PushToken ||
  mongoose.model<IPushToken>("PushToken", PushTokenSchema);
