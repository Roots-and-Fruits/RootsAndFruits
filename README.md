# 나무와열매 · RootsAndFruits

Next.js + Supabase로 새로 구성하는 농장 택배 주문 서비스입니다.
개발 기준은 [AGENTS.md](AGENTS.md)와 [확정 요구사항](docs/requirements.md)입니다.

## 현재 구현 범위

- 일반·체험 주문, 여러 배송지, 통합 수정, 임시 저장, 수동 초기화.
- 배송지별 묶음 할인과 비회원 실제 접수·주문번호·완료 화면.
- 관리자 ID·비밀번호 로그인, 카운터 결제 기록, 결제 전 전체 취소, 전체 재접수.
- 상품·재고·할인 대상·설정 관리, 배송 목록과 운영 메모.
- 송장 엑셀 출력 묶음·동일 파일 재다운로드·발송 완료 처리.
- DB 마이그레이션, 서버 권한 검사와 RLS, 중복 요청 방지 및 재고 이력.

**실제 사용 전 Supabase 연결·마이그레이션·관리자 계정 준비가 필요합니다.**
원격 연결과 검증 상태는 [구현 기록](docs/implementation-status.md)의 최신 절을 확인하세요.
카카오 로그인·태블릿 ID/비밀번호 인증 및 주문 회원 연결 코드를 구현했습니다. 추가 SQL과 외부 인증 설정이 필요하며, 회원 주문 내역·저장 배송지 화면은 후속 범위입니다.

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
- 사용자 입력은 브라우저 로컬스토리지에 임시 저장되어 새로고침·재진입 후 복원됩니다. 미리보기에서는 실제 주문을 저장하지 않습니다.

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

[설정 안내](docs/supabase-setup.md)에 따라 새 프로젝트, SQL, 환경값, 관리자 계정 두 개를 준비합니다.
관리자는 `/namu-admin/login`, 실제 주문은 `/product` 또는 `/experience`입니다.
고객 카카오 로그인은 `/login`, 태블릿 전용 로그인은 `/tablet-login`입니다. 추가 SQL·외부 인증 설정 및 `npm run tablet:create` 사용법은 [회원 인증 설정](docs/customer-auth-setup.md)을 참고하세요.
서비스 비밀 키를 `NEXT_PUBLIC_*` 변수나 저장소에 넣지 마세요. 가상 상품은 운영 DB에 자동 등록하지 않습니다.

### 링크 공유 미리보기

- 카카오톡 등의 Open Graph와 X의 큰 이미지 카드에 공통 브랜드 이미지·제목·설명을 제공합니다.
- 기준 주소는 `https://www.2180.co.kr`입니다. 다른 도메인에서 운영할 경우 `SITE_URL`에 프로토콜을 포함한 주소를 설정하고 다시 빌드합니다.
- `public/brand/share-card.png`는 1200×630 공유 이미지입니다. 정적 import로 이미지 내용에 따른 해시 주소를 사용합니다. `src/app/layout.tsx`에서 제목·설명·이미지 정보를 관리합니다.
- 이미지 디자인이나 로고를 변경하면 `node scripts/generate-share-image.mjs`로 다시 출력합니다. 로컬 Chrome(macOS) 또는 Playwright Chromium과 한글 글꼴이 필요하며, PNG를 저장소에 포함하므로 배포 서버에는 이미지 생성 도구가 필요 없습니다.
- 배포 후 공유할 URL의 이미지 응답을 확인합니다. 카카오톡에 이전 미리보기가 남아 있다면 [카카오 공유 디버거](https://developers.kakao.com/docs/ko/tool/common)에서 해당 URL의 OG 정보를 확인하고 초기화할 수 있습니다.

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
npm run test:db
npm run test:admin-ui
```

브라우저 검증은 포트 3100의 독립 테스트 서버와 가상 자료를 사용합니다.
이미 개발 서버를 실행 중이면 같은 프로젝트의 Next.js 잠금 충돌을 피하도록
`PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e`로 해당 서버를 사용할 수 있습니다.
이 경우 서버는 미리보기 활성화·Supabase 미설정 상태여야 전체 시나리오와 일치합니다.
macOS에서는 설치된 Google Chrome을 사용합니다. 다른 환경에서는 Playwright Chromium을 설치하거나
`PLAYWRIGHT_CHANNEL`을 지정하세요. 브라우저 테스트는 실제 카카오 로그인·Supabase·주소 서비스 연결을 검증하지 않습니다.

핵심 검증과 기존 코드 근거는 [개발 진행 기록](docs/implementation-status.md)을 참고하세요.


### 주문 임시 저장

주문 입력은 이 브라우저의 로컬스토리지에 자동으로 임시 저장됩니다. 새로고침이나 같은 주문 주소 직접 재진입 시 내용과 단계를 복원합니다. 홈의 주문 버튼으로 들어오면 해당 종류의 작성 내용이 있을 때 ‘이어 작성하기 / 처음부터’를 선택합니다. 개인 회원·태블릿 회원·비회원 모두 동일하며, 내용이 없으면 바로 시작합니다. 선택 전 이전 개인정보를 표시하지 않고 모달을 닫으면 내용을 유지한 채 홈으로 돌아갑니다. 일반/체험, 미리보기/실제 입력은 별도로 보관합니다. `localhost`와 LAN IP처럼 접속 주소가 다르면 저장 내용도 공유되지 않습니다.

홈 진입 모달의 ‘처음부터’ 또는 주문 중 ‘처음부터 → 입력 초기화’로 현재 주문의 임시 저장을 지울 수 있습니다. 로그인과 다른 종류의 주문 등 다른 저장 데이터는 지우지 않습니다. 공용 기기에서 다음 손님은 ‘처음부터’를 선택합니다. 접수 성공 시 주문 초안을 지웁니다. 응답이 끊긴 접수 요청은 홈에서 다시 들어와도 초기화하지 않고 같은 요청으로 재확인한 뒤 다음 주문을 시작합니다.

주문 중 헤더의 주문 안내는 모달로 열립니다. 주문 페이지에는 당겨서 새로고침을 억제하는 CSS도 적용되어 있지만 브라우저에 따라 차이가 있으므로 실제 데이터 보존은 저장·복원으로 처리합니다.

### 관리자 검증 환경

`npm run test:db`는 PGlite(Postgres)에서 실제 마이그레이션과 SQL 함수를 검증합니다.
`npm run test:admin-ui`는 소스를 임시 디렉터리에 복사해 포트 3110·3111에서 별도 Next.js와 테스트용 Auth/PostgREST 응답 서버를 실행합니다. 업무 RPC는 PGlite의 실제 SQL을 사용합니다. 관리자 페이지에 인증 우회 경로를 추가하지 않으며 원격 Supabase 인증 검증을 대신하지 않습니다. 기존 3000번 개발 서버와 `.env.local`은 변경하지 않습니다.
ExcelJS의 UUID 하위 의존성은 호환되는 수정 버전으로 고정하며 엑셀 생성·읽기 테스트로 확인합니다.

## 주문 문자 발송

SOLAPI 문자 연동은 [설정 안내](docs/sms-setup.md)를 따른다. 신규 마이그레이션 적용, 서버 환경변수 설정, 관리자 **문자 내역 → 문자 켜기**가 필요하다. 기본은 꺼짐이며 키 미설정 상태에서는 실제 문자를 보내지 않는다. 접수·배송지별 발송 안내 모두 보내는 분에게 전송한다.
