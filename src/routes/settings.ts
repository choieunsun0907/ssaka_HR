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

// 연차 일괄 업데이트 (전체 or 부서별)
settings.post('/apply-annual-leave', async (c) => {
  const { department, days } = await c.req.json()
  if (!days || isNaN(Number(days))) return c.json({ error: '올바른 일수를 입력해주세요.' }, 400)
  if (department && department !== 'all') {
    await c.env.DB.prepare('UPDATE users SET annual_leave_total=? WHERE department=?').bind(Number(days), department).run()
    const cnt = await c.env.DB.prepare('SELECT COUNT(*) as c FROM users WHERE department=?').bind(department).first<{c:number}>()
    return c.json({ success: true, updated: cnt?.c || 0 })
  } else {
    await c.env.DB.prepare('UPDATE users SET annual_leave_total=?').bind(Number(days)).run()
    const cnt = await c.env.DB.prepare('SELECT COUNT(*) as c FROM users').first<{c:number}>()
    return c.json({ success: true, updated: cnt?.c || 0 })
  }
})

export default settings
