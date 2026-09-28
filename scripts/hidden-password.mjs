import { emitKeypressEvents } from "node:readline";
export async function hiddenPassword() {
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
