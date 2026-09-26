import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-14 flex w-full max-w-6xl flex-col gap-4 border-t border-border px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-10">
      <p>
        나무와열매 <span className="mx-2 opacity-40">/</span> 농장에서 전하는
        마음
      </p>
      <div className="flex gap-6">
        <Link href="/login" className="hover:text-primary">
          회원 로그인
        </Link>
        <Link href="/admin/login" className="hover:text-primary">
          관리자
        </Link>
      </div>
    </footer>
  );
}
