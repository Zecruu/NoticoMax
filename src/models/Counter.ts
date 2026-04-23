import mongoose, { Schema, Model } from "mongoose";

export interface ICounterDocument {
  _id: string;
  seq: number;
}

const CounterSchema = new Schema<ICounterDocument>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { _id: false }
);

const Counter: Model<ICounterDocument> =
  mongoose.models.Counter ||
  mongoose.model<ICounterDocument>("Counter", CounterSchema);

/**
 * Atomically increment a named counter and return the new value.
 * Creates the counter on first call.
 */
export async function nextSequence(name: string): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

export default Counter;
