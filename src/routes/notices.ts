import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'

type Bindings = { DB: D1Database }

const notices = new Hono<{ Bindings: Bindings }>()

// 인증 미들웨어
notices.use('*', async (c, next) => {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.json({ error: '로그인이 필요합니다.' }, 401)
  const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?')
    .bind(Number(sessionId)).first<{ id: number; role: string }>()
  if (!user) return c.json({ error: '인증 실패.' }, 401)
  c.set('userId' as never, user.id)
  c.set('userRole' as never, user.role)
  await next()
})

// 공지사항 목록
notices.get('/', async (c) => {
  const page = Number(c.req.query('page') || 1)
  const limit = 10
  const offset = (page - 1) * limit

  const { results } = await c.env.DB.prepare(`
    SELECT n.*, u.name as author_name, u.department as author_department
    FROM notices n
    JOIN users u ON n.author_id = u.id
    ORDER BY n.is_pinned DESC, n.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all()

  const count = await c.env.DB.prepare('SELECT COUNT(*) as total FROM notices').first<{ total: number }>()
  return c.json({ notices: results, total: count?.total || 0, page, limit })
})

// 공지사항 상세 (조회수 증가)
notices.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await c.env.DB.prepare('UPDATE notices SET view_count = view_count + 1 WHERE id = ?').bind(id).run()
  const notice = await c.env.DB.prepare(`
    SELECT n.*, u.name as author_name, u.department as author_department
    FROM notices n
    JOIN users u ON n.author_id = u.id
    WHERE n.id = ?
  `).bind(id).first()
  if (!notice) return c.json({ error: '공지사항을 찾을 수 없습니다.' }, 404)
  return c.json(notice)
})

// 공지 작성 (관리자 전용)
notices.post('/', async (c) => {
  const role = (c as any).get('userRole')
  const authorId = (c as any).get('userId')
  if (role !== 'admin') return c.json({ error: '권한이 없습니다.' }, 403)

  const { title, content, is_pinned } = await c.req.json()
  if (!title || !content) return c.json({ error: '제목과 내용을 입력해주세요.' }, 400)

  const result = await c.env.DB.prepare(
    'INSERT INTO notices (author_id, title, content, is_pinned) VALUES (?, ?, ?, ?)'
  ).bind(authorId, title, content, is_pinned ? 1 : 0).run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

// 공지 수정 (관리자 전용)
notices.put('/:id', async (c) => {
  const role = (c as any).get('userRole')
  if (role !== 'admin') return c.json({ error: '권한이 없습니다.' }, 403)

  const id = c.req.param('id')
  const { title, content, is_pinned } = await c.req.json()

  await c.env.DB.prepare(
    'UPDATE notices SET title = ?, content = ?, is_pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(title, content, is_pinned ? 1 : 0, Number(id)).run()

  return c.json({ success: true })
})

// 공지 삭제 (관리자 전용)
notices.delete('/:id', async (c) => {
  const role = (c as any).get('userRole')
  if (role !== 'admin') return c.json({ error: '권한이 없습니다.' }, 403)

  await c.env.DB.prepare('DELETE FROM notices WHERE id = ?').bind(Number(c.req.param('id'))).run()
  return c.json({ success: true })
})

export default notices
