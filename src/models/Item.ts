import mongoose, { Schema, Document, Model } from "mongoose";

export type ItemType = "note" | "url" | "reminder";

export interface IItem {
  clientId: string;
  userId: string;
  type: ItemType;
  title: string;
  content: string;
  url?: string;
  reminderDate?: Date;
  reminderCompleted?: boolean;
  tags: string[];
  pinned: boolean;
  color?: string;
  folderId?: string;
  deleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IItemDocument extends IItem, Document {}

const ItemSchema = new Schema<IItemDocument>(
  {
    clientId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["note", "url", "reminder"],
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
    url: {
      type: String,
    },
    reminderDate: {
      type: Date,
    },
    reminderCompleted: {
      type: Boolean,
      default: false,
    },
    tags: {
      type: [String],
      default: [],
    },
    pinned: {
      type: Boolean,
      default: false,
    },
    color: {
      type: String,
    },
    folderId: {
      type: String,
      index: true,
    },
    deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

ItemSchema.index({ title: "text", content: "text", tags: "text", url: "text" });

const Item: Model<IItemDocument> =
  mongoose.models.Item || mongoose.model<IItemDocument>("Item", ItemSchema);

export default Item;
