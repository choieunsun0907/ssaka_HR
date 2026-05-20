import { Hono } from 'hono'

type Bindings = { DB: D1Database }

const webhook = new Hono<{ Bindings: Bindings }>()

// ── 구글 폼 휴가 유형 → DB leave_type 매핑 ─────────────────────
function mapLeaveType(googleType: string): string {
  const t = (googleType || '').trim()
  if (t.includes('병가'))           return '병가'
  if (t.includes('경조사'))         return '경조사'
  if (t.includes('법적') || t.includes('예비군') || t.includes('배심')) return '공가'
  if (t.includes('무급'))           return '무급'
  if (t.includes('반차'))           return '반차'
  return '연차' // 개인 사유 / 기타 / 기본값
}

// ── 날짜 차이 계산 (영업일 단순 계산, 반차=0.5) ─────────────────
function calcDays(startDate: string, endDate: string, isHalfDay: boolean): number {
  if (isHalfDay) return 0.5
  const start = new Date(startDate)
  const end   = new Date(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1
  const diffMs   = end.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
  return Math.max(diffDays, 1)
}

// ── 날짜 파싱: 여러 형식 지원 ────────────────────────────────────
// "2025년 6월 15일", "2025/06/15", "2025-06-15", "June 15, 2025"
function parseDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()

  // 한국어: "2025년 6월 15일"
  const krMatch = s.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
  if (krMatch) {
    const y = krMatch[1]
    const m = String(krMatch[2]).padStart(2, '0')
    const d = String(krMatch[3]).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // ISO: "2025-06-15"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // 슬래시: "2025/06/15" 또는 "06/15/2025"
  const slash = s.match(/^(\d{2,4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (slash) {
    const [, a, b, c] = slash
    if (a.length === 4) {
      return `${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`
    }
  }

  // 마지막 시도: Date 파싱
  const parsed = new Date(s)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return null
}

// ── Google Forms Webhook 수신 엔드포인트 ────────────────────────
// Apps Script 에서 POST {name, leave_type, start_date, end_date, half_day, reason, secret}
webhook.post('/google-forms', async (c) => {
  let body: Record<string, string>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  // ── 시크릿 키 검증 (선택적 보안) ─────────────────────────────
  const webhookSecret = 'HR_GFORM_2025' // 간단한 공유 시크릿
  if (body.secret && body.secret !== webhookSecret) {
    return c.json({ error: '인증 실패' }, 401)
  }

  const {
    name,          // 이름 (필수 - users.name 으로 매칭)
    leave_type,    // 휴가 유형
    start_date,    // 시작일
    end_date,      // 종료일
    half_day,      // '오전' | '오후' | '' (반차 여부)
    reason,        // 사유 (optional)
  } = body

  // ── 필수값 검증 ─────────────────────────────────────────────
  if (!name || !leave_type || !start_date) {
    return c.json({
      error: '필수 항목 누락 (name, leave_type, start_date)',
      received: Object.keys(body)
    }, 400)
  }

  // ── 날짜 파싱 ────────────────────────────────────────────────
  const parsedStart = parseDate(start_date)
  const parsedEnd   = parseDate(end_date || start_date) // 종료일 없으면 시작일과 동일
  if (!parsedStart || !parsedEnd) {
    return c.json({ error: `날짜 파싱 실패: start="${start_date}", end="${end_date}"` }, 400)
  }

  // ── 이름으로 직원 검색 ───────────────────────────────────────
  const user = await c.env.DB.prepare(
    'SELECT id, name, annual_leave_total FROM users WHERE name = ? LIMIT 1'
  ).bind(name.trim()).first<{ id: number; name: string; annual_leave_total: number }>()

  if (!user) {
    // 등록되지 않은 직원이면 로그만 남기고 200 반환 (폼 재제출 방지)
    console.log(`[Webhook] 알 수 없는 직원: "${name}" - 무시됨`)
    return c.json({
      success: false,
      warning: `"${name}" 직원을 시스템에서 찾을 수 없습니다. 관리자에게 문의하세요.`,
      name
    }, 200)
  }

  // ── 휴가 유형 변환 ───────────────────────────────────────────
  const isHalfDay = !!(half_day && (half_day.includes('오전') || half_day.includes('오후')))
  const mappedType = isHalfDay ? '반차' : mapLeaveType(leave_type)
  const days = calcDays(parsedStart, parsedEnd, isHalfDay)

  // 반차 사유에 오전/오후 정보 포함
  const fullReason = [
    isHalfDay ? `[${half_day} 반차]` : null,
    reason || leave_type,
    '[구글폼 제출]'
  ].filter(Boolean).join(' ')

  // ── 잔여 연차 확인 ───────────────────────────────────────────
  const used = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(days), 0) as total FROM leaves WHERE user_id = ? AND status = 'approved'"
  ).bind(user.id).first<{ total: number }>()

  const remaining = user.annual_leave_total - (used?.total || 0)
  // 잔여 부족해도 pending 으로 등록 (관리자가 판단하도록)

  // ── leaves 테이블에 INSERT ───────────────────────────────────
  const result = await c.env.DB.prepare(
    `INSERT INTO leaves (user_id, leave_type, start_date, end_date, days, reason, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`
  ).bind(
    user.id,
    mappedType,
    parsedStart,
    parsedEnd,
    days,
    fullReason
  ).run()

  console.log(`[Webhook] 연차 신청 등록: ${user.name} / ${mappedType} / ${parsedStart}~${parsedEnd} / ${days}일`)

  return c.json({
    success: true,
    message: `${user.name}님의 연차 신청이 등록되었습니다. (관리자 승인 대기)`,
    data: {
      leave_id:   result.meta.last_row_id,
      user_name:  user.name,
      leave_type: mappedType,
      start_date: parsedStart,
      end_date:   parsedEnd,
      days,
      remaining_after: remaining - days,
      status: 'pending'
    }
  })
})

// ── 연결 테스트 엔드포인트 (GET) ────────────────────────────────
webhook.get('/google-forms', (c) => {
  return c.json({
    status: 'ok',
    message: 'Google Forms Webhook 엔드포인트가 활성화되어 있습니다.',
    usage: 'POST /api/webhook/google-forms with JSON body',
    required_fields: ['name', 'leave_type', 'start_date'],
    optional_fields: ['end_date', 'half_day', 'reason', 'secret'],
    secret_hint: '시크릿 키: HR_GFORM_2025',
  })
})

export default webhook
