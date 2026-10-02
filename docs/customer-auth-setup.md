# 카카오 고객·공용 태블릿 로그인 연결

이번 구현은 로그인·로그아웃, 세션 갱신, 비회원/카카오/태블릿 구분과 주문의 회원 연결까지입니다. 개인 회원의 주문 내역·저장 배송지 UI는 아직 제공하지 않습니다. 기존 주문 데이터의 회원 연결은 자동 추정하지 않습니다. 관리자 재접수는 기존처럼 원본 링크를 보존하고, 새 주문의 고객 회원 연결을 자동 복사하지 않습니다(후속 정책 확인 항목).

## 1. DB 적용

기존 마이그레이션 3개를 적용한 프로젝트의 Supabase SQL Editor에서 `supabase/migrations/202609290001_customer_auth.sql` 전체를 실행합니다. 기존 주문·상품을 삭제하지 않습니다. 새 태블릿 계정 표는 `private` 스키마에 만들고 RLS를 켜며, 역할 조회와 계정 발급 함수는 서버 서비스 키로만 호출할 수 있습니다.

앱만 업데이트하고 이 SQL을 적용하지 않으면 주문 접수가 실패하므로, SQL을 먼저 적용한 뒤 앱을 업데이트합니다. 서비스 비밀 키는 이미 있는 `.env.local` 설정을 사용하며 카카오 키를 여기에 추가하지 않습니다.

## 2. 카카오디벨로퍼스

1. 사용할 앱을 선택합니다. 기존에 이 서비스용 앱을 사용 중이라면 그 앱을 사용합니다.
2. **카카오 로그인 → 일반 → 사용 설정**을 ON으로 설정합니다.
3. **앱 → 플랫폼 키 → REST API 키**에서 REST API 키와 **카카오 로그인 Client Secret**을 확인하고 Client Secret을 활성화합니다. JavaScript 키나 Admin 키를 대신 넣지 않습니다.
4. 같은 REST API 키의 **카카오 로그인 Redirect URI**에 아래 주소를 등록합니다. 정확한 값은 Supabase의 Kakao 설정에 표시되는 Callback URL을 복사합니다.

   ```text
   https://<Supabase 프로젝트 참조>.supabase.co/auth/v1/callback
   ```

5. **카카오 로그인 → 동의항목**에서 닉네임(`profile_nickname`) 사용을 설정합니다. 현재 코드는 이 항목만 요청하며, 보내는 사람의 이름·전화번호는 기존 주문 화면에서 직접 입력합니다. 이메일·전화번호·배송지를 카카오에서 받는 구현이 아닙니다.

   Supabase의 `options.scopes`는 기본 동의 항목에 추가하는 옵션입니다. 닉네임만 요청하기 위해 `options.queryParams.scope = "profile_nickname"`으로 실제 카카오 요청 범위를 지정합니다. `KOE205`에 `account_email,profile_image`가 표시되면 이 수정이 반영된 서버에서 로그인 버튼을 다시 누릅니다. 이메일·사진 동의를 추가로 켤 필요는 없습니다.

## 3. Supabase Authentication

**Sign In / Providers → Kakao**에서:

- Kakao 활성화
- Client ID: 카카오 **REST API 키**
- Client Secret: 카카오 **카카오 로그인 Client Secret**
- **Allow users without an email**: ON (현재 이메일 동의를 요청하지 않음)

키·비밀번호는 대화, 문서, Git에 붙여넣지 않습니다. 위 설정에 직접 저장합니다.

**URL Configuration**에서:

- Site URL: 배포 후 실제 서비스 주소. 로컬 개발 단계에서는 `http://localhost:3000`.
- Redirect URLs: 로그인에 사용할 사이트의 `/auth/callback` 주소와 `next` 쿼리를 허용합니다. 로컬 확인 시 아래 두 항목을 추가합니다.

  ```text
  http://localhost:3000/auth/callback
  http://localhost:3000/auth/callback?next=*
  ```

- 휴대폰에서 LAN 주소로 테스트한다면 `http://<개발 PC IP>:3000/auth/callback`과 `http://<개발 PC IP>:3000/auth/callback?next=*`도 별도로 등록합니다. IP가 바뀌면 갱신합니다.
- 배포 시 `https://<실제 도메인>/auth/callback` 및 해당 주소의 `?next=*`를 추가합니다. 사이트 전체를 허용하는 광범위한 와일드카드는 필요 없습니다.
- 로그인 시작과 콜백은 같은 브라우저·같은 호스트를 사용해야 PKCE 쿠키가 유지됩니다. `localhost`, LAN IP, 운영 도메인을 왕복 중 섞지 않습니다.
- 태블릿·관리자 비밀번호 인증에 Email provider가 필요합니다. 고객용 이메일 가입/로그인 UI는 제공하지 않으며, 별도 이메일 계정을 임의로 만들더라도 고객 권한을 부여하지 않습니다. 신규 카카오 가입을 막는 전역 회원가입 차단 설정은 켜지 않습니다.

## 4. 태블릿 계정 발급

프로젝트 디렉터리에서 `.env.local`의 서버 연결값을 준비한 뒤:

```sh
npm run tablet:create
```

태블릿마다 `tablet-01`, `tablet-02`처럼 다른 ID와 비밀번호(12자 이상)를 입력합니다. 공개 가입 경로는 없으며 비밀번호는 터미널에서 숨김 입력합니다. 이미 사용 중인 ID를 덮어쓰지 않습니다. 내부 인증 이메일은 발송 불가 주소이며 실제 이메일 계정을 만들 필요는 없습니다.

태블릿 브라우저에서 `/tablet-login`에 직접 접속해 로그인합니다. 고객 화면에 태블릿 로그인 링크는 표시하지 않습니다. 이후 개인 회원과 동일한 주문 화면을 사용하며, 다음 주문 시작/입력 초기화로 로그인 상태를 지우지 않습니다. 세션이 만료되면 다시 로그인해야 합니다. 작성 중 자동 주문 초기화 타이머는 없습니다. 주문 완료 화면은 60초 후 메인으로 이동하며 태블릿 로그인은 유지합니다.

태블릿 사용을 중지할 필요가 있으면 SQL Editor에서 대상 ID를 확인한 뒤 아래처럼 변경할 수 있습니다. 이후 서버가 로그인·접수를 거절합니다(기존 접수 데이터는 보존).

```sql
update private.tablet_accounts set enabled = false where username = 'tablet-01';
```

## 5. 실제 연결 확인

1. `/login`에서 카카오 로그인 → 일반/체험 주문 진입을 확인합니다. 첫 로그인은 Supabase Auth에 고객 계정을 생성합니다.
2. 테스트 주문을 접수하고 관리자 상세에서 `접수 구분: 카카오 회원`인지 확인합니다.
3. `/tablet-login`에서 발급한 계정으로 로그인하고 접수 후 `공용 태블릿 회원`인지 확인합니다.
4. 새로고침 후 세션이 유지되는지, 고객/태블릿 계정으로 `/namu-admin/orders`에 접근하면 관리자 로그인을 요구하는지 확인합니다.
5. 로그아웃 후 비회원 주문이 계속 되는지 확인합니다. 만료된 회원 세션은 비회원으로 조용히 전환하지 않고 재로그인을 안내합니다.
6. 실패한 접수의 요청 ID는 인증 오류에서도 보존합니다. 이미 접수된 요청은 처음 접수한 계정에서만 같은 결과를 확인할 수 있습니다.

격리된 테스트의 OAuth 제공자는 테스트용 모의 서버입니다. 실제 카카오 계정 동의 화면과 Supabase의 외부 OAuth 연결은 위 설정을 완료한 뒤 사용자 브라우저에서 확인해야 합니다.

## 공식 문서·리소스

- [Supabase Kakao 로그인](https://supabase.com/docs/guides/auth/social-login/auth-kakao)
- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [카카오 로그인 디자인 가이드](https://developers.kakao.com/docs/ko/kakaologin/design-guide)
- `public/auth/kakao-login.svg`: [카카오 공식 로그인 리소스](https://developers.kakao.com/tool/resource/login)의 완성형 국문 버튼을 원본 그대로 사용합니다.
