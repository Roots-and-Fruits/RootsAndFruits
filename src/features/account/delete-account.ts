import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { HttpError } from "@/features/admin/http";
import { unlinkKakao } from "./kakao-unlink";

export async function customerDeletionReady(memberId: string) {
  const { data, error } = await createServiceClient().rpc(
    "customer_deletion_ready",
    { p_member: memberId },
  );
  return (
    !error && data === true && Boolean(process.env.KAKAO_ADMIN_KEY?.trim())
  );
}

export async function deleteCustomerAccount(memberId: string) {
  if (!(await customerDeletionReady(memberId)))
    throw new HttpError(
      "계정 삭제 기능을 준비하고 있어요. 잠시 후 다시 이용해주세요.",
      503,
    );
  const db = createServiceClient();
  const { data, error } = await db.auth.admin.getUserById(memberId);
  const identity = data.user?.identities?.find(
    (entry) => entry.provider === "kakao",
  );
  const providerId = identity?.identity_data?.sub ?? identity?.id;
  if (error || !providerId || !/^[1-9]\d{0,18}$/.test(String(providerId)))
    throw new HttpError(
      "카카오 계정 정보를 확인하지 못했어요. 다시 로그인해주세요.",
      409,
    );
  try {
    await unlinkKakao(String(providerId), process.env.KAKAO_ADMIN_KEY!.trim());
  } catch (error) {
    throw new HttpError(
      error instanceof Error ? error.message : "카카오 연결 해제에 실패했어요.",
      503,
    );
  }
  const deleted = await db.auth.admin.deleteUser(memberId);
  // Another identical request may already have deleted this verified account.
  if (deleted.error && deleted.error.status !== 404)
    throw new HttpError(
      "카카오 연결은 해제했지만 계정 삭제를 완료하지 못했어요. 이 화면에서 다시 시도해주세요.",
      503,
    );
}
