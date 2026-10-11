// Called only by the server. A transport can be injected by isolated tests.
export async function unlinkKakao(
  userId: string,
  adminKey: string,
  transport: typeof fetch = fetch,
) {
  if (!/^[1-9]\d{0,18}$/.test(userId) || !adminKey)
    throw new Error("카카오 연결 정보를 확인하지 못했어요.");
  let response: Response;
  let data: { id?: unknown; code?: unknown };
  try {
    response = await transport("https://kapi.kakao.com/v1/user/unlink", {
      method: "POST",
      headers: {
        Authorization: `KakaoAK ${adminKey}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams({
        target_id_type: "user_id",
        target_id: userId,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
      redirect: "error",
    });
    data = await response.json();
  } catch {
    throw new Error(
      "카카오 연결 해제 결과를 확인하지 못했어요. 잠시 후 계정 삭제를 다시 시도해주세요.",
    );
  }
  // A previous unlink may have succeeded before its response or the Auth deletion
  // was lost. Kakao documents -101 as an account not connected to this app.
  if (response.status === 400 && data?.code === -101) return;
  const id =
    typeof data?.id === "string"
      ? data.id
      : typeof data?.id === "number" && Number.isSafeInteger(data.id)
        ? String(data.id)
        : null;
  if (!response.ok || id !== userId)
    throw new Error(
      "카카오 연결을 해제하지 못했어요. 잠시 후 다시 시도해주세요.",
    );
}
