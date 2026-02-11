export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    "/api/items/:path*",
    "/api/folders/:path*",
    "/api/stripe/:path*",
  ],
};
