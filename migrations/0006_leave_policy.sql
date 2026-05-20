-- 연차 자동 부여 정책 설정값 추가
-- grant_policy: 'fiscal' = 회계연도 기준, 'hire_date' = 입사일 기준
INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('leave_grant_policy',       'fiscal',   '연차 부여 기준: fiscal=회계연도, hire_date=입사일'),
  ('leave_base_days',          '15',       '기준 연차일수 (입사일 기준일 때 만 1년 이상 기본값)'),
  ('leave_max_days',           '25',       '최대 연차일수'),
  ('leave_probation_days',     '11',       '입사 첫해 월별 부여 일수 (1년 미만, 매월 1일씩 최대 11일)'),
  ('leave_tenure_increment',   '1',        '근속 추가 일수 (근속 n년마다 1일 추가)'),
  ('leave_tenure_unit',        '2',        '근속 추가 기준 년수 (예: 2년마다 1일)'),
  ('leave_auto_apply',         'false',    '자동 부여 실행 여부 (true=회계연도 시작 시 자동 실행)');
