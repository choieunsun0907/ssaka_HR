-- 부서 테이블
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  default_annual_leave INTEGER NOT NULL DEFAULT 15,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 직급 테이블
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 시스템 설정 테이블 (key-value)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 기본 부서 데이터
INSERT OR IGNORE INTO departments (name, description, default_annual_leave, sort_order) VALUES
  ('경영지원', '경영 및 기획 업무', 15, 1),
  ('개발팀',   '소프트웨어 개발',   15, 2),
  ('디자인팀', 'UI/UX 및 그래픽',  15, 3),
  ('마케팅팀', '마케팅 및 홍보',    15, 4),
  ('인사팀',   '인사 및 노무',      15, 5),
  ('영업팀',   '영업 및 고객관리',  15, 6);

-- 기본 직급 데이터
INSERT OR IGNORE INTO positions (name, level, sort_order) VALUES
  ('인턴',  1, 1),
  ('사원',  2, 2),
  ('주임',  3, 3),
  ('대리',  4, 4),
  ('과장',  5, 5),
  ('차장',  6, 6),
  ('부장',  7, 7),
  ('이사',  8, 8),
  ('선임',  4, 9);

-- 기본 시스템 설정
INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('default_annual_leave', '15', '전체 기본 연차 일수'),
  ('company_name',         '우리 회사', '회사명'),
  ('leave_auto_approve',   'false', '연차 자동 승인 여부');
