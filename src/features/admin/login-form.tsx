"use client";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useForm } from "react-hook-form";
import { AdminButton as Button } from "./admin-button";
import { AdminLabeledInput as LabeledInput } from "./admin-fields";
import { adminRequest } from "./client";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function LoginForm({ configured }: { configured: boolean }) {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  const router = useRouter();
  const { register, handleSubmit } = useForm<{
    username: string;
    password: string;
  }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      method="post"
      className="mt-8 space-y-5"
      onSubmit={handleSubmit(async (value) => {
        setBusy(true);
        setError("");
        try {
          await adminRequest("login", value);
          router.replace("/namu-admin/counter");
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
        }
      })}
    >
      {!configured && (
        <p role="status" className="rounded-xl bg-secondary p-4 text-sm">
          관리자 서비스는 준비 중입니다. Supabase 연결과 관리자 계정을 먼저
          설정해주세요.
        </p>
      )}
      <LabeledInput
        label="아이디"
        id="username"
        autoComplete="username"
        disabled={!ready || busy || !configured}
        required
        {...register("username")}
      />
      <LabeledInput
        label="비밀번호"
        id="password"
        type="password"
        autoComplete="current-password"
        disabled={!ready || busy || !configured}
        required
        {...register("password")}
      />
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <Button className="w-full h-12" disabled={!ready || busy || !configured}>
        {busy ? "확인 중…" : "관리자 로그인"}
      </Button>
    </form>
  );
}
