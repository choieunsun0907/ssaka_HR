import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'

type Bindings = { DB: D1Database }

const leaves = new Hono<{ Bindings: Bindings }>()

// 인증 미들웨어
leaves.use('*', async (c, next) => {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.json({ error: '로그인이 필요합니다.' }, 401)
  const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?')
    .bind(Number(sessionId)).first<{ id: number; role: string }>()
  if (!user) return c.json({ error: '인증 실패.' }, 401)
  c.set('userId' as never, user.id)
  c.set('userRole' as never, user.role)
  await next()
})

// 연차 목록 (관리자: 전체, 직원: 본인)
leaves.get('/', async (c) => {
  const userId = (c as any).get('userId')
  const role = (c as any).get('userRole')
  const targetId = c.req.query('user_id')

  let query = `
    SELECT l.*, u.name as user_name, u.department, u.employee_id,
           a.name as approver_name
    FROM leaves l
    JOIN users u ON l.user_id = u.id
    LEFT JOIN users a ON l.approved_by = a.id
  `
  let params: any[] = []

  if (role !== 'admin') {
    query += ' WHERE l.user_id = ?'
    params.push(userId)
  } else if (targetId) {
    query += ' WHERE l.user_id = ?'
    params.push(Number(targetId))
  }
  query += ' ORDER BY l.created_at DESC'

  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(results)
})

// 연차 통계 (사용/잔여)
leaves.get('/stats', async (c) => {
  const userId = (c as any).get('userId')
  const role = (c as any).get('userRole')
  const targetId = c.req.query('user_id')

  const id = (role === 'admin' && targetId) ? Number(targetId) : userId

  const user = await c.env.DB.prepare('SELECT annual_leave_total FROM users WHERE id = ?').bind(id).first<{ annual_leave_total: number }>()
  if (!user) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)

  const used = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(days), 0) as total FROM leaves WHERE user_id = ? AND status = 'approved'"
  ).bind(id).first<{ total: number }>()

  const pending = await c.env.DB.prepare(
    "SELECT COALESCE(SUM(days), 0) as total FROM leaves WHERE user_id = ? AND status = 'pending'"
  ).bind(id).first<{ total: number }>()

  const total = user.annual_leave_total
  const usedDays = used?.total || 0
  const pendingDays = pending?.total || 0
  const remaining = total - usedDays

  return c.json({ total, used: usedDays, remaining, pending: pendingDays })
})

// 전체 직원 연차 현황 (관리자)
leaves.get('/all-stats', async (c) => {
  const role = (c as any).get('userRole')
  if (role !== 'admin') return c.json({ error: '권한이 없습니다.' }, 403)

  const { results } = await c.env.DB.prepare(`
    SELECT u.id, u.employee_id, u.name, u.department, u.position,
           u.annual_leave_total,
           COALESCE(SUM(CASE WHEN l.status = 'approved' THEN l.days ELSE 0 END), 0) as used_days,
           COALESCE(SUM(CASE WHEN l.status = 'pending' THEN l.days ELSE 0 END), 0) as pending_days
    FROM users u
    LEFT JOIN leaves l ON u.id = l.user_id
    GROUP BY u.id
    ORDER BY u.department, u.name
  `).all()

  return c.json(results.map((r: any) => ({
    ...r,
    remaining_days: r.annual_leave_total - r.used_days
  })))
})

// 연차 신청
leaves.post('/', async (c) => {
  const userId = (c as any).get('userId')
  const { leave_type, start_date, end_date, days, reason } = await c.req.json()

  if (!leave_type || !start_date || !end_date || !days) {
    return c.json({ error: '필수 항목을 모두 입력해주세요.' }, 400)
  }

  // 잔여 연차 체크
  const stats = await c.env.DB.prepare(
    "SELECT annual_leave_total, COALESCE((SELECT SUM(days) FROM leaves WHERE user_id = users.id AND status = 'approved'), 0) as used FROM users WHERE id = ?"
  ).bind(userId).first<{ annual_leave_total: number; used: number }>()

  if (stats && (stats.annual_leave_total - stats.used) < days) {
    return c.json({ error: '잔여 연차가 부족합니다.' }, 400)
  }

  const result = await c.env.DB.prepare(
    'INSERT INTO leaves (user_id, leave_type, start_date, end_date, days, reason) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(userId, leave_type, start_date, end_date, days, reason || null).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// 연차 승인/반려 (관리자)
leaves.put('/:id/approve', async (c) => {
  const role = (c as any).get('userRole')
  const approverId = (c as any).get('userId')
  if (role !== 'admin') return c.json({ error: '권한이 없습니다.' }, 403)

  const id = c.req.param('id')
  const { status } = await c.req.json() // 'approved' | 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return c.json({ error: '잘못된 상태값입니다.' }, 400)
  }

  await c.env.DB.prepare(
    'UPDATE leaves SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(status, approverId, Number(id)).run()

  return c.json({ success: true })
})

// 연차 취소 (본인, pending 상태만)
leaves.delete('/:id', async (c) => {
  const userId = (c as any).get('userId')
  const id = c.req.param('id')

  const leave = await c.env.DB.prepare('SELECT user_id, status FROM leaves WHERE id = ?')
    .bind(Number(id)).first<{ user_id: number; status: string }>()

  if (!leave) return c.json({ error: '연차 신청을 찾을 수 없습니다.' }, 404)
  if (leave.user_id !== userId) return c.json({ error: '권한이 없습니다.' }, 403)
  if (leave.status !== 'pending') return c.json({ error: '대기 중인 연차만 취소할 수 있습니다.' }, 400)

  await c.env.DB.prepare('DELETE FROM leaves WHERE id = ?').bind(Number(id)).run()
  return c.json({ success: true })
})

export default leaves
