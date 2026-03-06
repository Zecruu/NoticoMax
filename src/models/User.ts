import mongoose, { Schema, Document, Model } from "mongoose";
import crypto from "crypto";

export interface IUser {
  email: string;
  passwordHash: string;
  salt: string;
  licenseKey?: string;
  sessionToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {
  verifyPassword(password: string): boolean;
  setPassword(password: string): void;
  generateSessionToken(): string;
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
    sessionToken: {
      type: String,
      index: true,
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

UserSchema.methods.generateSessionToken = function (): string {
  this.sessionToken = crypto.randomBytes(32).toString("hex");
  return this.sessionToken;
};

const User: Model<IUserDocument> =
  mongoose.models.User || mongoose.model<IUserDocument>("User", UserSchema);

export default User;
