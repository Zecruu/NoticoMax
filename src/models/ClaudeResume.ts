import mongoose, { Schema, Model, Document } from "mongoose";

export interface IClaudeResume {
  number: number;
  author: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IClaudeResumeDocument extends IClaudeResume, Document {}

const ClaudeResumeSchema = new Schema<IClaudeResumeDocument>(
  {
    number: { type: Number, required: true, unique: true, index: true },
    author: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    tags: { type: [String], default: [] },
  },
  { timestamps: true }
);

const ClaudeResume: Model<IClaudeResumeDocument> =
  mongoose.models.ClaudeResume ||
  mongoose.model<IClaudeResumeDocument>("ClaudeResume", ClaudeResumeSchema);

export default ClaudeResume;
