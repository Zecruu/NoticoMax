import { NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/items/:path*",
    "/api/folders/:path*",
  ],
};
