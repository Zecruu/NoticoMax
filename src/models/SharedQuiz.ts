import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISharedQuiz {
  shareId: string;
  quizClientId: string;
  userId: string;
  name: string;
  questions: {
    question: string;
    options: { text: string; isCorrect: boolean }[];
  }[];
  createdAt: Date;
  expiresAt?: Date;
}

export interface ISharedQuizDocument extends ISharedQuiz, Document {}

const SharedQuizSchema = new Schema<ISharedQuizDocument>(
  {
    shareId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    quizClientId: {
      type: String,
      required: true,
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
    questions: [
      {
        question: { type: String, required: true },
        options: [
          {
            text: { type: String, required: true },
            isCorrect: { type: Boolean, required: true },
          },
        ],
      },
    ],
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const SharedQuiz: Model<ISharedQuizDocument> =
  mongoose.models.SharedQuiz || mongoose.model<ISharedQuizDocument>("SharedQuiz", SharedQuizSchema);

export default SharedQuiz;
