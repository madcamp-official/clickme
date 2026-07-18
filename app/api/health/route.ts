import { jsonNoStore } from "../../../lib/server/http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return jsonNoStore({ status: "ok", timestamp: new Date().toISOString() });
}
