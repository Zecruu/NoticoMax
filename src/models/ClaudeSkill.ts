import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISupportingFile {
  filename: string;
  content: string;
}

export interface IClaudeSkill {
  skillId: string;
  userId: string;
  name: string;
  description: string;
  frontmatter: Record<string, unknown>;
  content: string;
  supportingFiles: ISupportingFile[];
  tags: string[];
  isPublic: boolean;
  deleted: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IClaudeSkillDocument extends IClaudeSkill, Document {}

const SupportingFileSchema = new Schema(
  {
    filename: { type: String, required: true },
    content: { type: String, required: true },
  },
  { _id: false }
);

const ClaudeSkillSchema = new Schema<IClaudeSkillDocument>(
  {
    skillId: {
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
    description: {
      type: String,
      default: "",
    },
    frontmatter: {
      type: Schema.Types.Mixed,
      default: {},
    },
    content: {
      type: String,
      required: true,
    },
    supportingFiles: {
      type: [SupportingFileSchema],
      default: [],
    },
    tags: {
      type: [String],
      default: [],
    },
    isPublic: {
      type: Boolean,
      default: false,
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

// A user can only have one skill with a given name
ClaudeSkillSchema.index({ userId: 1, name: 1 }, { unique: true });
ClaudeSkillSchema.index({ name: "text", description: "text", tags: "text" });

const ClaudeSkill: Model<IClaudeSkillDocument> =
  mongoose.models.ClaudeSkill ||
  mongoose.model<IClaudeSkillDocument>("ClaudeSkill", ClaudeSkillSchema);

export default ClaudeSkill;
