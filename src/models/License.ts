import mongoose, { Schema, Document, Model } from "mongoose";

export interface ILicense {
  licenseKey: string;
  active: boolean;
  email?: string;
  activatedAt?: Date;
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
    active: {
      type: Boolean,
      default: true,
    },
    email: {
      type: String,
      default: "",
    },
    activatedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

const License: Model<ILicenseDocument> =
  mongoose.models.License || mongoose.model<ILicenseDocument>("License", LicenseSchema);

export default License;
