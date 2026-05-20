/**
 * ================================================================
 *  Google Apps Script - HR 시스템 완전 연동 버전
 *  - 직원/부서/직급 목록을 HR 시스템에서 실시간으로 가져옴
 *  - 폼 "이름" 항목을 드롭다운으로 자동 업데이트
 *  - 폼 제출 시 HR 연차관리에 자동 등록
 * ================================================================
 *
 *  [설치 방법]
 *  1. Apps Script 편집기에 이 코드 전체 붙여넣기
 *  2. HR_BASE_URL 확인 (아래에 이미 입력됨)
 *  3. Ctrl+S 저장
 *  4. 트리거 2개 등록:
 *     A) 폼 제출 연동:
 *        - 함수: onFormSubmit / 이벤트소스: 폼에서 / 이벤트유형: 양식 제출 시
 *     B) 직원목록 자동 동기화 (선택):
 *        - 함수: syncEmployeesToForm / 이벤트소스: 시간 기반 / 매일 오전 9시
 *  5. 권한 허용
 *  6. syncEmployeesToForm 함수를 한 번 직접 실행하여 드롭다운 초기화
 * ================================================================
 */

// ★ HR 시스템 서버 주소
var HR_BASE_URL = 'https://3000-in6b92pa5orecyoghn11p-b9b802c4.sandbox.novita.ai';

// 시크릿 키
var WEBHOOK_SECRET = 'HR_GFORM_2025';


// ================================================================
//  1. 폼 제출 시 HR 시스템에 연차 신청 자동 등록
// ================================================================
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

    if (!payload.end_date) {
      payload.end_date = payload.start_date;
    }

    Logger.log('HR 전송: ' + JSON.stringify(payload));

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(HR_BASE_URL + '/api/webhook/google-forms', options);
    var statusCode = response.getResponseCode();
    var result = JSON.parse(response.getContentText());

    Logger.log('응답 [' + statusCode + ']: ' + JSON.stringify(result));

    if (result.success) {
      Logger.log('성공: ' + result.message);
    } else if (result.warning) {
      Logger.log('경고 (직원 없음): ' + result.warning);
      // 직원이 없으면 폼 이름 드롭다운 자동 동기화 실행
      syncEmployeesToForm();
    }

  } catch (err) {
    Logger.log('오류: ' + err.toString());
  }
}


// ================================================================
//  2. HR 시스템 직원 목록 → 폼 "이름" 드롭다운 자동 동기화
//     - 직접 실행하거나 시간 기반 트리거로 매일 자동 실행
// ================================================================
function syncEmployeesToForm() {
  try {
    // HR 시스템에서 직원 목록 가져오기
    var response = UrlFetchApp.fetch(HR_BASE_URL + '/api/public/employees', {
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('직원 목록 조회 실패: ' + response.getResponseCode());
      return;
    }

    var employees = JSON.parse(response.getContentText());
    Logger.log('HR 직원 수: ' + employees.length + '명');

    // 직원 이름 목록 추출
    var names = [];
    for (var i = 0; i < employees.length; i++) {
      names.push(employees[i].name);
    }

    if (names.length === 0) {
      Logger.log('직원 없음');
      return;
    }

    // 현재 폼에서 "이름" 항목 찾기
    var form = FormApp.getActiveForm();
    var items = form.getItems();
    var nameItem = null;

    for (var j = 0; j < items.length; j++) {
      var t = items[j].getTitle().trim();
      if (t === '이름' || t === 'Name' || t === '성명') {
        nameItem = items[j];
        break;
      }
    }

    if (!nameItem) {
      Logger.log('"이름" 항목을 폼에서 찾을 수 없음');
      Logger.log('현재 폼 항목: ' + items.map(function(x){ return x.getTitle(); }).join(', '));
      return;
    }

    // 항목 타입에 따라 드롭다운으로 변환 또는 선택지 업데이트
    var itemType = nameItem.getType();
    Logger.log('"이름" 항목 타입: ' + itemType);

    if (itemType === FormApp.ItemType.LIST) {
      // 이미 드롭다운인 경우 → 선택지 업데이트
      var listItem = nameItem.asListItem();
      listItem.setChoiceValues(names);
      Logger.log('드롭다운 업데이트 완료: ' + names.join(', '));

    } else if (itemType === FormApp.ItemType.MULTIPLE_CHOICE) {
      // 객관식인 경우 → 선택지 업데이트
      var mcItem = nameItem.asMultipleChoiceItem();
      mcItem.setChoiceValues(names);
      Logger.log('객관식 업데이트 완료: ' + names.join(', '));

    } else {
      // 주관식(텍스트)인 경우 → 드롭다운으로 자동 변환 불가
      // (Google Forms API 제약: 타입 변경 불가)
      Logger.log('현재 "이름" 항목이 텍스트(주관식)입니다.');
      Logger.log('폼 편집 화면에서 직접 드롭다운으로 변경 후 다시 실행하세요.');
      Logger.log('등록된 직원 목록: ' + names.join(', '));

      // 대신 현재 직원 목록을 로그에 출력 (폼 수동 업데이트용)
      Browser.msgBox(
        'HR 직원 목록 (' + names.length + '명)\n\n' +
        names.join('\n') +
        '\n\n폼의 "이름" 항목을 드롭다운으로 변경하고\n위 이름들을 선택지로 추가해주세요.'
      );
    }

  } catch (err) {
    Logger.log('syncEmployeesToForm 오류: ' + err.toString());
  }
}


// ================================================================
//  3. 폼 질문 제목 확인 함수 (디버그용)
// ================================================================
function checkFormFields() {
  var form = FormApp.getActiveForm();
  var items = form.getItems();
  Logger.log('=== 폼 질문 목록 (' + items.length + '개) ===');
  for (var i = 0; i < items.length; i++) {
    Logger.log('[' + i + '] "' + items[i].getTitle() + '" / 타입: ' + items[i].getType());
  }
}


// ================================================================
//  4. 연동 테스트 함수
// ================================================================
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
    var res = UrlFetchApp.fetch(HR_BASE_URL + '/api/webhook/google-forms', options);
    var result = JSON.parse(res.getContentText());

    if (result.success) {
      Browser.msgBox('연동 성공!\n\n' + result.message
        + '\n\n휴가 유형: ' + result.data.leave_type
        + '\n기간: ' + result.data.start_date + ' ~ ' + result.data.end_date
        + '\n일수: ' + result.data.days + '일'
        + '\n\nHR 시스템 > 연차관리 > 승인대기에서 확인하세요!');
    } else {
      Browser.msgBox('응답 받음 / 등록 실패:\n\n' + JSON.stringify(result));
    }
  } catch (err) {
    Browser.msgBox('오류:\n\n' + err.toString());
  }
}


// ================================================================
//  유틸 함수
// ================================================================
function extractField(data, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (data[keys[i]] !== undefined && data[keys[i]] !== null && data[keys[i]] !== '') {
      return String(data[keys[i]]).trim();
    }
  }
  return '';
}
