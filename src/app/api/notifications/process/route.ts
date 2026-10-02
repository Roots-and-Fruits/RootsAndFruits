import { timingSafeEqual } from "node:crypto";
import {
  processNotifications,
  smsReady,
} from "@/features/notifications/server";

export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.NOTIFICATION_CRON_SECRET;
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!smsReady())
    return Response.json({ error: "SMS is not configured" }, { status: 503 });
  try {
    return Response.json(
      { processed: await processNotifications() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Notification processing failed" },
      { status: 503 },
    );
  }
}
