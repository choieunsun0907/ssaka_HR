import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'

type Bindings = { DB: D1Database }

const users = new Hono<{ Bindings: Bindings }>()

// 인증 미들웨어
users.use('*', async (c, next) => {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.json({ error: '로그인이 필요합니다.' }, 401)
  const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?')
    .bind(Number(sessionId)).first<{ id: number; role: string }>()
  if (!user) return c.json({ error: '인증 실패.' }, 401)
  c.set('userId' as never, user.id)
  c.set('userRole' as never, user.role)
  await next()
})

// 전체 직원 목록
users.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, employee_id, name, email, department, position, hire_date, phone, role, annual_leave_total, created_at FROM users ORDER BY department, name'
  ).all()
  return c.json(results)
})

// 직원 상세
users.get('/:id', async (c) => {
  const id = c.req.param('id')
  const user = await c.env.DB.prepare(
    'SELECT id, employee_id, name, email, department, position, hire_date, phone, role, annual_leave_total FROM users WHERE id = ?'
  ).bind(Number(id)).first()
  if (!user) return c.json({ error: '직원을 찾을 수 없습니다.' }, 404)
  return c.json(user)
})

// 직원 추가 (관리자 전용)
users.post('/', async (c) => {
  const role = (c as any).get('userRole')
  if (role !== 'admin') return c.json({ error: '권한이 없습니다.' }, 403)

  const { employee_id, name, email, password, department, position, hire_date, phone, annual_leave_total } = await c.req.json()
  if (!employee_id || !name || !email || !password || !department || !position || !hire_date) {
    return c.json({ error: '필수 항목을 모두 입력해주세요.' }, 400)
  }

  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO users (employee_id, name, email, password, department, position, hire_date, phone, annual_leave_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(employee_id, name, email, password, department, position, hire_date, phone || null, annual_leave_total || 15).run()
    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 존재하는 사원번호 또는 이메일입니다.' }, 409)
    return c.json({ error: '오류가 발생했습니다.' }, 500)
  }
})

// 직원 수정 (관리자 또는 본인)
users.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const userId = (c as any).get('userId')
  const role = (c as any).get('userRole')

  if (role !== 'admin' && userId !== id) return c.json({ error: '권한이 없습니다.' }, 403)

  const body = await c.req.json()
  const { employee_id, name, email, department, position, hire_date, phone, annual_leave_total } = body
  const newRole = body.role

  const updates: string[] = []
  const values: any[] = []

  if (name) { updates.push('name = ?'); values.push(name) }
  if (email) { updates.push('email = ?'); values.push(email) }
  if (department) { updates.push('department = ?'); values.push(department) }
  if (position) { updates.push('position = ?'); values.push(position) }
  if (hire_date) { updates.push('hire_date = ?'); values.push(hire_date) }
  if (phone !== undefined) { updates.push('phone = ?'); values.push(phone) }
  // 관리자 전용 필드
  if (role === 'admin') {
    if (employee_id) { updates.push('employee_id = ?'); values.push(employee_id) }
    if (annual_leave_total !== undefined) { updates.push('annual_leave_total = ?'); values.push(annual_leave_total) }
    if (newRole && ['admin', 'employee'].includes(newRole)) { updates.push('role = ?'); values.push(newRole) }
  }

  if (updates.length === 0) return c.json({ error: '수정할 내용이 없습니다.' }, 400)

  updates.push('updated_at = CURRENT_TIMESTAMP')
  values.push(id)

  try {
    await c.env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run()
    return c.json({ success: true })
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '이미 사용 중인 사원번호 또는 이메일입니다.' }, 409)
    return c.json({ error: '오류가 발생했습니다.' }, 500)
  }
})

// 비밀번호 초기화 (관리자 전용)
users.put('/:id/reset-password', async (c) => {
  const role = (c as any).get('userRole')
  if (role !== 'admin') return c.json({ error: '권한이 없습니다.' }, 403)
  const id = Number(c.req.param('id'))
  const { password } = await c.req.json()
  if (!password || password.length < 4) return c.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, 400)
  await c.env.DB.prepare('UPDATE users SET password=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(password, id).run()
  return c.json({ success: true })
})

// 직원 삭제 (관리자 전용) - 연관 레코드 순서대로 삭제
users.delete('/:id', async (c) => {
  const role = (c as any).get('userRole')
  if (role !== 'admin') return c.json({ error: '권한이 없습니다.' }, 403)
  const id = Number(c.req.param('id'))

  // 본인 계정 삭제 방지
  const myId = (c as any).get('userId')
  if (myId === id) return c.json({ error: '본인 계정은 삭제할 수 없습니다.' }, 400)

  // 연관 레코드 먼저 삭제 (FK 제약 해결)
  await c.env.DB.prepare('DELETE FROM leave_grants WHERE user_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM leaves WHERE user_id = ? OR approved_by = ?').bind(id, id).run()
  await c.env.DB.prepare('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?').bind(id, id).run()
  await c.env.DB.prepare('DELETE FROM notices WHERE author_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

export default users
