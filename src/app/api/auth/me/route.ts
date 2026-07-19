import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    message: "Auth status endpoint",
    authenticated: false,
    user: null,
  });
}
