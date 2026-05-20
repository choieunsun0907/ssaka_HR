-- 회계연도 테이블
-- fiscal_year: 연도 (예: 2024)
-- start_month: 회계연도 시작월 (1~12, 예: 1 = 1월, 4 = 4월)
-- default_days: 해당 회계연도 기본 연차 일수
-- is_active: 현재 운영 중인 회계연도 여부 (1개만 active)
-- auto_grant: 회계연도 시작 시 자동 부여 여부
-- note: 메모
CREATE TABLE IF NOT EXISTS fiscal_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year INTEGER NOT NULL UNIQUE,   -- 예) 2024, 2025
  start_month INTEGER NOT NULL DEFAULT 1, -- 회계 시작월 (1~12)
  end_month   INTEGER NOT NULL DEFAULT 12,-- 회계 종료월 (계산 편의)
  default_days INTEGER NOT NULL DEFAULT 15,
  is_active    INTEGER NOT NULL DEFAULT 0, -- 1 = 현재 활성 회계연도
  auto_grant   INTEGER NOT NULL DEFAULT 0, -- 1 = 자동 부여
  note         TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 개인별 연차 부여 내역 테이블
-- 회계연도별로 직원 각각에게 실제 부여된 연차 기록
CREATE TABLE IF NOT EXISTS leave_grants (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL,
  fiscal_year  INTEGER NOT NULL,  -- fiscal_years.fiscal_year 참조
  granted_days REAL    NOT NULL DEFAULT 15,
  used_days    REAL    NOT NULL DEFAULT 0,
  note         TEXT,
  granted_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, fiscal_year),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 현재 연도를 기본 활성 회계연도로 추가 (없을 경우에만)
INSERT OR IGNORE INTO fiscal_years (fiscal_year, start_month, end_month, default_days, is_active, note)
VALUES (
  CAST(strftime('%Y', 'now') AS INTEGER),
  1, 12, 15, 1,
  '기본 회계연도'
);

-- settings에 회계연도 시작월 키 추가
INSERT OR IGNORE INTO settings (key, value, description)
VALUES ('fiscal_start_month', '1', '회계연도 기본 시작월 (1~12)');

CREATE INDEX IF NOT EXISTS idx_leave_grants_user_fiscal ON leave_grants(user_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_leave_grants_fiscal ON leave_grants(fiscal_year);
