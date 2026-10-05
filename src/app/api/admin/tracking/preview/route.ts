import { getStaff } from "@/features/admin/auth";
import {
  apiError,
  assertRequestOrigin,
  checkDb,
  HttpError,
} from "@/features/admin/http";
import {
  groupTrackingRows,
  trackingFileLimit,
  trackingKey,
  type TrackingMatch,
} from "@/features/admin/tracking";
import { readTrackingWorkbook } from "@/features/admin/tracking-excel";
import { createServiceClient } from "@/lib/supabase/service";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertRequestOrigin(request);
    const staff = await getStaff();
    if (!staff) throw new HttpError("관리자 로그인이 필요합니다.", 401);
    if (
      Number(request.headers.get("content-length")) >
      trackingFileLimit + 65536
    )
      throw new HttpError("파일은 2MB까지 업로드할 수 있습니다.", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new HttpError("송장 내역 파일을 선택해주세요.");
    if (file.size > trackingFileLimit)
      throw new HttpError("파일은 2MB까지 업로드할 수 있습니다.", 413);
    let rows;
    try {
      rows = await readTrackingWorkbook(
        Buffer.from(await file.arrayBuffer()),
        file.name,
      );
    } catch (error) {
      throw new HttpError(
        error instanceof Error ? error.message : "엑셀 파일을 확인해주세요.",
      );
    }
    const keys = [
      ...new Set(rows.map((r) => r.key).filter((k) => trackingKey.test(k))),
    ];
    const { data, error } = await createServiceClient().rpc(
      "preview_delivery_tracking",
      { p_keys: keys, p_actor: staff.id },
    );
    if (error && ["PGRST202", "42883"].includes(error.code))
      throw new HttpError(
        "송장번호 DB 업데이트가 필요합니다. 송장번호 SQL을 적용해주세요.",
        503,
      );
    checkDb(error);
    return Response.json(groupTrackingRows(rows, data as TrackingMatch[]), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
