# 사내 HR 시스템

## 프로젝트 개요
- **이름**: 사내 HR 시스템 (HR Management System)
- **목적**: 중소기업을 위한 올인원 인사관리 플랫폼
- **주요 기능**: 인사관리, 연차관리, 공지게시판, 사내 메신저

## 핵심 기능

### 1. 인사 관리
- 직원 등록/수정/삭제 (관리자)
- 부서별 구성원 현황 조회
- 직원 상세 정보 및 연차 현황 확인

### 2. 연차 관리
- 연차 신청 (연차/오전반차/오후반차/경조사/병가)
- 관리자 승인/반려 처리
- 전체 직원 연차 현황 대시보드
- 잔여 연차 시각화 (프로그레스 바)

### 3. 공지게시판
- 공지 작성/수정/삭제 (관리자)
- 공지 상단 고정 기능
- 조회수 카운트
- 페이지네이션

### 4. 사내 메신저
- 채널 채팅 (전체/인사팀/개발팀/디자인팀/마케팅팀)
- 1:1 다이렉트 메시지
- 3초 폴링 방식 실시간 업데이트
- 읽지 않은 메시지 배지

## 계정 정보 (테스트)
| 이메일 | 비밀번호 | 역할 |
|--------|----------|------|
| admin@company.com | admin123 | 관리자 |
| dev1@company.com | pass123 | 일반직원 |
| design1@company.com | pass123 | 일반직원 |
| mkt1@company.com | pass123 | 일반직원 |
| hr1@company.com | pass123 | 일반직원 |

## API 엔드포인트

### 인증
- `POST /api/auth/login` - 로그인
- `POST /api/auth/logout` - 로그아웃
- `GET /api/auth/me` - 현재 사용자 정보

### 인사관리
- `GET /api/users` - 전체 직원 목록
- `GET /api/users/:id` - 직원 상세
- `POST /api/users` - 직원 추가 (관리자)
- `PUT /api/users/:id` - 직원 수정
- `DELETE /api/users/:id` - 직원 삭제 (관리자)

### 연차관리
- `GET /api/leaves` - 연차 목록
- `GET /api/leaves/stats` - 연차 통계
- `GET /api/leaves/all-stats` - 전체 직원 연차 현황 (관리자)
- `POST /api/leaves` - 연차 신청
- `PUT /api/leaves/:id/approve` - 승인/반려 (관리자)
- `DELETE /api/leaves/:id` - 연차 취소

### 공지게시판
- `GET /api/notices` - 공지 목록
- `GET /api/notices/:id` - 공지 상세
- `POST /api/notices` - 공지 작성 (관리자)
- `PUT /api/notices/:id` - 공지 수정 (관리자)
- `DELETE /api/notices/:id` - 공지 삭제 (관리자)

### 메신저
- `GET /api/messages/channel/:channel` - 채널 메시지
- `POST /api/messages/channel/:channel` - 채널 메시지 전송
- `GET /api/messages/dm/:userId` - DM 메시지
- `POST /api/messages/dm/:userId` - DM 전송
- `GET /api/messages/unread` - 안읽은 메시지 수
- `GET /api/messages/contacts` - DM 상대 목록

## 데이터 구조

### DB 테이블
- `users` - 구성원 정보 (사원번호, 이름, 이메일, 부서, 직급, 입사일, 역할)
- `leaves` - 연차 기록 (종류, 기간, 상태, 승인자)
- `notices` - 공지사항 (제목, 내용, 고정여부, 조회수)
- `messages` - 메신저 메시지 (채널/DM, 읽음여부)

### 스토리지
- **Cloudflare D1**: 모든 데이터 저장 (SQLite 기반)

## 기술 스택
- **Backend**: Hono (TypeScript) + Cloudflare Workers
- **Frontend**: Vanilla JS + Tailwind CSS + Font Awesome
- **Database**: Cloudflare D1 (SQLite)
- **배포**: Cloudflare Pages

## 개발 실행
```bash
# DB 마이그레이션 및 시드
npm run db:migrate:local
npm run db:seed

# 빌드
npm run build

# 서비스 시작
pm2 start ecosystem.config.cjs
```

## 미구현 기능 / 향후 개선 사항
- 비밀번호 해싱 (현재 평문 저장, bcrypt 적용 필요)
- JWT 기반 인증 (현재 단순 쿠키)
- 파일 첨부 기능 (공지사항, 메신저)
- 알림 시스템 (이메일/브라우저 알림)
- 모바일 반응형 최적화
- 연차 달력 뷰
- 부서별 통계 차트

## 배포 현황
- **플랫폼**: Cloudflare Pages
- **상태**: 🔧 개발 중 (로컬 실행)
- **최종 업데이트**: 2026-05-19
