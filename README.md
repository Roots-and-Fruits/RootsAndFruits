# 나무와열매 · RootsAndFruits

Next.js + Supabase로 새로 구성하는 농장 택배 주문 서비스입니다.
개발 기준은 [AGENTS.md](AGENTS.md)와 [확정 요구사항](docs/requirements.md)입니다.

## 현재 구현 범위

- Next.js App Router / TypeScript / Tailwind CSS / shadcn(ui Radix) 기반과 새 홈 디자인.
- 일반·체험 진입 분리, 주문 안내, 공통 헤더·푸터 및 폼 컴포넌트.
- 보내는 분 → 받는 분 → 다음 주소 검색 → 상품 → 배송 일정 → 최종 확인 입력 흐름.
- 배송지별 독립 상품 선택, 여러 배송지 합계, 접수 전 수정·삭제, 수동 초기화.
- 일반·체험 날짜 차이, 기존 11자리 전화번호 및 동의 검증.
- Supabase 브라우저·서버 클라이언트와 공개 상품 조회, 카탈로그용 초기 SQL 마이그레이션.
- 별도 서버 설정으로 켜는 가상 상품 미리보기. 주문 입력은 메모리에만 보관합니다.

**아직 실제 주문을 접수하는 서비스가 아닙니다.** 실제 주문 생성·번호 발급·재고 차감,
회원·관리자 인증, 회원 배송지, 카운터 결제 처리, 재접수, 취소 및 엑셀 출력 묶음은 후속 구현 대상입니다.
로그인 화면은 준비 안내이며, 관리자 진입은 로그인 안내로 이동합니다. 인증 우회나 관리자 예시 데이터는 없습니다.

## 로컬 실행

Node.js 22, npm을 기준으로 시작했습니다. 의존성은 `package-lock.json`으로 고정합니다.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

`http://localhost:3000`에서 확인합니다. Supabase 설정이 없어도 홈과 준비 안내는 실행됩니다.
첫 로컬 설정 파일이 이미 있다면 덮어쓰지 말고 필요한 값만 편집하세요.

### 주문 화면 미리보기

`.env.local`에 아래 값을 설정한 뒤 개발 서버를 시작합니다.

```dotenv
ENABLE_ORDER_PREVIEW=true
```

- `/preview/product`: 일반 주문 입력
- `/preview/experience`: 체험 주문 입력
- 미리보기의 상품·가격·주소는 가상이며 실상품·운영 설정의 근거가 아닙니다.
- 주소 입력의 ‘미리보기용 가상 주소 채우기’는 외부 주소 서비스 없이 입력 흐름을 확인하기 위한 버튼입니다.
- 마지막 화면에서는 실제 접수가 비활성화됩니다. 가짜 주문번호를 발급하지 않습니다.
- 기본값은 꺼짐이며, 공개 배포에는 이 설정을 활성화하지 않습니다. 꺼진 상태의 미리보기 경로는 404입니다.
- 사용자 입력은 브라우저 로컬스토리지에 임시 저장되어 새로고침·재진입 후 복원됩니다. 실제 주문 DB 저장은 아직 구현하지 않았습니다.

### 같은 Wi-Fi에서 휴대폰으로 미리보기

```sh
ENABLE_ORDER_PREVIEW=true npm run dev -- --hostname 0.0.0.0 --port 3000
```

휴대폰을 Mac과 같은 Wi-Fi에 연결하고 `http://<Mac의 IPv4 주소>:3000/preview/product`로 접속합니다.
Mac의 Wi-Fi 주소는 `ipconfig getifaddr en0`으로 확인할 수 있습니다.
`next.config.ts`는 현재 컴퓨터의 정확한 IPv4 주소와 `127.0.0.1`을 `allowedDevOrigins`에 등록합니다.
바인딩만 `0.0.0.0`으로 바꾸면 Next.js의 개발용 HMR 연결은 차단될 수 있으며,
이 버전에서는 화면이 표시돼도 체크박스가 반응하지 않는 현상이 재현됐습니다.
네트워크를 바꿔 IP가 변경되면 개발 서버를 재시작하고 새 주소로 접속하세요.

### Supabase 연결 준비

아직 원격 Supabase 프로젝트를 만들거나 SQL을 적용하지 않았습니다.

1. 새 Supabase 프로젝트를 준비합니다.
2. `supabase/migrations/202609200001_catalog.sql`을 검토한 뒤 새 프로젝트에 적용합니다.
3. `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 설정합니다.
4. 개발 DB에 실제로 확인된 상품을 등록하고 `is_active`를 켜면 `/product`, `/experience`에서 조회합니다.

현재 마이그레이션은 상품과 배송 설정의 공개 읽기만 허용합니다. 브라우저에서 상품을 생성·수정하는 권한은 없습니다.
관리자 비밀 키를 `NEXT_PUBLIC_*` 변수나 저장소에 넣지 마세요. 예시 상품을 운영 DB에 자동 삽입하지 않습니다.
설정만 연결한다고 실주문·로그인이 활성화되지는 않습니다.

Supabase Auth 클라이언트는 연결 기반만 준비했습니다. 실제 인증 도입 시 세션 갱신 proxy,
카카오 callback, 역할 검증 및 관리자 ID 매핑을 함께 구현하고 검증해야 합니다.

## 구조

```text
src/app/                   라우트와 페이지 조합
src/components/ui/         공식 shadcn 기본 컴포넌트
src/components/forms/      재사용 입력 컴포넌트
src/components/site/       공통 사이트 구성
src/features/catalog/      상품 타입·조회·격리된 미리보기 자료
src/features/orders/       주문 폼·검증·계산·단계별 컴포넌트
src/lib/supabase/           서버·브라우저 연결 기반
supabase/migrations/       버전 관리되는 SQL
tests/                    단위·브라우저 검증
```

## 검증 명령

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

브라우저 검증은 포트 3100의 독립 테스트 서버와 가상 자료를 사용합니다.
이미 개발 서버를 실행 중이면 같은 프로젝트의 Next.js 잠금 충돌을 피하도록
`PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e`로 해당 서버를 사용할 수 있습니다.
이 경우 서버는 미리보기 활성화·Supabase 미설정 상태여야 전체 시나리오와 일치합니다.
macOS에서는 설치된 Google Chrome을 사용합니다. 다른 환경에서는 Playwright Chromium을 설치하거나
`PLAYWRIGHT_CHANNEL`을 지정하세요. 브라우저 테스트는 실제 카카오 로그인·Supabase·주소 서비스 연결을 검증하지 않습니다.

핵심 검증과 기존 코드 근거는 [개발 진행 기록](docs/implementation-status.md)을 참고하세요.


### 주문 임시 저장

주문 입력은 이 브라우저의 로컬스토리지에 자동으로 임시 저장됩니다. 새로고침이나 홈 이동 후 같은 주문 주소에 재진입하면 입력 중인 내용과 단계를 복원합니다. 일반/체험, 미리보기/실제 입력은 별도로 보관합니다. `localhost`와 LAN IP처럼 접속 주소가 다르면 저장 내용도 공유되지 않습니다.

‘처음부터 → 입력 초기화’로 현재 주문의 임시 저장을 지울 수 있습니다. 로그인 등 다른 저장 데이터는 지우지 않습니다. 공용 기기에서는 다음 손님이 사용하기 전에 수동 초기화를 실행합니다. 현재 프로토타입은 실제 주문 접수·인증이 미구현이며, 접수 성공 시 임시 저장 제거와 계정별 분리는 해당 연동에서 처리해야 합니다.

주문 중 헤더의 주문 안내는 모달로 열립니다. 주문 페이지에는 당겨서 새로고침을 억제하는 CSS도 적용되어 있지만 브라우저에 따라 차이가 있으므로 실제 데이터 보존은 저장·복원으로 처리합니다.
