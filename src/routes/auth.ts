import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

type Bindings = { DB: D1Database }

const auth = new Hono<{ Bindings: Bindings }>()

// 로그인
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) {
    return c.json({ error: '이메일과 비밀번호를 입력해주세요.' }, 400)
  }
  const user = await c.env.DB.prepare(
    'SELECT id, employee_id, name, email, department, position, role FROM users WHERE email = ? AND password = ?'
  ).bind(email, password).first<{ id: number; employee_id: string; name: string; email: string; department: string; position: string; role: string }>()

  if (!user) {
    return c.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
  }

  // 세션 쿠키 설정 (간단한 user ID 기반)
  setCookie(c, 'session', String(user.id), {
    httpOnly: false,
    maxAge: 60 * 60 * 8, // 8시간
    path: '/'
  })
  return c.json({ success: true, user })
})

// 로그아웃
auth.post('/logout', (c) => {
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ success: true })
})

// 현재 사용자 정보
auth.get('/me', async (c) => {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.json({ error: '로그인이 필요합니다.' }, 401)

  const user = await c.env.DB.prepare(
    'SELECT id, employee_id, name, email, department, position, hire_date, phone, role, annual_leave_total FROM users WHERE id = ?'
  ).bind(Number(sessionId)).first()

  if (!user) return c.json({ error: '사용자를 찾을 수 없습니다.' }, 404)
  return c.json(user)
})

export default auth
