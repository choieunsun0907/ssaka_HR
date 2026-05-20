/**
 * ================================================================
 *  Google Apps Script - 휴가 신청 폼 → HR 시스템 연동
 *  (var 전용 버전 - const/let 사용 안 함)
 * ================================================================
 */

// ★ HR 시스템 Webhook URL
var HR_WEBHOOK_URL = 'https://3000-in6b92pa5orecyoghn11p-b9b802c4.sandbox.novita.ai/api/webhook/google-forms';

// 시크릿 키
var WEBHOOK_SECRET = 'HR_GFORM_2025';


/**
 * 폼 제출 시 자동 실행 (트리거 등록 필요)
 */
function onFormSubmit(e) {
  try {
    var responses = e.response.getItemResponses();

    // 모든 응답 수집
    var data = {};
    for (var i = 0; i < responses.length; i++) {
      var title = responses[i].getItem().getTitle().trim();
      var answer = responses[i].getResponse();
      data[title] = answer;
      Logger.log('필드: [' + title + '] = ' + answer);
    }

    // HR 시스템으로 전송할 데이터 구성
    var payload = {
      secret:     WEBHOOK_SECRET,
      name:       extractField(data, ['이름', 'Name', '성명']),
      leave_type: extractField(data, ['휴가 유형', '휴가유형', 'Leave Type']),
      start_date: extractField(data, ['휴가 시작일', '시작일', 'Start Date']),
      end_date:   extractField(data, ['휴가 종료일', '종료일', 'End Date']),
      half_day:   extractField(data, ['반차의 경우만 선택해 주세요.', '반차 선택', '반차']),
      reason:     extractField(data, ['사유', '휴가 사유', '신청 사유', 'Reason'])
    };

    // 종료일 없으면 시작일로 대체
    if (!payload.end_date) {
      payload.end_date = payload.start_date;
    }

    Logger.log('전송 데이터: ' + JSON.stringify(payload));

    // POST 전송
    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(HR_WEBHOOK_URL, options);
    var statusCode = response.getResponseCode();
    var responseText = response.getContentText();

    Logger.log('응답 [' + statusCode + ']: ' + responseText);

    if (statusCode === 200) {
      var result = JSON.parse(responseText);
      if (result.success) {
        Logger.log('성공: ' + result.message);
      } else {
        Logger.log('경고: ' + JSON.stringify(result));
      }
    } else {
      Logger.log('HTTP 오류: ' + statusCode);
    }

  } catch (err) {
    Logger.log('오류: ' + err.toString());
  }
}


/**
 * 여러 키 후보 중 값이 있는 첫 번째 필드 반환
 */
function extractField(data, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (data[keys[i]] !== undefined && data[keys[i]] !== null && data[keys[i]] !== '') {
      return String(data[keys[i]]).trim();
    }
  }
  return '';
}


/**
 * ★★★ 폼의 실제 질문 제목을 확인하는 함수 ★★★
 * - 편집기에서 이 함수를 직접 실행하면
 *   Logger(실행 로그)에 모든 질문 제목이 출력됩니다
 * - 실행 방법: 드롭다운에서 "checkFormFields" 선택 후 ▶ 실행
 */
function checkFormFields() {
  var form = FormApp.getActiveForm();
  var items = form.getItems();
  Logger.log('=== 폼 질문 목록 (' + items.length + '개) ===');
  for (var i = 0; i < items.length; i++) {
    Logger.log('[' + i + '] 제목: "' + items[i].getTitle() + '" / 타입: ' + items[i].getType());
  }
  Logger.log('위 제목들을 google-apps-script.js 의 extractField 배열과 맞춰주세요.');
}


/**
 * 수동 연동 테스트 함수
 * - 드롭다운에서 "testWebhook" 선택 후 ▶ 실행
 * - 팝업으로 성공/실패 결과 확인
 */
function testWebhook() {
  var testPayload = {
    secret:     WEBHOOK_SECRET,
    name:       '엄태준',
    leave_type: '개인 사유로 인한 휴가',
    start_date: '2026-08-01',
    end_date:   '2026-08-01',
    half_day:   '',
    reason:     '[연동 테스트]'
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

    Logger.log('테스트 결과 [' + statusCode + ']: ' + JSON.stringify(result));

    if (result.success) {
      Browser.msgBox('연동 성공!\n\n'
        + result.message
        + '\n\n휴가 유형: ' + result.data.leave_type
        + '\n기간: ' + result.data.start_date + ' ~ ' + result.data.end_date
        + '\n일수: ' + result.data.days + '일'
        + '\n\nHR 시스템 연차관리 > 승인대기 탭에서 확인하세요.');
    } else {
      Browser.msgBox('응답은 받았으나 등록 실패:\n\n' + JSON.stringify(result));
    }
  } catch (err) {
    Browser.msgBox('오류:\n\n' + err.toString()
      + '\n\n확인사항:\n1. HR_WEBHOOK_URL 이 올바른가요?\n2. 인터넷 연결 확인');
  }
}
