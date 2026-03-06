import mongoose, { Schema, Document, Model } from "mongoose";

export interface ILicense {
  licenseKey: string;
  productId: string;
  purchaseEmail: string;
  gumroadPurchaseId: string;
  active: boolean;
  uses: number;
  validatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ILicenseDocument extends ILicense, Document {}

const LicenseSchema = new Schema<ILicenseDocument>(
  {
    licenseKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    productId: {
      type: String,
      required: true,
    },
    purchaseEmail: {
      type: String,
      default: "",
    },
    gumroadPurchaseId: {
      type: String,
      default: "",
    },
    active: {
      type: Boolean,
      default: true,
    },
    uses: {
      type: Number,
      default: 0,
    },
    validatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const License: Model<ILicenseDocument> =
  mongoose.models.License || mongoose.model<ILicenseDocument>("License", LicenseSchema);

export default License;
