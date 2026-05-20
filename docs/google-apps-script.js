/**
 * ================================================================
 *  Google Apps Script - 휴가 신청 폼 → HR 시스템 연동
 * ================================================================
 *
 *  [설치 방법]
 *  1. Google Forms 편집 화면 → 오른쪽 상단 점 3개 메뉴 → "스크립트 편집기"
 *  2. 기존 코드 전체 삭제 후 이 코드 붙여넣기
 *  3. 아래 HR_WEBHOOK_URL 을 실제 서버 주소로 변경
 *  4. 저장 (Ctrl+S)
 *  5. 왼쪽 시계 아이콘(트리거) → 트리거 추가
 *     - 실행할 함수: onFormSubmit
 *     - 이벤트 소스: 폼에서
 *     - 이벤트 유형: 양식 제출 시
 *  6. 저장 후 권한 허용
 */

// ================================================================
//  ★ 이 URL을 실제 HR 시스템 주소로 변경하세요 ★
// ================================================================
var HR_WEBHOOK_URL = 'https://3000-in6b92pa5orecyoghn11p-b9b802c4.sandbox.novita.ai/api/webhook/google-forms';

// 시크릿 키 (변경하지 마세요)
var WEBHOOK_SECRET = 'HR_GFORM_2025';


/**
 * 폼 제출 시 자동 실행되는 함수
 */
function onFormSubmit(e) {
  try {
    var responses = e.response.getItemResponses();

    // 응답 데이터 수집
    var data = {};
    for (var i = 0; i < responses.length; i++) {
      var title = responses[i].getItem().getTitle().trim();
      var answer = responses[i].getResponse();
      data[title] = answer;
    }

    Logger.log('폼 응답 수신: ' + JSON.stringify(data));

    // 필드 매핑 (구글 폼 질문 제목 → API 필드)
    var payload = {
      secret:     WEBHOOK_SECRET,
      name:       extractField(data, ['이름', 'Name', '성명']),
      leave_type: extractField(data, ['휴가 유형', '휴가유형', 'Leave Type']),
      start_date: extractField(data, ['휴가 시작일', '시작일', 'Start Date']),
      end_date:   extractField(data, ['휴가 종료일', '종료일', 'End Date']),
      half_day:   extractField(data, ['반차의 경우만 선택해 주세요.', '반차 선택', '반차']),
      reason:     extractField(data, ['사유', '휴가 사유', '신청 사유', 'Reason'])
    };

    // 종료일 없으면 시작일과 동일하게
    if (!payload.end_date) {
      payload.end_date = payload.start_date;
    }

    Logger.log('HR 시스템 전송: ' + JSON.stringify(payload));

    // HR 시스템으로 POST 전송
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(HR_WEBHOOK_URL, options);
    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();

    Logger.log('HR 응답 [' + statusCode + ']: ' + responseText);

    if (statusCode === 200) {
      var result = JSON.parse(responseText);
      if (result.success) {
        Logger.log('성공: ' + result.message);
      } else {
        Logger.log('경고 (직원 없음): ' + result.warning);
      }
    } else {
      Logger.log('HTTP 오류: ' + statusCode + ' / ' + responseText);
    }

  } catch (err) {
    Logger.log('스크립트 오류: ' + err.toString());
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
 * 연동 테스트 함수
 * - 편집기 상단 드롭다운에서 "testWebhook" 선택 후 ▶ 실행
 * - 팝업으로 성공/실패 결과 확인 가능
 */
function testWebhook() {
  var testPayload = {
    secret:     WEBHOOK_SECRET,
    name:       '엄태준',
    leave_type: '개인 사유로 인한 휴가',
    start_date: '2026-08-01',
    end_date:   '2026-08-01',
    half_day:   '',
    reason:     '[테스트]'
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(testPayload),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch(HR_WEBHOOK_URL, options);
    var statusCode = response.getResponseCode();
    var result = JSON.parse(response.getContentText());

    Logger.log('테스트 결과: ' + JSON.stringify(result));

    if (result.success) {
      Browser.msgBox('연동 성공!\n\n' + result.message
        + '\n\n휴가 유형: ' + result.data.leave_type
        + '\n기간: ' + result.data.start_date + ' ~ ' + result.data.end_date
        + '\n일수: ' + result.data.days + '일');
    } else {
      Browser.msgBox('응답은 받았으나 등록 실패:\n\n' + JSON.stringify(result));
    }
  } catch (err) {
    Browser.msgBox('오류 발생:\n\n' + err.toString()
      + '\n\n확인사항:\n1. HR_WEBHOOK_URL 이 올바른가요?\n2. 서버가 실행 중인가요?');
  }
}
