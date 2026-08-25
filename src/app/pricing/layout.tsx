import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plans and pricing — NOTICO MAX",
  description:
    "Free stays on this device. Pro adds cloud sync and removes ads for $2.99 a month. Family adds household sharing.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
