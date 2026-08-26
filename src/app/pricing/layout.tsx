import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plans and pricing — NOTICO MAX",
  description:
    "Free stays on this device. Paid plans are Pro, Platinum, and MAXXED — sync and Lyte allowances.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
