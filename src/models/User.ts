import mongoose, { Schema, Document, Model } from "mongoose";
import crypto from "crypto";

export type ProSource = "lifetime" | "license_key" | "apple_iap" | "stripe";

export interface IUserEntitlements {
  lifetimePro: boolean;
  proExpiresAt?: Date;
  proSource?: ProSource;
}

export interface IUser {
  email: string;
  passwordHash: string;
  salt: string;
  licenseKey?: string;
  sessionTokens: string[];
  appleUserId?: string;
  entitlements: IUserEntitlements;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {
  verifyPassword(password: string): boolean;
  setPassword(password: string): void;
  addSessionToken(): string;
}

const UserSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    salt: {
      type: String,
      required: true,
    },
    licenseKey: {
      type: String,
      default: undefined,
    },
    sessionTokens: {
      type: [String],
      default: [],
      index: true,
    },
    appleUserId: {
      type: String,
      default: undefined,
      index: true,
      sparse: true,
    },
    entitlements: {
      lifetimePro: { type: Boolean, default: false },
      proExpiresAt: { type: Date, default: undefined },
      proSource: { type: String, default: undefined },
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.methods.setPassword = function (password: string) {
  this.salt = crypto.randomBytes(16).toString("hex");
  this.passwordHash = crypto
    .pbkdf2Sync(password, this.salt, 10000, 64, "sha512")
    .toString("hex");
};

UserSchema.methods.verifyPassword = function (password: string): boolean {
  const hash = crypto
    .pbkdf2Sync(password, this.salt, 10000, 64, "sha512")
    .toString("hex");
  return hash === this.passwordHash;
};

UserSchema.methods.addSessionToken = function (): string {
  const token = crypto.randomBytes(32).toString("hex");
  // Keep last 10 sessions, discard oldest
  this.sessionTokens = [...this.sessionTokens.slice(-9), token];
  return token;
};

const User: Model<IUserDocument> =
  mongoose.models.User || mongoose.model<IUserDocument>("User", UserSchema);

export default User;
