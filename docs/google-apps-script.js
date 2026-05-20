/**
 * ═══════════════════════════════════════════════════════════════
 *  Google Apps Script - 휴가 신청 폼 → HR 시스템 연동
 * ═══════════════════════════════════════════════════════════════
 *
 *  [설치 방법]
 *  1. Google Forms 편집 화면 → 오른쪽 상단 점 3개 메뉴 → "스크립트 편집기"
 *  2. 이 코드 전체를 붙여넣기
 *  3. HR_WEBHOOK_URL 을 실제 배포 URL로 변경
 *  4. 상단 메뉴 "트리거" → "트리거 추가"
 *     - 실행할 함수: onFormSubmit
 *     - 이벤트 소스: 폼에서
 *     - 이벤트 유형: 양식 제출 시
 *  5. 저장 후 권한 허용
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ★ 이 URL을 실제 배포된 HR 시스템 URL로 변경하세요 ★
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const HR_WEBHOOK_URL = 'https://YOUR-PROJECT.pages.dev/api/webhook/google-forms';
// 샌드박스 개발 환경 URL (테스트용):
// const HR_WEBHOOK_URL = 'https://3000-in6b92pa5orecyoghn11p-b9b802c4.sandbox.novita.ai/api/webhook/google-forms';

// 시크릿 키 (webhook.ts 와 동일하게 유지)
const WEBHOOK_SECRET = 'HR_GFORM_2025';

/**
 * 폼 제출 시 자동으로 실행되는 트리거 함수
 * @param {Object} e - 폼 제출 이벤트 객체
 */
function onFormSubmit(e) {
  try {
    const responses = e.response.getItemResponses();

    // ── 응답 데이터 수집 ─────────────────────────────────────
    const data = {};
    responses.forEach(function(r) {
      const title = r.getItem().getTitle().trim();
      const answer = r.getResponse();
      data[title] = answer;
    });

    Logger.log('폼 응답 수신: ' + JSON.stringify(data));

    // ── 필드 매핑 (구글 폼 질문 제목 → API 필드) ─────────────
    // ※ 폼의 질문 제목을 그대로 사용합니다. 변경 시 아래도 수정 필요.
    const payload = {
      secret:     WEBHOOK_SECRET,
      name:       extractField(data, ['이름', 'Name', '성명']),
      leave_type: extractField(data, ['휴가 유형', '휴가유형', 'Leave Type']),
      start_date: extractField(data, ['휴가 시작일', '시작일', 'Start Date']),
      end_date:   extractField(data, ['휴가 종료일', '종료일', 'End Date']),
      half_day:   extractField(data, ['반차의 경우만 선택해 주세요.', '반차 선택', '반차']),
      reason:     extractField(data, ['사유', '휴가 사유', '신청 사유', 'Reason']) || '',
    };

    // 종료일 없으면 시작일과 동일하게
    if (!payload.end_date) {
      payload.end_date = payload.start_date;
    }

    Logger.log('HR 시스템 전송 데이터: ' + JSON.stringify(payload));

    // ── HR 시스템으로 POST 전송 ───────────────────────────────
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,  // HTTP 오류도 응답으로 받기
    };

    const response = UrlFetchApp.fetch(HR_WEBHOOK_URL, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    Logger.log('HR 시스템 응답 [' + statusCode + ']: ' + responseText);

    // ── 결과 처리 ─────────────────────────────────────────────
    if (statusCode === 200) {
      const result = JSON.parse(responseText);
      if (result.success) {
        Logger.log('✅ 연차 신청 등록 성공: ' + result.message);
        // 선택사항: 신청자에게 이메일 알림 발송
        // sendConfirmationEmail(payload.name, result.data);
      } else {
        Logger.log('⚠️ 등록 실패 (직원 없음): ' + result.warning);
        // 선택사항: 관리자에게 알림 이메일
        // notifyAdmin('직원 없음', payload, result.warning);
      }
    } else {
      Logger.log('❌ HTTP 오류: ' + statusCode + ' - ' + responseText);
    }

  } catch (err) {
    Logger.log('❌ 스크립트 오류: ' + err.toString());
    // 오류가 발생해도 폼 제출은 정상 처리됨
  }
}

/**
 * 여러 키 후보 중 값이 있는 첫 번째 필드를 반환
 */
function extractField(data, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (data[keys[i]] !== undefined && data[keys[i]] !== '') {
      return String(data[keys[i]]).trim();
    }
  }
  return '';
}

/**
 * (선택사항) 신청자에게 확인 이메일 발송
 * - Gmail 권한 필요
 */
function sendConfirmationEmail(name, leaveData) {
  // 이메일 주소를 알고 있는 경우에만 사용
  // const email = getUserEmail(name); // 별도 시트에서 이메일 조회
  // if (!email) return;
  //
  // MailApp.sendEmail({
  //   to: email,
  //   subject: '[HR] 휴가 신청이 접수되었습니다',
  //   body: name + '님의 ' + leaveData.leave_type + ' 신청(' +
  //         leaveData.start_date + '~' + leaveData.end_date + ', ' +
  //         leaveData.days + '일)이 접수되어 관리자 승인을 기다리고 있습니다.',
  // });
}

/**
 * 수동 테스트용 함수 - 스크립트 편집기에서 직접 실행하여 연동 확인
 * 실행 방법: 함수 선택 드롭다운에서 'testWebhook' 선택 후 ▶ 실행
 */
function testWebhook() {
  const testPayload = {
    secret:     WEBHOOK_SECRET,
    name:       '엄태준',          // ← 실제 시스템에 등록된 직원 이름으로 변경
    leave_type: '개인 사유로 인한 휴가',
    start_date: '2026-08-01',
    end_date:   '2026-08-01',
    half_day:   '',
    reason:     '[Apps Script 테스트]',
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(testPayload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(HR_WEBHOOK_URL, options);
    const statusCode = response.getResponseCode();
    const result = JSON.parse(response.getContentText());
    Logger.log('테스트 결과 [' + statusCode + ']: ' + JSON.stringify(result, null, 2));
    if (result.success) {
      Browser.msgBox('✅ 연동 성공!\n\n' + result.message +
        '\n\nleave_id: ' + result.data.leave_id +
        '\n휴가 유형: ' + result.data.leave_type +
        '\n기간: ' + result.data.start_date + ' ~ ' + result.data.end_date +
        '\n일수: ' + result.data.days + '일');
    } else {
      Browser.msgBox('⚠️ 응답 수신 성공이나 등록 실패:\n\n' + JSON.stringify(result));
    }
  } catch (err) {
    Browser.msgBox('❌ 오류 발생:\n\n' + err.toString() +
      '\n\n[확인사항]\n1. HR_WEBHOOK_URL 이 올바른가요?\n2. 서버가 실행 중인가요?');
  }
}
