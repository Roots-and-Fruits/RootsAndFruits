import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { emitKeypressEvents } from "node:readline";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error(".env.local의 Supabase 연결값이 필요합니다.");
if (!process.stdin.isTTY)
  throw new Error(
    "비밀번호를 안전하게 입력할 수 있는 터미널에서 실행해주세요.",
  );
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const rl = createInterface({ input: process.stdin, output: process.stdout });
const slot = Number(await rl.question("관리자 번호 (1 또는 2): "));
const username = (
  await rl.question("관리자 아이디 (영문/숫자/_/- 3~40자): ")
).trim();
rl.close();
if (![1, 2].includes(slot) || !/^[-_a-zA-Z0-9]{3,40}$/.test(username))
  throw new Error("입력을 확인해주세요.");
async function hiddenPassword() {
  process.stdout.write("비밀번호 (12자 이상, 화면에 표시되지 않음): ");
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return await new Promise((resolve) => {
    let value = "";
    const listener = (text, key) => {
      if (key?.ctrl && key.name === "c") {
        process.stdin.setRawMode(false);
        process.exit(130);
      }
      if (key?.name === "return") {
        process.stdin.off("keypress", listener);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\n");
        resolve(value);
      } else if (key?.name === "backspace") value = value.slice(0, -1);
      else if (text && !key?.ctrl) value += text;
    };
    process.stdin.on("keypress", listener);
  });
}
const password = await hiddenPassword();
if (password.length < 12)
  throw new Error("12자 이상의 비밀번호를 사용해주세요.");
const email = `${username.toLowerCase()}@staff.roots-and-fruits.invalid`;
const { data, error } = await db.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error) {
  console.error(
    "관리자 인증 계정 생성 실패. 이미 사용 중인 아이디 또는 비밀번호 정책을 확인해주세요.",
  );
  process.exit(1);
}
const result = await db.rpc("provision_staff", {
  p_slot: slot,
  p_user: data.user.id,
  p_username: username,
  p_email: email,
});
if (result.error) {
  await db.auth.admin.deleteUser(data.user.id);
  console.error(
    "관리자 등록 실패. 마이그레이션 적용 및 해당 관리자 번호의 기존 계정을 확인해주세요.",
  );
  process.exit(1);
}
console.log(
  `관리자 ${slot} 계정을 준비했습니다. /admin/login에서 로그인해주세요.`,
);
