import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'

type Bindings = { DB: D1Database }

const settings = new Hono<{ Bindings: Bindings }>()

// 관리자 인증 미들웨어
settings.use('*', async (c, next) => {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.json({ error: '로그인이 필요합니다.' }, 401)
  const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?')
    .bind(Number(sessionId)).first<{ id: number; role: string }>()
  if (!user) return c.json({ error: '인증 실패.' }, 401)
  if (user.role !== 'admin') return c.json({ error: '관리자만 접근 가능합니다.' }, 403)
  c.set('userId' as never, user.id)
  await next()
})

// ── 부서 ──────────────────────────────────
settings.get('/departments', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM departments ORDER BY sort_order, name'
  ).all()
  return c.json(results)
})

settings.post('/departments', async (c) => {
  const { name, description, default_annual_leave, sort_order } = await c.req.json()
  if (!name?.trim()) return c.json({ error: '부서명을 입력해주세요.' }, 400)
  try {
    const r = await c.env.DB.prepare(
      'INSERT INTO departments (name, description, default_annual_leave, sort_order) VALUES (?, ?, ?, ?)'
    ).bind(name.trim(), description || '', default_annual_leave || 15, sort_order || 0).run()
    return c.json({ success: true, id: r.meta.last_row_id })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 존재하는 부서명입니다.' }, 409)
    return c.json({ error: '오류가 발생했습니다.' }, 500)
  }
})

settings.put('/departments/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const { name, description, default_annual_leave, sort_order } = await c.req.json()
  if (!name?.trim()) return c.json({ error: '부서명을 입력해주세요.' }, 400)
  try {
    await c.env.DB.prepare(
      'UPDATE departments SET name=?, description=?, default_annual_leave=?, sort_order=? WHERE id=?'
    ).bind(name.trim(), description || '', default_annual_leave || 15, sort_order || 0, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 존재하는 부서명입니다.' }, 409)
    return c.json({ error: '오류가 발생했습니다.' }, 500)
  }
})

settings.delete('/departments/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const dept = await c.env.DB.prepare('SELECT name FROM departments WHERE id=?').bind(id).first<{name:string}>()
  if (!dept) return c.json({ error: '부서를 찾을 수 없습니다.' }, 404)
  // 해당 부서에 직원이 있는지 확인
  const cnt = await c.env.DB.prepare('SELECT COUNT(*) as c FROM users WHERE department=?').bind(dept.name).first<{c:number}>()
  if (cnt && cnt.c > 0) return c.json({ error: `해당 부서에 직원 ${cnt.c}명이 있어 삭제할 수 없습니다.` }, 400)
  await c.env.DB.prepare('DELETE FROM departments WHERE id=?').bind(id).run()
  return c.json({ success: true })
})

// ── 직급 ──────────────────────────────────
settings.get('/positions', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM positions ORDER BY sort_order, level'
  ).all()
  return c.json(results)
})

settings.post('/positions', async (c) => {
  const { name, level, sort_order } = await c.req.json()
  if (!name?.trim()) return c.json({ error: '직급명을 입력해주세요.' }, 400)
  try {
    const r = await c.env.DB.prepare(
      'INSERT INTO positions (name, level, sort_order) VALUES (?, ?, ?)'
    ).bind(name.trim(), level || 1, sort_order || 0).run()
    return c.json({ success: true, id: r.meta.last_row_id })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 존재하는 직급명입니다.' }, 409)
    return c.json({ error: '오류가 발생했습니다.' }, 500)
  }
})

settings.put('/positions/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const { name, level, sort_order } = await c.req.json()
  if (!name?.trim()) return c.json({ error: '직급명을 입력해주세요.' }, 400)
  try {
    await c.env.DB.prepare(
      'UPDATE positions SET name=?, level=?, sort_order=? WHERE id=?'
    ).bind(name.trim(), level || 1, sort_order || 0, id).run()
    return c.json({ success: true })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 존재하는 직급명입니다.' }, 409)
    return c.json({ error: '오류가 발생했습니다.' }, 500)
  }
})

settings.delete('/positions/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('DELETE FROM positions WHERE id=?').bind(id).run()
  return c.json({ success: true })
})

// ── 시스템 설정 ──────────────────────────
settings.get('/system', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM settings').all()
  const map: Record<string, string> = {}
  results.forEach((r: any) => { map[r.key] = r.value })
  return c.json(map)
})

settings.put('/system', async (c) => {
  const body = await c.req.json()
  for (const [key, value] of Object.entries(body)) {
    await c.env.DB.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at'
    ).bind(key, String(value)).run()
  }
  return c.json({ success: true })
})

// ── 회계연도 ──────────────────────────────────

// 목록 조회 (각 연도별 부여된 직원 수 포함)
settings.get('/fiscal-years', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM leave_grants lg WHERE lg.fiscal_year = f.fiscal_year) as granted_count
    FROM fiscal_years f
    ORDER BY f.fiscal_year DESC
  `).all()
  return c.json(results)
})

// 회계연도 추가
settings.post('/fiscal-years', async (c) => {
  const { fiscal_year, start_month, default_days, note } = await c.req.json()
  if (!fiscal_year || isNaN(Number(fiscal_year))) return c.json({ error: '올바른 연도를 입력해주세요.' }, 400)
  const yr = Number(fiscal_year)
  const sm = Number(start_month) || 1
  // end_month: 시작월 - 1, 1월 시작이면 12월 종료
  const em = sm === 1 ? 12 : sm - 1
  try {
    const r = await c.env.DB.prepare(
      'INSERT INTO fiscal_years (fiscal_year, start_month, end_month, default_days, is_active, note) VALUES (?, ?, ?, ?, 0, ?)'
    ).bind(yr, sm, em, Number(default_days) || 15, note || '').run()
    return c.json({ success: true, id: r.meta.last_row_id })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 존재하는 회계연도입니다.' }, 409)
    return c.json({ error: '오류가 발생했습니다.' }, 500)
  }
})

// 회계연도 수정
settings.put('/fiscal-years/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const { fiscal_year, start_month, default_days, note } = await c.req.json()
  if (!fiscal_year || isNaN(Number(fiscal_year))) return c.json({ error: '올바른 연도를 입력해주세요.' }, 400)
  const yr = Number(fiscal_year)
  const sm = Number(start_month) || 1
  const em = sm === 1 ? 12 : sm - 1
  try {
    await c.env.DB.prepare(
      'UPDATE fiscal_years SET fiscal_year=?, start_month=?, end_month=?, default_days=?, note=? WHERE id=?'
    ).bind(yr, sm, em, Number(default_days) || 15, note || '', id).run()
    return c.json({ success: true })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 존재하는 회계연도입니다.' }, 409)
    return c.json({ error: '오류가 발생했습니다.' }, 500)
  }
})

// 회계연도 삭제 (부여 내역 있으면 거부)
settings.delete('/fiscal-years/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const fy = await c.env.DB.prepare('SELECT * FROM fiscal_years WHERE id=?').bind(id).first<any>()
  if (!fy) return c.json({ error: '회계연도를 찾을 수 없습니다.' }, 404)
  const cnt = await c.env.DB.prepare('SELECT COUNT(*) as c FROM leave_grants WHERE fiscal_year=?').bind(fy.fiscal_year).first<{c:number}>()
  if (cnt && cnt.c > 0) return c.json({ error: `연차 부여 내역 ${cnt.c}건이 있어 삭제할 수 없습니다.` }, 400)
  await c.env.DB.prepare('DELETE FROM fiscal_years WHERE id=?').bind(id).run()
  return c.json({ success: true })
})

// 활성 회계연도 변경 (1개만 active)
settings.post('/fiscal-years/:id/activate', async (c) => {
  const id = Number(c.req.param('id'))
  const fy = await c.env.DB.prepare('SELECT * FROM fiscal_years WHERE id=?').bind(id).first<any>()
  if (!fy) return c.json({ error: '회계연도를 찾을 수 없습니다.' }, 404)
  await c.env.DB.prepare('UPDATE fiscal_years SET is_active=0').run()
  await c.env.DB.prepare('UPDATE fiscal_years SET is_active=1 WHERE id=?').bind(id).run()
  return c.json({ success: true })
})

// ── 연차 부여 내역 ──────────────────────────────────

// 특정 회계연도의 전체 부여 내역 조회
settings.get('/leave-grants/:fiscal_year', async (c) => {
  const fy = Number(c.req.param('fiscal_year'))
  const { results } = await c.env.DB.prepare(`
    SELECT lg.*, u.name, u.employee_id, u.department, u.position
    FROM leave_grants lg
    JOIN users u ON u.id = lg.user_id
    WHERE lg.fiscal_year = ?
    ORDER BY u.department, u.name
  `).bind(fy).all()
  return c.json(results)
})

// 회계연도 기준 전체 직원에게 일괄 부여 (이미 있으면 skip or overwrite)
settings.post('/leave-grants/bulk', async (c) => {
  const { fiscal_year, days, overwrite } = await c.req.json()
  if (!fiscal_year || !days || isNaN(Number(days))) return c.json({ error: '연도와 일수를 입력해주세요.' }, 400)
  const fy = Number(fiscal_year)
  const d  = Number(days)

  const { results: users } = await c.env.DB.prepare('SELECT id FROM users').all()
  let inserted = 0, skipped = 0

  for (const u of users as any[]) {
    const existing = await c.env.DB.prepare('SELECT id FROM leave_grants WHERE user_id=? AND fiscal_year=?')
      .bind(u.id, fy).first<{id:number}>()
    if (existing) {
      if (overwrite) {
        await c.env.DB.prepare('UPDATE leave_grants SET granted_days=?, granted_at=CURRENT_TIMESTAMP WHERE user_id=? AND fiscal_year=?')
          .bind(d, u.id, fy).run()
        inserted++
      } else {
        skipped++
      }
    } else {
      await c.env.DB.prepare('INSERT INTO leave_grants (user_id, fiscal_year, granted_days) VALUES (?, ?, ?)')
        .bind(u.id, fy, d).run()
      inserted++
    }
    // users 테이블의 annual_leave_total도 동기화
    await c.env.DB.prepare('UPDATE users SET annual_leave_total=? WHERE id=?').bind(d, u.id).run()
  }
  return c.json({ success: true, inserted, skipped, total: users.length })
})

// 개별 직원 연차 수정
settings.put('/leave-grants/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const { granted_days, note } = await c.req.json()
  if (isNaN(Number(granted_days))) return c.json({ error: '올바른 일수를 입력해주세요.' }, 400)
  const d = Number(granted_days)
  const grant = await c.env.DB.prepare('SELECT user_id FROM leave_grants WHERE id=?').bind(id).first<{user_id:number}>()
  if (!grant) return c.json({ error: '부여 내역을 찾을 수 없습니다.' }, 404)
  await c.env.DB.prepare('UPDATE leave_grants SET granted_days=?, note=? WHERE id=?').bind(d, note || '', id).run()
  // users 테이블도 동기화
  await c.env.DB.prepare('UPDATE users SET annual_leave_total=? WHERE id=?').bind(d, grant.user_id).run()
  return c.json({ success: true })
})

// 기존 호환: 연차 일괄 업데이트 (전체)
settings.post('/apply-annual-leave', async (c) => {
  const { days } = await c.req.json()
  if (!days || isNaN(Number(days))) return c.json({ error: '올바른 일수를 입력해주세요.' }, 400)
  await c.env.DB.prepare('UPDATE users SET annual_leave_total=?').bind(Number(days)).run()
  const cnt = await c.env.DB.prepare('SELECT COUNT(*) as c FROM users').first<{c:number}>()
  return c.json({ success: true, updated: cnt?.c || 0 })
})

// ── 연차 자동 부여 정책 ───────────────────────────────────────

/**
 * 입사일 기준 연차 계산 로직 (근로기준법 기반)
 *  - 근속 1년 미만: 1개월 개근 시 1일 → 최대 11일
 *  - 근속 1년 이상: 기본 15일 + (2년마다 1일 추가) → 최대 25일
 *  - 3년 이상: 15 + floor((years-1)/2)일, 최대 25일
 */
function calcHireDateLeave(hireDate: string, referenceDate: Date, policy: Record<string, string>): number {
  const baseDays   = Number(policy['leave_base_days']        || 15)
  const maxDays    = Number(policy['leave_max_days']         || 25)
  const probDays   = Number(policy['leave_probation_days']   || 11)
  const tenureIncr = Number(policy['leave_tenure_increment'] || 1)
  const tenureUnit = Number(policy['leave_tenure_unit']      || 2)

  const hire = new Date(hireDate)
  const ref  = referenceDate

  // 근속 개월 수
  const totalMonths =
    (ref.getFullYear() - hire.getFullYear()) * 12 +
    (ref.getMonth() - hire.getMonth()) +
    (ref.getDate() >= hire.getDate() ? 0 : -1)

  if (totalMonths < 0) return 0

  const years = Math.floor(totalMonths / 12)

  if (years < 1) {
    // 1년 미만: 만 1개월마다 1일, 최대 probDays
    return Math.min(totalMonths, probDays)
  }

  // 1년 이상: baseDays + 2년마다 1일 추가 (3년차부터)
  const extra = years >= 1 ? Math.floor((years - 1) / tenureUnit) * tenureIncr : 0
  return Math.min(baseDays + extra, maxDays)
}

/**
 * 회계연도 기준 연차 계산 로직
 *  - 해당 회계연도 시작일 기준으로 근속연수를 계산
 *  - 입사일 기준 로직과 동일하게 적용
 */
function calcFiscalLeave(hireDate: string, fiscalYear: number, startMonth: number, policy: Record<string, string>): number {
  // 회계연도 기준일: 해당 회계연도 시작월 1일
  const refDate = new Date(fiscalYear, startMonth - 1, 1)
  return calcHireDateLeave(hireDate, refDate, policy)
}

// 자동 부여 미리보기 (실제 적용 없이 결과만 반환)
settings.post('/leave-grants/preview', async (c) => {
  const body = await c.req.json()
  const { fiscal_year, policy_type } = body  // policy_type: 'fiscal' | 'hire_date'

  if (!fiscal_year) return c.json({ error: '회계연도를 입력해주세요.' }, 400)
  const fy = Number(fiscal_year)

  // 정책 설정 로드
  const { results: settingsRows } = await c.env.DB.prepare('SELECT key, value FROM settings').all()
  const policy: Record<string, string> = {}
  ;(settingsRows as any[]).forEach(r => { policy[r.key] = r.value })

  // 회계연도 정보
  const fyInfo = await c.env.DB.prepare('SELECT * FROM fiscal_years WHERE fiscal_year=?').bind(fy).first<any>()
  const startMonth = fyInfo?.start_month || 1

  // 전체 직원 조회
  const { results: users } = await c.env.DB.prepare(
    'SELECT id, name, employee_id, department, position, hire_date, annual_leave_total FROM users ORDER BY department, name'
  ).all()

  const pType = policy_type || policy['leave_grant_policy'] || 'fiscal'
  const refDate = new Date()

  const preview = (users as any[]).map(u => {
    let calculated: number
    if (pType === 'hire_date') {
      calculated = calcHireDateLeave(u.hire_date, refDate, policy)
    } else {
      calculated = calcFiscalLeave(u.hire_date, fy, startMonth, policy)
    }
    // 근속 년수 계산
    const hire = new Date(u.hire_date)
    const base = pType === 'fiscal' ? new Date(fy, startMonth - 1, 1) : refDate
    const totalMonths = (base.getFullYear() - hire.getFullYear()) * 12 + (base.getMonth() - hire.getMonth())
    const years  = Math.floor(Math.max(totalMonths, 0) / 12)
    const months = Math.max(totalMonths, 0) % 12

    return {
      user_id:      u.id,
      employee_id:  u.employee_id,
      name:         u.name,
      department:   u.department,
      position:     u.position,
      hire_date:    u.hire_date,
      tenure_years: years,
      tenure_months: months,
      current_days: u.annual_leave_total,
      calculated_days: calculated,
      diff: calculated - u.annual_leave_total,
    }
  })

  return c.json({ policy_type: pType, fiscal_year: fy, preview })
})

// 자동 부여 실행 (미리보기 결과 기반으로 실제 적용)
settings.post('/leave-grants/auto-apply', async (c) => {
  const body = await c.req.json()
  const { fiscal_year, policy_type, overwrite } = body

  if (!fiscal_year) return c.json({ error: '회계연도를 입력해주세요.' }, 400)
  const fy = Number(fiscal_year)

  // 정책 설정 로드
  const { results: settingsRows } = await c.env.DB.prepare('SELECT key, value FROM settings').all()
  const policy: Record<string, string> = {}
  ;(settingsRows as any[]).forEach(r => { policy[r.key] = r.value })

  // 회계연도 정보 (없으면 기본값 사용)
  const fyInfo = await c.env.DB.prepare('SELECT * FROM fiscal_years WHERE fiscal_year=?').bind(fy).first<any>()
  const startMonth = fyInfo?.start_month || 1

  const pType = policy_type || policy['leave_grant_policy'] || 'fiscal'
  const refDate = new Date()

  // 전체 직원
  const { results: users } = await c.env.DB.prepare('SELECT id, hire_date FROM users').all()

  let inserted = 0, skipped = 0, updated = 0

  for (const u of users as any[]) {
    let days: number
    if (pType === 'hire_date') {
      days = calcHireDateLeave(u.hire_date, refDate, policy)
    } else {
      days = calcFiscalLeave(u.hire_date, fy, startMonth, policy)
    }

    // leave_grants 업서트
    const existing = await c.env.DB.prepare(
      'SELECT id FROM leave_grants WHERE user_id=? AND fiscal_year=?'
    ).bind(u.id, fy).first<{id:number}>()

    if (existing) {
      if (overwrite) {
        await c.env.DB.prepare(
          'UPDATE leave_grants SET granted_days=?, note=?, granted_at=CURRENT_TIMESTAMP WHERE user_id=? AND fiscal_year=?'
        ).bind(days, pType === 'fiscal' ? '회계연도기준 자동부여' : '입사일기준 자동부여', u.id, fy).run()
        updated++
      } else {
        skipped++
      }
    } else {
      await c.env.DB.prepare(
        'INSERT INTO leave_grants (user_id, fiscal_year, granted_days, note) VALUES (?, ?, ?, ?)'
      ).bind(u.id, fy, days, pType === 'fiscal' ? '회계연도기준 자동부여' : '입사일기준 자동부여').run()
      inserted++
    }
    // users 테이블 동기화
    await c.env.DB.prepare('UPDATE users SET annual_leave_total=? WHERE id=?').bind(days, u.id).run()
  }

  // 정책 설정 저장
  await c.env.DB.prepare(
    "INSERT INTO settings (key,value,updated_at) VALUES ('leave_grant_policy',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at"
  ).bind(pType).run()

  return c.json({ success: true, inserted, updated, skipped, total: (users as any[]).length, policy_type: pType })
})

export default settings
