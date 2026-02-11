import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISharedNote {
  shareId: string;
  itemClientId: string;
  userId: string;
  title: string;
  content: string;
  type: "note" | "url" | "reminder";
  url?: string;
  tags: string[];
  createdAt: Date;
  expiresAt?: Date;
}

export interface ISharedNoteDocument extends ISharedNote, Document {}

const SharedNoteSchema = new Schema<ISharedNoteDocument>(
  {
    shareId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    itemClientId: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["note", "url", "reminder"],
      required: true,
    },
    url: {
      type: String,
    },
    tags: {
      type: [String],
      default: [],
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const SharedNote: Model<ISharedNoteDocument> =
  mongoose.models.SharedNote || mongoose.model<ISharedNoteDocument>("SharedNote", SharedNoteSchema);

export default SharedNote;
