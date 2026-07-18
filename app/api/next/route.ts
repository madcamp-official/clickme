import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DESTINATION = new URL("https://seojiny.com");

export function GET() {
  const response = NextResponse.redirect(DESTINATION, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
