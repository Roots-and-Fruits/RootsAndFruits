"use client";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export function KakaoLoginButton({
  busy,
  disabled,
  onClick,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      className="h-14 w-full rounded-xl bg-[#FEE500] text-[#191919] hover:bg-[#FEE500]"
      disabled={busy || disabled}
      onClick={onClick}
    >
      <Image
        src="/auth/kakao-login.svg"
        loading="eager"
        alt=""
        width={224}
        height={46}
        unoptimized
      />
      <span className="sr-only">{busy ? "연결 중…" : "카카오 로그인"}</span>
    </Button>
  );
}
