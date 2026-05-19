import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'

type Bindings = { DB: D1Database }

const messages = new Hono<{ Bindings: Bindings }>()

// 인증 미들웨어
messages.use('*', async (c, next) => {
  const sessionId = getCookie(c, 'session')
  if (!sessionId) return c.json({ error: '로그인이 필요합니다.' }, 401)
  const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?')
    .bind(Number(sessionId)).first<{ id: number; role: string }>()
  if (!user) return c.json({ error: '인증 실패.' }, 401)
  c.set('userId' as never, user.id)
  c.set('userRole' as never, user.role)
  await next()
})

// 채널 메시지 목록
messages.get('/channel/:channel', async (c) => {
  const channel = c.req.param('channel')
  const { results } = await c.env.DB.prepare(`
    SELECT m.*, u.name as sender_name, u.department as sender_department, u.position as sender_position
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.channel = ?
    ORDER BY m.created_at ASC
    LIMIT 100
  `).bind(channel).all()
  return c.json(results)
})

// 1:1 메시지 목록
messages.get('/dm/:userId', async (c) => {
  const myId = (c as any).get('userId')
  const otherId = Number(c.req.param('userId'))

  const { results } = await c.env.DB.prepare(`
    SELECT m.*, u.name as sender_name, u.department as sender_department
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE (m.sender_id = ? AND m.receiver_id = ?)
       OR (m.sender_id = ? AND m.receiver_id = ?)
    ORDER BY m.created_at ASC
    LIMIT 100
  `).bind(myId, otherId, otherId, myId).all()

  // 읽음 처리
  await c.env.DB.prepare(
    'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0'
  ).bind(otherId, myId).run()

  return c.json(results)
})

// 채널에 메시지 전송
messages.post('/channel/:channel', async (c) => {
  const senderId = (c as any).get('userId')
  const channel = c.req.param('channel')
  const { content } = await c.req.json()

  if (!content?.trim()) return c.json({ error: '메시지를 입력해주세요.' }, 400)

  const result = await c.env.DB.prepare(
    'INSERT INTO messages (sender_id, channel, content) VALUES (?, ?, ?)'
  ).bind(senderId, channel, content.trim()).run()

  const msg = await c.env.DB.prepare(`
    SELECT m.*, u.name as sender_name, u.department as sender_department, u.position as sender_position
    FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?
  `).bind(result.meta.last_row_id).first()

  return c.json({ success: true, message: msg })
})

// 1:1 메시지 전송
messages.post('/dm/:userId', async (c) => {
  const senderId = (c as any).get('userId')
  const receiverId = Number(c.req.param('userId'))
  const { content } = await c.req.json()

  if (!content?.trim()) return c.json({ error: '메시지를 입력해주세요.' }, 400)

  const result = await c.env.DB.prepare(
    'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)'
  ).bind(senderId, receiverId, content.trim()).run()

  const msg = await c.env.DB.prepare(`
    SELECT m.*, u.name as sender_name, u.department as sender_department
    FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?
  `).bind(result.meta.last_row_id).first()

  return c.json({ success: true, message: msg })
})

// 안읽은 메시지 수
messages.get('/unread', async (c) => {
  const userId = (c as any).get('userId')
  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM messages WHERE receiver_id = ? AND is_read = 0'
  ).bind(userId).first<{ total: number }>()
  return c.json({ unread: count?.total || 0 })
})

// 대화 상대 목록 (DM)
messages.get('/contacts', async (c) => {
  const userId = (c as any).get('userId')
  const { results } = await c.env.DB.prepare(`
    SELECT DISTINCT
      CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END as contact_id,
      u.name as contact_name, u.department, u.position,
      (SELECT content FROM messages WHERE ((sender_id = ? AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = ?)) ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages WHERE ((sender_id = ? AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = ?)) ORDER BY created_at DESC LIMIT 1) as last_at,
      (SELECT COUNT(*) FROM messages WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0) as unread_count
    FROM messages m
    JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
    WHERE (m.sender_id = ? OR m.receiver_id = ?) AND m.receiver_id IS NOT NULL
    ORDER BY last_at DESC
  `).bind(userId, userId, userId, userId, userId, userId, userId, userId, userId).all()
  return c.json(results)
})

export default messages
