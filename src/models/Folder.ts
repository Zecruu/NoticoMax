import mongoose, { Schema, Document, Model } from "mongoose";

export interface IFolder {
  clientId: string;
  userId: string;
  name: string;
  color?: string;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFolderDocument extends IFolder, Document {}

const FolderSchema = new Schema<IFolderDocument>(
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
    name: {
      type: String,
      required: true,
    },
    color: {
      type: String,
    },
    deleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Folder: Model<IFolderDocument> =
  mongoose.models.Folder || mongoose.model<IFolderDocument>("Folder", FolderSchema);

export default Folder;
