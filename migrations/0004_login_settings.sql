-- 로그인 설정 기본값 추가
INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('show_test_accounts',  'true',  '로그인 화면에 테스트 계정 빠른 로그인 버튼 표시 여부'),
  ('login_notice',        '',      '로그인 화면 하단 공지 문구'),
  ('pw_min_length',       '4',     '비밀번호 최소 길이'),
  ('session_timeout_min', '480',   '세션 자동 만료 시간(분), 0=만료 없음'),
  ('login_fail_max',      '0',     '로그인 실패 허용 횟수 (0=제한 없음)'),
  ('site_title',          '사내 HR 시스템', '브라우저 탭 및 로그인 화면 시스템 타이틀');
