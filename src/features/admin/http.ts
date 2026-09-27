import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function readBody(request: Request) {
  const originValue = request.headers.get("origin");
  const origin =
    originValue && URL.canParse(originValue) ? new URL(originValue) : null;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    new URL(request.url).protocol.slice(0, -1);
  if (
    !origin ||
    origin.host !== request.headers.get("host") ||
    origin.protocol !== `${protocol}:`
  )
    throw new HttpError("요청 출처를 확인할 수 없습니다.", 403);
  const text = await request.text();
  if (text.length > 250000)
    throw new HttpError("요청 내용이 너무 큽니다.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError("입력 형식을 확인해주세요.");
  }
}
export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues[0]?.message ?? "입력을 확인해주세요." },
      { status: 400 },
    );
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  return Response.json(
    {
      error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
    },
    { status: 503 },
  );
}
export function checkDb(error: { message: string; code?: string } | null) {
  if (error)
    throw new HttpError(
      /^[가-힣]/.test(error.message)
        ? error.message
        : "데이터를 처리하지 못했습니다. 같은 요청으로 다시 시도해주세요.",
      error.code === "P0001" ||
        error.code === "P0002" ||
        /^(22|23)/.test(error.code ?? "")
        ? 400
        : 503,
    );
}
