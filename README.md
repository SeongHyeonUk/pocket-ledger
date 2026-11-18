# Pocket Ledger

Google 계정으로 개인 가계부를 열고 거래, 예산, 구독, 저축 목표를 관리하는 한국어 PWA입니다. 금액은 정수 원 단위로 처리하며, 날짜와 주기는 서울 시간을 기준으로 합니다.

[Pocket Ledger 열기](https://pocket-ledger-three-amber.vercel.app/)

## 로컬 실행

Node.js 22.12 이상과 pnpm을 사용합니다. 로컬 환경 파일은 `.env.example`을 `.env.local`로 복사한 뒤 Firebase 웹 앱의 구성값을 채우세요.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

로컬 Google 로그인이 필요할 때는 Firebase Authentication 설정의 승인된 도메인에 `localhost`를 추가하고, `VITE_FIREBASE_AUTH_DOMAIN`에는 Firebase 기본 인증 도메인을 입력하세요. 로컬에서는 사용자 클릭으로 열린 Google 팝업을 사용합니다.

## 예산과 거래

- 기본 기간은 매월 10일부터 다음 달 9일까지입니다. 시작일이 말일을 벗어나면 그 달의 마지막 날을 사용합니다.
- 주간 자유 지출은 기간 첫날부터 7일 단위로 배정합니다. 끝에 남은 짧은 주에도 주간 한도를 배정합니다.
- 설정 변경은 화면에 표시된 다음 적용일부터 효력이 생깁니다. 시작일이 바뀌면 전환 기간이 짧아질 수 있습니다.
- 계획된 용돈, 저축 목표, 구독료는 거래를 자동 생성하지 않습니다. 구독 결제를 등록할 때 거래에서 해당 구독을 선택할 수 있습니다.
- 가용 현금은 기간 내 실제 수입에서 소비와 저축 이체를 뺀 값입니다. 실제 잔여액은 가용 현금에서 아직 쓰지 않은 항목별 배정액을 차감합니다. 기초 통장 잔액은 입력하지 않습니다.
- 구독료는 결제 기준일에 맞춰 재계산합니다. 결제일을 입력하지 않은 월간 구독은 결제일 미정으로 한 건을 배정합니다. 결제일이 있는 항목은 변경 시점 전후의 일정을 각각 적용합니다.

## 동기화와 백업

- Firestore 리스너는 기간별 거래와 해당 화면에 필요한 기록을 구독합니다. 동기화 표시는 서버 스냅샷과 보류 중인 쓰기 상태를 사용합니다.
- 저장 버전이 다른 기기에 의해 바뀌면 서버가 오래된 수정을 거절합니다. 최신 기록을 다시 연 뒤 필요한 값을 적용하세요.
- 개인 기기에서만 오프라인 저장을 켜세요. 다시 접속하면 대기 중인 변경이 동기화됩니다. 저장이 보류 중인 탭을 닫기 전에 연결 상태를 확인하세요. 브라우저가 최초 실행 시 거래를 한 번 읽어야 오프라인에서 해당 범위를 볼 수 있습니다.
- 계정별 경로로 화면을 새로 구독합니다. 오프라인 저장을 켜면 동일 브라우저의 사이트 저장소에 기록이 남습니다. 공유 기기로 전환할 때는 동기화 완료 후 브라우저의 사이트 데이터를 삭제하세요.
- 설정에서 JSON과 UTF-8 BOM CSV를 내보낼 수 있습니다. JSON 복원은 버전과 문서 내용을 확인하고, 같은 ID를 건너뜁니다. 큰 백업은 200개 문서씩 원자적으로 반영하므로 중간에 실패해도 같은 파일로 재시도할 수 있습니다.

## 검증

```sh
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm test:rules
```

E2E에는 Chrome이 필요합니다. Firestore Emulator에는 Java 21이 필요하며, 규칙 테스트는 데모 프로젝트만 사용합니다.

로그인 이후 브라우저 테스트는 데모 Firebase 환경에서 실행합니다. `pnpm exec vite build --mode emulator`로 빌드하고 `LEDGER_EMULATOR=1`을 설정한 셸에서 `pnpm exec firebase emulators:exec --only auth,firestore --project demo-pocket-ledger "pnpm test:e2e"`를 실행하세요. 실제 배포에는 `pnpm build`를 사용합니다.

## 배포

1. Firebase Spark 프로젝트에 웹 앱, Google 로그인 및 Cloud Firestore를 설정합니다. 에뮬레이터를 통과한 `firestore.rules`를 게시합니다.
2. GitHub의 `main` 브랜치를 Vercel Hobby에 연결합니다. `vercel.json`의 Vite 빌드와 SPA 경로가 적용됩니다.
3. 프로덕션 환경에 웹 앱 구성값을 입력합니다. `VITE_FIREBASE_AUTH_DOMAIN`에는 Firebase 기본 인증 호스트를, `VITE_FIREBASE_PUBLIC_HOST`에는 Vercel 프로덕션 호스트 이름을 입력합니다. 이 Vercel 호스트를 Firebase Authentication의 승인된 도메인에도 추가합니다.
4. Firebase에서 사용하는 Google OAuth 웹 클라이언트의 승인된 리디렉션 URI에 `https://배포호스트/__/auth/handler`를 등록합니다. Vercel의 인증 경로는 Firebase 프로젝트 기본 인증 호스트로 프록시됩니다.
5. PC 및 Android에서 로그인과 같은 계정의 실시간 거래 변경을 확인합니다. Android Chrome에서 설치 후 오프라인 보류 및 온라인 복구를 확인합니다. iOS에서는 Safari의 공유 메뉴에서 홈 화면에 추가할 수 있습니다.
