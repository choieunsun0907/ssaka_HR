-- 관리자 계정 (비밀번호: admin123)
INSERT OR IGNORE INTO users (employee_id, name, email, password, department, position, hire_date, phone, role, annual_leave_total)
VALUES ('EMP001', '김관리', 'admin@company.com', 'admin123', '경영지원', '이사', '2018-03-01', '010-1234-5678', 'admin', 15);

-- 일반 직원
INSERT OR IGNORE INTO users (employee_id, name, email, password, department, position, hire_date, phone, role, annual_leave_total)
VALUES ('EMP002', '이개발', 'dev1@company.com', 'pass123', '개발팀', '선임', '2020-05-15', '010-2345-6789', 'employee', 15);

INSERT OR IGNORE INTO users (employee_id, name, email, password, department, position, hire_date, phone, role, annual_leave_total)
VALUES ('EMP003', '박디자인', 'design1@company.com', 'pass123', '디자인팀', '주임', '2021-08-01', '010-3456-7890', 'employee', 15);

INSERT OR IGNORE INTO users (employee_id, name, email, password, department, position, hire_date, phone, role, annual_leave_total)
VALUES ('EMP004', '최마케팅', 'mkt1@company.com', 'pass123', '마케팅팀', '대리', '2022-01-10', '010-4567-8901', 'employee', 11);

INSERT OR IGNORE INTO users (employee_id, name, email, password, department, position, hire_date, phone, role, annual_leave_total)
VALUES ('EMP005', '정인사', 'hr1@company.com', 'pass123', '인사팀', '과장', '2019-06-20', '010-5678-9012', 'employee', 15);

-- 연차 샘플 데이터
INSERT OR IGNORE INTO leaves (user_id, leave_type, start_date, end_date, days, reason, status)
VALUES (2, '연차', '2026-04-10', '2026-04-10', 1, '개인 용무', 'approved');

INSERT OR IGNORE INTO leaves (user_id, leave_type, start_date, end_date, days, reason, status)
VALUES (2, '오전반차', '2026-05-02', '2026-05-02', 0.5, '병원 진료', 'approved');

INSERT OR IGNORE INTO leaves (user_id, leave_type, start_date, end_date, days, reason, status)
VALUES (3, '연차', '2026-05-08', '2026-05-09', 2, '가족 행사', 'pending');

INSERT OR IGNORE INTO leaves (user_id, leave_type, start_date, end_date, days, reason, status)
VALUES (4, '경조사', '2026-03-15', '2026-03-17', 3, '결혼', 'approved');

-- 공지사항 샘플
INSERT OR IGNORE INTO notices (author_id, title, content, is_pinned, view_count)
VALUES (1, '[공지] 2026년 여름 휴가 신청 안내', '안녕하세요. 2026년 여름 휴가 신청 기간을 안내드립니다.\n\n신청 기간: 2026년 6월 1일 ~ 6월 15일\n휴가 사용 기간: 2026년 7월 21일 ~ 8월 22일\n\n연차 관리 메뉴에서 신청해 주시기 바랍니다.', 1, 42);

INSERT OR IGNORE INTO notices (author_id, title, content, is_pinned, view_count)
VALUES (1, '[공지] 5월 전사 워크샵 일정 안내', '5월 전사 워크샵이 아래와 같이 진행됩니다.\n\n일시: 2026년 5월 28일(목) ~ 5월 29일(금)\n장소: 강원도 평창 리조트\n\n참여 여부를 5월 21일까지 인사팀에 알려주시기 바랍니다.', 0, 38);

INSERT OR IGNORE INTO notices (author_id, title, content, is_pinned, view_count)
VALUES (5, '[안내] 연차 사용 촉진 제도 안내', '고용노동부 지침에 따라 연차 사용 촉진 제도를 시행합니다.\n잔여 연차가 많은 직원분들께서는 적극적으로 연차를 활용해 주시기 바랍니다.', 0, 25);

-- 메신저 샘플
INSERT OR IGNORE INTO messages (sender_id, receiver_id, channel, content)
VALUES (1, NULL, 'general', '안녕하세요! 오늘부터 사내 메신저 서비스를 시작합니다 😊');

INSERT OR IGNORE INTO messages (sender_id, receiver_id, channel, content)
VALUES (2, NULL, 'general', '반갑습니다! 잘 부탁드려요.');

INSERT OR IGNORE INTO messages (sender_id, receiver_id, channel, content)
VALUES (2, 3, NULL, '박디자인님, 신규 랜딩페이지 시안 언제 공유해주실 수 있나요?');

INSERT OR IGNORE INTO messages (sender_id, receiver_id, channel, content)
VALUES (3, 2, NULL, '안녕하세요! 이번 주 금요일까지 공유해 드릴게요.');
