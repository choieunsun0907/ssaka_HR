import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import auth from './routes/auth'
import users from './routes/users'
import leaves from './routes/leaves'
import notices from './routes/notices'
import messages from './routes/messages'
import settingsRoute from './routes/settings'
import webhookRoute from './routes/webhook'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({ origin: '*', credentials: true }))

// 헬스체크
app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))

// 공개 시스템 설정 (로그인 불필요) - settingsRoute 보다 반드시 먼저 등록
app.get('/api/settings/public', async (c) => {
  const publicKeys = ['show_test_accounts', 'login_notice', 'site_title']
  const results = await Promise.all(
    publicKeys.map(k => c.env.DB.prepare('SELECT key, value FROM settings WHERE key=?').bind(k).first<{key:string;value:string}>())
  )
  const map: Record<string, string> = {}
  results.forEach(r => { if (r) map[r.key] = r.value })
  return c.json(map)
})

// ── 공개 데이터 API (인증 불필요 - Apps Script / 외부 연동용) ──────
// 직원 목록
app.get('/api/public/employees', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, employee_id, department, position FROM users ORDER BY department, name'
  ).all()
  return c.json(results)
})

// 부서 목록
app.get('/api/public/departments', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name FROM departments ORDER BY name'
  ).all()
  return c.json(results)
})

// 직급 목록
app.get('/api/public/positions', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, name FROM positions ORDER BY name'
  ).all()
  return c.json(results)
})

// API 라우트
app.route('/api/auth', auth)
app.route('/api/users', users)
app.route('/api/leaves', leaves)
app.route('/api/notices', notices)
app.route('/api/messages', messages)
app.route('/api/settings', settingsRoute)
app.route('/api/webhook', webhookRoute)  // 구글 폼 연동 (인증 불필요)

// 정적 파일 서빙
app.use('/static/*', serveStatic({ root: './public' }))

// SPA 핵심 HTML (단일 파일 앱)
app.get('*', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>사내 HR 시스템</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Pretendard', 'Apple SD Gothic Neo', sans-serif; }
    .sidebar-link { transition: all .15s; }
    .sidebar-link:hover, .sidebar-link.active { background: rgba(255,255,255,0.15); }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    .badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .badge-pending   { background: #fef3c7; color: #92400e; }
    .badge-approved  { background: #d1fae5; color: #065f46; }
    .badge-rejected  { background: #fee2e2; color: #991b1b; }
    .badge-admin     { background: #ede9fe; color: #5b21b6; }
    .badge-employee  { background: #e0f2fe; color: #0369a1; }
    .msg-bubble-mine   { background: #4f46e5; color: #fff; border-radius: 18px 18px 4px 18px; }
    .msg-bubble-other  { background: #f1f5f9; color: #1e293b; border-radius: 18px 18px 18px 4px; }
    .scroll-hide::-webkit-scrollbar { display: none; }
    .scroll-hide { -ms-overflow-style: none; scrollbar-width: none; }
    .chat-scroll { scroll-behavior: smooth; }
    #toast { transition: opacity .3s, transform .3s; }
    .leave-bar { height: 8px; border-radius: 4px; background: #e2e8f0; overflow: hidden; }
    .leave-bar-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, #4f46e5, #818cf8); transition: width .6s; }
    .modal-overlay { background: rgba(0,0,0,.4); backdrop-filter: blur(2px); }
    input, textarea, select { outline: none; }
    input:focus, textarea:focus, select:focus { box-shadow: 0 0 0 2px rgba(79,70,229,.3); }
    @media (max-width: 768px) {
      #sidebar { transform: translateX(-100%); position: fixed; z-index: 40; height: 100vh; transition: transform .3s; }
      #sidebar.open { transform: translateX(0); }
    }
  </style>
</head>
<body class="bg-slate-100 min-h-screen">

<!-- 로그인 화면 -->
<div id="login-page" class="min-h-screen flex items-center justify-center p-4">
  <div class="card w-full max-w-md p-8">
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4">
        <i class="fas fa-building text-white text-2xl"></i>
      </div>
      <h1 class="text-2xl font-bold text-slate-800">사내 HR 시스템</h1>
      <p class="text-slate-500 text-sm mt-1">로그인하여 시작하세요</p>
    </div>

    <!-- 테스트 계정 탭 -->
    <div class="mb-5" id="login-test-section">
      <p class="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">테스트 계정으로 빠른 로그인</p>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" onclick="fillAccount('admin@company.com','admin123', this)"
          class="quick-login-btn flex items-center gap-2.5 p-3 rounded-xl border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left group">
          <div class="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0 group-hover:bg-purple-200 transition">
            <i class="fas fa-user-shield text-purple-600 text-xs"></i>
          </div>
          <div>
            <div class="text-xs font-bold text-slate-700">관리자</div>
            <div class="text-xs text-slate-400">김관리 · 경영지원</div>
          </div>
        </button>
        <button type="button" onclick="fillAccount('dev1@company.com','pass123', this)"
          class="quick-login-btn flex items-center gap-2.5 p-3 rounded-xl border-2 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left group">
          <div class="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition">
            <i class="fas fa-user text-blue-600 text-xs"></i>
          </div>
          <div>
            <div class="text-xs font-bold text-slate-700">일반 직원</div>
            <div class="text-xs text-slate-400">이개발 · 개발팀</div>
          </div>
        </button>
      </div>
    </div>

    <div class="flex items-center gap-3 mb-5">
      <div class="flex-1 border-t border-slate-200"></div>
      <span class="text-xs text-slate-400">또는 직접 입력</span>
      <div class="flex-1 border-t border-slate-200"></div>
    </div>

    <form id="login-form" class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1">이메일</label>
        <input type="email" id="login-email" placeholder="email@company.com"
          class="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm" required />
      </div>
      <div>
        <label class="block text-sm font-medium text-slate-700 mb-1">비밀번호</label>
        <input type="password" id="login-password" placeholder="••••••••"
          class="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm" required />
      </div>
      <div id="login-error" class="text-red-500 text-sm hidden"></div>
      <button type="submit" class="w-full bg-indigo-600 text-white rounded-lg py-2.5 font-semibold hover:bg-indigo-700 transition">
        로그인
      </button>
    </form>
  </div>
</div>

<!-- 메인 앱 (로그인 후) -->
<div id="app-layout" class="hidden flex min-h-screen">
  <!-- 사이드바 -->
  <aside id="sidebar" class="w-64 bg-indigo-700 flex flex-col shrink-0">
    <div class="px-5 py-5 border-b border-indigo-600">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
          <i class="fas fa-building text-white text-sm"></i>
        </div>
        <div>
          <div class="text-white font-bold text-sm leading-tight">사내 HR 시스템</div>
          <div class="text-indigo-200 text-xs">인사관리 플랫폼</div>
        </div>
      </div>
    </div>

    <!-- 사용자 프로필 -->
    <div class="px-5 py-4 border-b border-indigo-600">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 bg-indigo-500 rounded-full flex items-center justify-center" id="nav-avatar">
          <span class="text-white text-sm font-bold" id="nav-initial">?</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-white text-sm font-semibold truncate" id="nav-name">-</div>
          <div class="text-indigo-200 text-xs truncate" id="nav-dept">-</div>
        </div>
      </div>
    </div>

    <nav class="flex-1 px-3 py-4 space-y-1">
      <button onclick="navigate('hr')" id="menu-hr"
        class="sidebar-link w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-100 text-sm" data-page="hr">
        <i class="fas fa-users w-4 text-center"></i> 인사 관리
      </button>
      <button onclick="navigate('leave')" id="menu-leave"
        class="sidebar-link w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-100 text-sm" data-page="leave">
        <i class="fas fa-calendar-check w-4 text-center"></i> 연차 관리
        <span id="pending-badge" class="ml-auto badge" style="background:rgba(255,255,255,.2);color:#fff;display:none"></span>
      </button>
      <button onclick="navigate('notice')" id="menu-notice"
        class="sidebar-link w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-100 text-sm" data-page="notice">
        <i class="fas fa-bullhorn w-4 text-center"></i> 공지사항
      </button>
      <button onclick="navigate('chat')" id="menu-chat"
        class="sidebar-link w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-100 text-sm" data-page="chat">
        <i class="fas fa-comments w-4 text-center"></i> 사내 메신저
        <span id="unread-badge" class="ml-auto badge" style="background:rgba(255,100,100,.8);color:#fff;display:none"></span>
      </button>
      <!-- 관리자 전용 설정 메뉴 -->
      <button onclick="navigate('settings')" id="menu-settings"
        class="sidebar-link w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-100 text-sm" data-page="settings" style="display:none">
        <i class="fas fa-cog w-4 text-center"></i> 설정
      </button>
    </nav>

    <div class="px-3 py-4 border-t border-indigo-600">
      <button onclick="logout()" class="sidebar-link w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-200 text-sm hover:text-white">
        <i class="fas fa-sign-out-alt w-4 text-center"></i> 로그아웃
      </button>
    </div>
  </aside>

  <!-- 메인 콘텐츠 -->
  <main class="flex-1 overflow-auto">
    <!-- 모바일 헤더 -->
    <div class="md:hidden bg-indigo-700 px-4 py-3 flex items-center gap-3">
      <button onclick="document.getElementById('sidebar').classList.toggle('open')" class="text-white">
        <i class="fas fa-bars text-lg"></i>
      </button>
      <span class="text-white font-semibold">사내 HR 시스템</span>
    </div>

    <div id="page-content" class="p-6 max-w-6xl mx-auto"></div>
  </main>
</div>

<!-- 토스트 알림 -->
<div id="toast" class="fixed bottom-6 right-6 z-50 opacity-0 translate-y-4 pointer-events-none">
  <div class="bg-slate-800 text-white px-5 py-3 rounded-xl shadow-xl text-sm flex items-center gap-2">
    <i id="toast-icon" class="fas fa-check-circle text-green-400"></i>
    <span id="toast-msg"></span>
  </div>
</div>

<!-- 모달 -->
<div id="modal-overlay" class="modal-overlay fixed inset-0 z-50 items-center justify-center hidden">
  <div id="modal-box" class="card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
    <div class="flex items-center justify-between px-6 py-4 border-b">
      <h3 id="modal-title" class="text-lg font-bold text-slate-800"></h3>
      <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 text-xl"><i class="fas fa-times"></i></button>
    </div>
    <div id="modal-body" class="p-6"></div>
  </div>
</div>

<script>
// ==================== 전역 상태 ====================
let currentUser = null;
let currentPage = 'hr';
let chatPollingInterval = null;
let unreadPollingInterval = null;
let currentChannel = 'general';
let currentDmUser = null;

const CHANNELS = [
  { id: 'general', name: '전체 채널', icon: 'fa-hashtag' },
  { id: 'hr', name: '인사팀', icon: 'fa-hashtag' },
  { id: 'dev', name: '개발팀', icon: 'fa-hashtag' },
  { id: 'design', name: '디자인팀', icon: 'fa-hashtag' },
  { id: 'marketing', name: '마케팅팀', icon: 'fa-hashtag' },
];

// ==================== 유틸 ====================
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  document.getElementById('toast-msg').textContent = msg;
  icon.className = 'fas ' + (type === 'success' ? 'fa-check-circle text-green-400' : 'fa-exclamation-circle text-red-400');
  el.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
  el.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => {
    el.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
    el.classList.remove('opacity-100', 'translate-y-0');
  }, 3000);
}

function openModal(title, bodyHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-overlay').classList.add('flex');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-overlay').classList.remove('flex');
}
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  return res.json();
}

function formatDate(d) {
  if (!d) return '-';
  return d.substring(0, 10);
}
function formatDateTime(d) {
  if (!d) return '-';
  return d.replace('T', ' ').substring(0, 16);
}
function timeAgo(d) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return Math.floor(diff/60) + '분 전';
  if (diff < 86400) return Math.floor(diff/3600) + '시간 전';
  return formatDate(d);
}

// ==================== 인증 ====================
async function doLogin(email, password) {
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  const res = await api('POST', '/auth/login', { email, password });
  if (res.error) {
    errEl.textContent = res.error;
    errEl.classList.remove('hidden');
    return;
  }
  currentUser = res.user;
  initApp();
}

// 테스트 계정 탭 클릭 → 입력창 채우기 + 즉시 자동 로그인
async function fillAccount(email, password, btn) {
  // 입력창에 값 채우기
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-password');
  emailEl.value = email;
  passEl.value  = password;

  // 선택된 탭 강조 표시
  document.querySelectorAll('.quick-login-btn').forEach(b => {
    b.classList.remove('border-indigo-500', 'bg-indigo-50', 'ring-2', 'ring-indigo-200');
    b.disabled = false;
  });
  btn.classList.add('border-indigo-500', 'bg-indigo-50', 'ring-2', 'ring-indigo-200');

  // 버튼에 로딩 표시
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<div class="flex items-center gap-2"><i class="fas fa-spinner fa-spin text-indigo-500"></i><span class="text-xs text-slate-600">로그인 중...</span></div>';
  btn.disabled = true;

  // 즉시 로그인 시도
  await doLogin(email, password);

  // 실패 시 버튼 복구
  btn.innerHTML = originalHTML;
  btn.disabled = false;
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  await doLogin(email, password);
});

async function logout() {
  await api('POST', '/auth/logout');
  currentUser = null;
  clearInterval(chatPollingInterval);
  clearInterval(unreadPollingInterval);
  document.getElementById('app-layout').classList.add('hidden');
  document.getElementById('login-page').classList.remove('hidden');
}

async function initApp() {
  document.getElementById('login-page').classList.add('hidden');
  document.getElementById('app-layout').classList.remove('hidden');
  document.getElementById('app-layout').classList.add('flex');

  document.getElementById('nav-name').textContent = currentUser.name;
  document.getElementById('nav-dept').textContent = currentUser.department + ' · ' + currentUser.position;
  document.getElementById('nav-initial').textContent = currentUser.name[0];

  // 일반 직원이면 인사관리 메뉴 비활성화
  const hrMenu = document.getElementById('menu-hr');
  if (hrMenu) {
    if (currentUser.role !== 'admin') {
      hrMenu.disabled = true;
      hrMenu.classList.add('opacity-40', 'cursor-not-allowed');
      hrMenu.classList.remove('hover:bg-white/15');
      hrMenu.onclick = null;
      hrMenu.title = '관리자만 접근 가능합니다';
    } else {
      hrMenu.disabled = false;
      hrMenu.classList.remove('opacity-40', 'cursor-not-allowed');
    }
  }
  // 관리자이면 설정 메뉴 표시
  const settingsMenu = document.getElementById('menu-settings');
  if (settingsMenu) {
    settingsMenu.style.display = currentUser.role === 'admin' ? '' : 'none';
  }

  // 새로고침 시 마지막 페이지 복원, 없으면 기본 페이지
  const savedPage = sessionStorage.getItem('currentPage');
  const defaultPage = currentUser.role === 'admin' ? 'hr' : 'leave';
  const startPage = savedPage || defaultPage;
  // 일반 직원이 hr 페이지 저장돼있으면 기본으로 이동
  const goPage = (startPage === 'hr' && currentUser.role !== 'admin') ? 'leave' : startPage;

  startUnreadPolling();
  navigate(goPage);
}

// ==================== 네비게이션 ====================
function navigate(page) {
  const sidebar = document.getElementById('sidebar');
  // 일반 직원 hr 페이지 접근 차단
  if (page === 'hr' && currentUser && currentUser.role !== 'admin') return;
  // 이미 활성화된 메뉴를 다시 클릭하면 사이드바 토글
  if (currentPage === page) {
    sidebar?.classList.toggle('open');
    return;
  }
  currentPage = page;
  // 현재 페이지 세션에 저장 (새로고침 복원용)
  sessionStorage.setItem('currentPage', page);
  document.querySelectorAll('.sidebar-link[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // 모바일에서 메뉴 선택 후 사이드바 닫기
  if (window.innerWidth < 768) {
    sidebar?.classList.remove('open');
  }
  clearInterval(chatPollingInterval);
  renderPage(page);
}

function renderPage(page) {
  const c = document.getElementById('page-content');
  if (page === 'hr') renderHR(c);
  else if (page === 'leave') renderLeave(c);
  else if (page === 'notice') renderNotice(c);
  else if (page === 'chat') renderChat(c);
  else if (page === 'settings') renderSettings(c);
}

// ==================== 인사 관리 ====================
let hrAllUsers = [];
let hrFilterDept = 'all';
let hrChecked = new Set();

async function renderHR(container) {
  hrChecked = new Set();
  const users = await api('GET', '/users');
  if (users.error) { container.innerHTML = \`<p class="text-red-500">\${users.error}</p>\`; return; }
  hrAllUsers = users;

  // 부서 목록 추출
  const depts = [...new Set(users.map(u => u.department))].sort();

  container.innerHTML = \`
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h2 class="text-xl font-bold text-slate-800">인사 관리</h2>
        <p class="text-slate-500 text-sm mt-0.5">구성원 정보 조회 및 관리</p>
      </div>
      \${currentUser.role === 'admin' ? \`
      <div class="flex flex-wrap gap-2">
        <button onclick="downloadChecked()" id="btn-download" class="hidden bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition flex items-center gap-2">
          <i class="fas fa-file-excel"></i> 선택 다운로드 (<span id="checked-count">0</span>명)
        </button>
        <button onclick="openExcelUploadModal()" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 transition flex items-center gap-2">
          <i class="fas fa-upload text-green-600"></i> 엑셀 업로드
        </button>
        <button onclick="openAddUserModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition flex items-center gap-2">
          <i class="fas fa-plus"></i> 직원 추가
        </button>
      </div>\` : ''}
    </div>

    <!-- 팀별 필터 탭 -->
    <div class="flex flex-wrap gap-2 mb-5" id="dept-filter">
      <button onclick="setDeptFilter('all')" class="dept-tab px-4 py-1.5 rounded-full text-sm font-medium transition border \${hrFilterDept==='all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'}">
        전체 <span class="ml-1 text-xs opacity-70">\${users.length}</span>
      </button>
      \${depts.map(d => \`
        <button onclick="setDeptFilter('\${d}')" class="dept-tab px-4 py-1.5 rounded-full text-sm font-medium transition border \${hrFilterDept===d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'}">
          \${d} <span class="ml-1 text-xs opacity-70">\${users.filter(u=>u.department===d).length}</span>
        </button>
      \`).join('')}
    </div>

    <div id="hr-list"></div>
  \`;

  renderHRList();
}

function setDeptFilter(dept) {
  hrFilterDept = dept;
  // 탭 스타일 업데이트
  document.querySelectorAll('.dept-tab').forEach(btn => {
    const isActive = btn.textContent.trim().startsWith(dept === 'all' ? '전체' : dept);
    btn.className = \`dept-tab px-4 py-1.5 rounded-full text-sm font-medium transition border \${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'}\`;
  });
  renderHRList();
}

function renderHRList() {
  const listEl = document.getElementById('hr-list');
  if (!listEl) return;

  const filtered = hrFilterDept === 'all'
    ? hrAllUsers
    : hrAllUsers.filter(u => u.department === hrFilterDept);

  if (!filtered.length) {
    listEl.innerHTML = \`<div class="card py-16 text-center text-slate-400"><i class="fas fa-users text-4xl mb-3 block"></i>해당 부서 직원이 없습니다.</div>\`;
    return;
  }

  // 부서별 그룹핑
  const deptMap = {};
  filtered.forEach(u => {
    if (!deptMap[u.department]) deptMap[u.department] = [];
    deptMap[u.department].push(u);
  });

  let html = \`<div class="space-y-5">\`;
  for (const [dept, members] of Object.entries(deptMap)) {
    html += \`
      <div class="card overflow-hidden">
        <div class="px-5 py-3 bg-slate-50 border-b flex items-center gap-2">
          \${currentUser.role === 'admin' ? \`
          <input type="checkbox" class="dept-check rounded border-slate-300 text-indigo-600"
            onchange="toggleDeptCheck('\${dept}', this.checked)"
            title="\${dept} 전체 선택" />\` : ''}
          <i class="fas fa-layer-group text-indigo-500 text-sm"></i>
          <span class="font-semibold text-slate-700 text-sm">\${dept}</span>
          <span class="text-slate-400 text-xs">\${members.length}명</span>
        </div>
        <div class="divide-y">
    \`;
    members.forEach(u => {
      html += \`
        <div class="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition" id="hr-row-\${u.id}">
          \${currentUser.role === 'admin' ? \`
          <input type="checkbox" class="user-check rounded border-slate-300 text-indigo-600 shrink-0"
            data-id="\${u.id}" onchange="toggleUserCheck(\${u.id}, this.checked)" \${hrChecked.has(u.id) ? 'checked' : ''} />\` : ''}
          <div class="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onclick="openUserDetail(\${u.id})">
            <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <span class="text-indigo-600 font-bold">\${u.name[0]}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-slate-800">\${u.name}</span>
                <span class="badge \${u.role === 'admin' ? 'badge-admin' : 'badge-employee'}">\${u.role === 'admin' ? '관리자' : '직원'}</span>
              </div>
              <div class="text-slate-500 text-xs mt-0.5">\${u.position} · \${u.employee_id}</div>
            </div>
            <div class="text-right hidden sm:block shrink-0">
              <div class="text-slate-500 text-xs">입사일</div>
              <div class="text-slate-700 text-sm">\${formatDate(u.hire_date)}</div>
            </div>
            <div class="text-right hidden md:block shrink-0">
              <div class="text-slate-500 text-xs">연락처</div>
              <div class="text-slate-700 text-sm">\${u.phone || '-'}</div>
            </div>
          </div>
          \${currentUser.role === 'admin' ? \`
          <div class="flex gap-1 shrink-0">
            <button onclick="openEditUserModal(\${u.id})" class="text-slate-400 hover:text-indigo-600 transition text-sm px-2 py-1"><i class="fas fa-edit"></i></button>
            <button onclick="deleteUser(\${u.id})" class="text-slate-400 hover:text-red-500 transition text-sm px-2 py-1"><i class="fas fa-trash"></i></button>
          </div>\` : ''}
        </div>
      \`;
    });
    html += \`</div></div>\`;
  }
  html += \`</div>\`;
  listEl.innerHTML = html;
}

// 체크박스 관리
function toggleUserCheck(id, checked) {
  if (checked) hrChecked.add(id); else hrChecked.delete(id);
  updateDownloadBtn();
}
function toggleDeptCheck(dept, checked) {
  hrAllUsers.filter(u => u.department === dept).forEach(u => {
    if (checked) hrChecked.add(u.id); else hrChecked.delete(u.id);
    const cb = document.querySelector(\`.user-check[data-id="\${u.id}"]\`);
    if (cb) cb.checked = checked;
  });
  updateDownloadBtn();
}
function updateDownloadBtn() {
  const btn = document.getElementById('btn-download');
  const cnt = document.getElementById('checked-count');
  if (!btn) return;
  if (hrChecked.size > 0) {
    btn.classList.remove('hidden');
    btn.classList.add('flex');
    if (cnt) cnt.textContent = hrChecked.size;
  } else {
    btn.classList.add('hidden');
    btn.classList.remove('flex');
  }
}

// ── 엑셀 다운로드 ──
function downloadChecked() {
  const rows = hrChecked.size > 0
    ? hrAllUsers.filter(u => hrChecked.has(u.id))
    : hrAllUsers;

  const headers = ['사원번호','이름','이메일','부서','직급','입사일','연락처','권한','연차총일수'];
  const data = [headers, ...rows.map(u => [
    u.employee_id, u.name, u.email, u.department, u.position,
    u.hire_date, u.phone||'', u.role==='admin'?'관리자':'직원', u.annual_leave_total
  ])];

  // SheetJS로 엑셀 생성
  const ws = XLSX.utils.aoa_to_sheet(data);
  // 열 너비 설정
  ws['!cols'] = [10,8,24,10,8,12,14,8,10].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '직원목록');
  XLSX.writeFile(wb, \`직원목록_\${new Date().toISOString().slice(0,10)}.xlsx\`);
  showToast(\`\${rows.length}명 다운로드 완료\`);
}

// ── 엑셀 업로드 모달 ──
function openExcelUploadModal() {
  openModal('엑셀로 직원 일괄 추가', \`
    <div class="space-y-4">
      <!-- 양식 다운로드 -->
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <i class="fas fa-info-circle text-blue-500 mt-0.5"></i>
        <div class="flex-1 text-sm text-blue-700">
          <p class="font-semibold mb-1">엑셀 업로드 양식 안내</p>
          <p class="text-xs text-blue-600">아래 양식을 다운로드 후 작성하여 업로드해 주세요.</p>
          <button onclick="downloadTemplate()" class="mt-2 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition flex items-center gap-1.5 w-fit">
            <i class="fas fa-download"></i> 양식 다운로드 (.xlsx)
          </button>
        </div>
      </div>

      <!-- 컬럼 설명 -->
      <div class="bg-slate-50 rounded-xl p-3 text-xs text-slate-600">
        <p class="font-semibold mb-1.5 text-slate-700">필수 컬럼 (1행: 헤더)</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1">
          <span>• <b>사원번호</b> (예: EMP007)</span>
          <span>• <b>이름</b></span>
          <span>• <b>이메일</b></span>
          <span>• <b>비밀번호</b></span>
          <span>• <b>부서</b> (예: 개발팀)</span>
          <span>• <b>직급</b> (예: 대리)</span>
          <span>• <b>입사일</b> (예: 2024-01-15)</span>
          <span>• 연락처 (선택)</span>
          <span>• 연차총일수 (기본 15)</span>
        </div>
      </div>

      <!-- 파일 업로드 -->
      <div id="upload-drop"
        class="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition cursor-pointer"
        onclick="document.getElementById('excel-file-input').click()"
        ondragover="event.preventDefault();this.classList.add('border-indigo-400','bg-indigo-50')"
        ondragleave="this.classList.remove('border-indigo-400','bg-indigo-50')"
        ondrop="handleExcelDrop(event)">
        <i class="fas fa-file-excel text-green-500 text-3xl mb-2 block"></i>
        <p class="text-sm font-medium text-slate-700">클릭하거나 파일을 끌어다 놓으세요</p>
        <p class="text-xs text-slate-400 mt-1">.xlsx, .xls 파일만 지원</p>
      </div>
      <input type="file" id="excel-file-input" accept=".xlsx,.xls" class="hidden" onchange="handleExcelFile(this.files[0])" />

      <!-- 미리보기 영역 -->
      <div id="excel-preview" class="hidden"></div>
    </div>
  \`);
}

function downloadTemplate() {
  const headers = ['사원번호','이름','이메일','비밀번호','부서','직급','입사일','연락처','연차총일수'];
  const sample  = ['EMP007','홍길동','hong@company.com','pass123','개발팀','대리','2024-01-15','010-1234-5678',15];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws['!cols'] = [12,8,24,12,10,8,12,14,10].map(w=>({wch:w}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '직원추가양식');
  XLSX.writeFile(wb, '직원추가_양식.xlsx');
}

function handleExcelDrop(e) {
  e.preventDefault();
  document.getElementById('upload-drop').classList.remove('border-indigo-400','bg-indigo-50');
  const file = e.dataTransfer.files[0];
  if (file) handleExcelFile(file);
}

function handleExcelFile(file) {
  if (!file) return;
  if (!new RegExp('\\.xlsx?$','i').test(file.name)) { showToast('xlsx 또는 xls 파일만 지원합니다.','error'); return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    const wb = XLSX.read(e.target.result, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (rows.length < 2) { showToast('데이터가 없습니다.','error'); return; }

    const header = rows[0].map(h => String(h).trim());
    const colMap = {
      employee_id:        header.findIndex(h => h.includes('사원번호')),
      name:               header.findIndex(h => h === '이름'),
      email:              header.findIndex(h => h.includes('이메일')),
      password:           header.findIndex(h => h.includes('비밀번호')),
      department:         header.findIndex(h => h.includes('부서')),
      position:           header.findIndex(h => h.includes('직급')),
      hire_date:          header.findIndex(h => h.includes('입사일')),
      phone:              header.findIndex(h => h.includes('연락처')),
      annual_leave_total: header.findIndex(h => h.includes('연차')),
    };

    const required = ['employee_id','name','email','password','department','position','hire_date'];
    const missing = required.filter(k => colMap[k] === -1);
    if (missing.length) { showToast('필수 컬럼 누락: ' + missing.join(', '),'error'); return; }

    const data = rows.slice(1).filter(r => r.some(c => c !== '')).map(r => ({
      employee_id:        String(r[colMap.employee_id]||'').trim(),
      name:               String(r[colMap.name]||'').trim(),
      email:              String(r[colMap.email]||'').trim(),
      password:           String(r[colMap.password]||'').trim(),
      department:         String(r[colMap.department]||'').trim(),
      position:           String(r[colMap.position]||'').trim(),
      hire_date:          formatExcelDate(r[colMap.hire_date]),
      phone:              colMap.phone !== -1 ? String(r[colMap.phone]||'').trim() : '',
      annual_leave_total: colMap.annual_leave_total !== -1 ? Number(r[colMap.annual_leave_total])||15 : 15,
    }));

    showExcelPreview(data);
  };
  reader.readAsArrayBuffer(file);
}

function formatExcelDate(val) {
  if (!val) return '';
  // 엑셀 날짜 숫자 처리
  if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0,10);
  }
  return String(val).trim().replace(/[./]/g, '-');
}

// 전역 변수에 엑셀 데이터 저장 (onclick 속성에 데이터 직접 넣지 않음)
let _excelUploadData = [];

function showExcelPreview(data) {
  _excelUploadData = data;  // 전역 저장
  const prev = document.getElementById('excel-preview');
  if (!prev) return;
  prev.classList.remove('hidden');

  let html = \`
    <div class="border border-slate-200 rounded-xl overflow-hidden">
      <div class="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
        <span class="text-sm font-semibold text-slate-700">미리보기 — \${data.length}명</span>
        <button id="btn-submit-excel" onclick="submitExcelUpload()"
          class="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition flex items-center gap-1.5">
          <i class="fas fa-upload"></i> 일괄 등록
        </button>
      </div>
      <div class="overflow-x-auto max-h-60 overflow-y-auto">
        <table class="w-full text-xs">
          <thead class="bg-slate-100 sticky top-0">
            <tr>
              <th class="px-3 py-2 text-left text-slate-500 font-medium">사원번호</th>
              <th class="px-3 py-2 text-left text-slate-500 font-medium">이름</th>
              <th class="px-3 py-2 text-left text-slate-500 font-medium">부서</th>
              <th class="px-3 py-2 text-left text-slate-500 font-medium">직급</th>
              <th class="px-3 py-2 text-left text-slate-500 font-medium">입사일</th>
              <th class="px-3 py-2 text-left text-slate-500 font-medium">이메일</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            \${data.map(r => \`
              <tr class="hover:bg-slate-50">
                <td class="px-3 py-2 text-slate-700">\${escapeHtml(r.employee_id)}</td>
                <td class="px-3 py-2 font-medium text-slate-800">\${escapeHtml(r.name)}</td>
                <td class="px-3 py-2 text-slate-600">\${escapeHtml(r.department)}</td>
                <td class="px-3 py-2 text-slate-600">\${escapeHtml(r.position)}</td>
                <td class="px-3 py-2 text-slate-600">\${escapeHtml(r.hire_date)}</td>
                <td class="px-3 py-2 text-slate-500">\${escapeHtml(r.email)}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  \`;
  prev.innerHTML = html;
}

async function submitExcelUpload() {
  const data = _excelUploadData;
  if (!data || !data.length) { showToast('등록할 데이터가 없습니다.', 'error'); return; }

  const btn = document.getElementById('btn-submit-excel');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 등록 중...'; }

  let ok = 0, fail = 0, failList = [];
  for (const user of data) {
    const res = await api('POST', '/users', user);
    if (res.error) { fail++; failList.push(user.name + '(' + res.error + ')'); }
    else ok++;
  }

  if (fail > 0 && ok === 0) {
    // 전부 실패
    const btn2 = document.getElementById('btn-submit-excel');
    if (btn2) { btn2.disabled = false; btn2.innerHTML = '<i class="fas fa-upload"></i> 일괄 등록'; }
    const prev = document.getElementById('excel-preview');
    if (prev) {
      const errDiv = document.createElement('div');
      errDiv.className = 'mt-3 bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 space-y-1';
      errDiv.innerHTML = '<p class="font-semibold mb-1">등록 실패 목록</p>' +
        failList.map(f => '<p>• ' + escapeHtml(f) + '</p>').join('');
      prev.appendChild(errDiv);
    }
    showToast(\`\${fail}명 등록 실패\`, 'error');
    return;
  }
  closeModal();
  _excelUploadData = [];
  if (fail > 0) {
    showToast(\`\${ok}명 등록 완료, \${fail}명 실패 (중복 제외)\`, 'error');
  } else {
    showToast(\`\${ok}명 일괄 등록 완료!\`);
  }
  renderHR(document.getElementById('page-content'));
}

async function openUserDetail(id) {
  const u = await api('GET', '/users/' + id);
  const stats = await api('GET', '/leaves/stats?user_id=' + id);
  openModal(u.name + ' 님의 정보', \`
    <div class="space-y-4">
      <div class="flex items-center gap-4">
        <div class="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600">\${u.name[0]}</div>
        <div>
          <div class="text-xl font-bold text-slate-800">\${u.name}</div>
          <div class="text-slate-500">\${u.department} · \${u.position}</div>
          <span class="badge \${u.role === 'admin' ? 'badge-admin' : 'badge-employee'} mt-1">\${u.role === 'admin' ? '관리자' : '직원'}</span>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="bg-slate-50 rounded-lg p-3"><div class="text-slate-500 text-xs mb-1">사원번호</div><div class="font-medium">\${u.employee_id}</div></div>
        <div class="bg-slate-50 rounded-lg p-3"><div class="text-slate-500 text-xs mb-1">이메일</div><div class="font-medium truncate">\${u.email}</div></div>
        <div class="bg-slate-50 rounded-lg p-3"><div class="text-slate-500 text-xs mb-1">입사일</div><div class="font-medium">\${formatDate(u.hire_date)}</div></div>
        <div class="bg-slate-50 rounded-lg p-3"><div class="text-slate-500 text-xs mb-1">연락처</div><div class="font-medium">\${u.phone || '-'}</div></div>
      </div>
      \${!stats.error ? \`
      <div class="bg-indigo-50 rounded-xl p-4">
        <div class="text-sm font-semibold text-indigo-700 mb-3">연차 현황</div>
        <div class="grid grid-cols-3 gap-3 text-center mb-3">
          <div><div class="text-xl font-bold text-slate-800">\${stats.total}</div><div class="text-xs text-slate-500">총 연차</div></div>
          <div><div class="text-xl font-bold text-indigo-600">\${stats.used}</div><div class="text-xs text-slate-500">사용</div></div>
          <div><div class="text-xl font-bold text-green-600">\${stats.remaining}</div><div class="text-xs text-slate-500">잔여</div></div>
        </div>
        <div class="leave-bar"><div class="leave-bar-fill" style="width:\${(stats.used/stats.total*100)||0}%"></div></div>
      </div>\` : ''}
    </div>
  \`);
}

function openAddUserModal() {
  openModal('직원 추가', \`
    <form id="add-user-form" class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-xs font-medium text-slate-600 block mb-1">사원번호 *</label><input name="employee_id" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="EMP006" required /></div>
        <div><label class="text-xs font-medium text-slate-600 block mb-1">이름 *</label><input name="name" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="홍길동" required /></div>
      </div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">이메일 *</label><input name="email" type="email" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="hong@company.com" required /></div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">비밀번호 *</label><input name="password" type="password" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="••••••••" required /></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-xs font-medium text-slate-600 block mb-1">부서 *</label>
          <select name="department" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required>
            <option value="">선택</option>
            <option>경영지원</option><option>개발팀</option><option>디자인팀</option><option>마케팅팀</option><option>인사팀</option><option>영업팀</option>
          </select>
        </div>
        <div><label class="text-xs font-medium text-slate-600 block mb-1">직급 *</label>
          <select name="position" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required>
            <option value="">선택</option>
            <option>인턴</option><option>사원</option><option>주임</option><option>대리</option><option>과장</option><option>차장</option><option>부장</option><option>이사</option><option>선임</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-xs font-medium text-slate-600 block mb-1">입사일 *</label><input name="hire_date" type="date" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required /></div>
        <div><label class="text-xs font-medium text-slate-600 block mb-1">연락처</label><input name="phone" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="010-0000-0000" /></div>
      </div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">연차 총일수</label><input name="annual_leave_total" type="number" value="15" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
      <div id="form-error" class="text-red-500 text-sm hidden"></div>
      <button type="submit" class="w-full bg-indigo-600 text-white rounded-lg py-2.5 font-semibold hover:bg-indigo-700 transition">직원 추가</button>
    </form>
  \`);

  document.getElementById('add-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.annual_leave_total = Number(data.annual_leave_total);
    const res = await api('POST', '/users', data);
    if (res.error) {
      document.getElementById('form-error').textContent = res.error;
      document.getElementById('form-error').classList.remove('hidden');
      return;
    }
    closeModal();
    showToast('직원이 추가되었습니다.');
    renderHR(document.getElementById('page-content'));
  });
}

async function openEditUserModal(id) {
  const u = await api('GET', '/users/' + id);
  openModal('직원 정보 수정', \`
    <form id="edit-user-form" class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-xs font-medium text-slate-600 block mb-1">이름</label><input name="name" value="\${u.name}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label class="text-xs font-medium text-slate-600 block mb-1">연락처</label><input name="phone" value="\${u.phone||''}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-xs font-medium text-slate-600 block mb-1">부서</label>
          <select name="department" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option \${u.department==='경영지원'?'selected':''}>경영지원</option>
            <option \${u.department==='개발팀'?'selected':''}>개발팀</option>
            <option \${u.department==='디자인팀'?'selected':''}>디자인팀</option>
            <option \${u.department==='마케팅팀'?'selected':''}>마케팅팀</option>
            <option \${u.department==='인사팀'?'selected':''}>인사팀</option>
            <option \${u.department==='영업팀'?'selected':''}>영업팀</option>
          </select>
        </div>
        <div><label class="text-xs font-medium text-slate-600 block mb-1">직급</label>
          <select name="position" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            <option \${u.position==='인턴'?'selected':''}>인턴</option>
            <option \${u.position==='사원'?'selected':''}>사원</option>
            <option \${u.position==='주임'?'selected':''}>주임</option>
            <option \${u.position==='대리'?'selected':''}>대리</option>
            <option \${u.position==='과장'?'selected':''}>과장</option>
            <option \${u.position==='차장'?'selected':''}>차장</option>
            <option \${u.position==='부장'?'selected':''}>부장</option>
            <option \${u.position==='이사'?'selected':''}>이사</option>
            <option \${u.position==='선임'?'selected':''}>선임</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-xs font-medium text-slate-600 block mb-1">입사일</label><input name="hire_date" type="date" value="\${u.hire_date}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label class="text-xs font-medium text-slate-600 block mb-1">연차 총일수</label><input name="annual_leave_total" type="number" value="\${u.annual_leave_total}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" /></div>
      </div>
      <button type="submit" class="w-full bg-indigo-600 text-white rounded-lg py-2.5 font-semibold hover:bg-indigo-700 transition">저장</button>
    </form>
  \`);

  document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.annual_leave_total = Number(data.annual_leave_total);
    const res = await api('PUT', '/users/' + id, data);
    if (res.error) { showToast(res.error, 'error'); return; }
    closeModal();
    showToast('직원 정보가 수정되었습니다.');
    renderHR(document.getElementById('page-content'));
  });
}

async function deleteUser(id) {
  const user = hrAllUsers.find(u => u.id === id);
  const name = user ? user.name : '이 직원';
  if (!confirm(name + ' 님을 삭제하시겠습니까? (삭제 후 복구 불가)')) return;
  const res = await api('DELETE', '/users/' + id);
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('직원이 삭제되었습니다.');
  renderHR(document.getElementById('page-content'));
}

// ==================== 연차 관리 ====================
// 관리자 연차 탭 상태
let leaveAdminTab = 'pending'; // 'pending' | 'all' | 'history'
let leaveFilterDept = '';
let leaveFilterStatus = 'all';
let leaveSearchKeyword = '';

async function renderLeave(container) {
  if (currentUser.role === 'admin') {
    container.innerHTML = \`
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold text-slate-800">연차 관리</h2>
          <p class="text-slate-500 text-sm mt-0.5">전체 직원 연차 현황 및 승인 관리</p>
        </div>
      </div>
      <!-- 탭 네비게이션 -->
      <div class="flex gap-1 bg-slate-100 p-1 rounded-xl mb-6 w-fit">
        <button id="ltab-pending" onclick="switchLeaveTab('pending')"
          class="px-4 py-2 rounded-lg text-sm font-medium transition">
          <i class="fas fa-clock mr-1.5"></i>승인 대기
          <span id="ltab-pending-badge" class="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 hidden"></span>
        </button>
        <button id="ltab-all" onclick="switchLeaveTab('all')"
          class="px-4 py-2 rounded-lg text-sm font-medium transition">
          <i class="fas fa-users mr-1.5"></i>전체 현황
        </button>
        <button id="ltab-history" onclick="switchLeaveTab('history')"
          class="px-4 py-2 rounded-lg text-sm font-medium transition">
          <i class="fas fa-list-alt mr-1.5"></i>신청 내역
        </button>
      </div>
      <div id="leave-content">
        <div class="flex justify-center py-12"><i class="fas fa-spinner fa-spin text-indigo-400 text-2xl"></i></div>
      </div>
    \`;
    switchLeaveTab(leaveAdminTab);
  } else {
    container.innerHTML = \`
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold text-slate-800">연차 관리</h2>
          <p class="text-slate-500 text-sm mt-0.5">내 연차 현황 및 신청</p>
        </div>
        <button onclick="openLeaveModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition flex items-center gap-2">
          <i class="fas fa-plus"></i> 연차 신청
        </button>
      </div>
      <div id="leave-content">
        <div class="flex justify-center py-12"><i class="fas fa-spinner fa-spin text-indigo-400 text-2xl"></i></div>
      </div>
    \`;
    await renderMyLeave();
  }
}

function switchLeaveTab(tab) {
  leaveAdminTab = tab;
  const tabs = ['pending','all','history'];
  tabs.forEach(t => {
    const btn = document.getElementById('ltab-' + t);
    if (!btn) return;
    if (t === tab) {
      btn.classList.add('bg-white','text-indigo-600','shadow-sm');
      btn.classList.remove('text-slate-500');
    } else {
      btn.classList.remove('bg-white','text-indigo-600','shadow-sm');
      btn.classList.add('text-slate-500');
    }
  });
  if (tab === 'pending')      renderAdminPending();
  else if (tab === 'all')     renderAdminAllStats();
  else if (tab === 'history') renderAdminHistory();
}

// ── 탭1: 승인 대기 ──────────────────────────────────────────
async function renderAdminPending() {
  const el = document.getElementById('leave-content');
  el.innerHTML = '<div class="flex justify-center py-12"><i class="fas fa-spinner fa-spin text-indigo-400 text-2xl"></i></div>';

  const leaves = await api('GET', '/leaves?status=pending');
  const badge = document.getElementById('ltab-pending-badge');
  if (badge) {
    if (leaves.length > 0) { badge.textContent = leaves.length; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }
  // 사이드바 배지도 업데이트
  const sideBadge = document.getElementById('pending-badge');
  if (sideBadge) {
    if (leaves.length > 0) { sideBadge.textContent = leaves.length; sideBadge.style.display='inline-flex'; }
    else sideBadge.style.display='none';
  }

  if (!leaves.length) {
    el.innerHTML = \`
      <div class="card p-12 text-center text-slate-400">
        <i class="fas fa-check-circle text-4xl text-green-400 mb-3 block"></i>
        <p class="font-medium text-slate-600">승인 대기 중인 연차가 없습니다.</p>
      </div>
    \`;
    return;
  }

  let html = \`
    <div class="card overflow-hidden">
      <div class="px-5 py-4 border-b bg-amber-50 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fas fa-clock text-amber-500"></i>
          <span class="font-semibold text-amber-700">승인 대기</span>
          <span class="bg-amber-500 text-white text-xs rounded-full px-2 py-0.5">\${leaves.length}건</span>
        </div>
      </div>
      <div class="divide-y">
  \`;

  leaves.forEach(l => {
    html += \`
      <div class="px-5 py-4" id="leave-row-\${l.id}">
        <div class="flex items-start gap-4">
          <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
            <span class="text-indigo-600 font-bold text-sm">\${l.user_name ? l.user_name[0] : '?'}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="font-semibold text-slate-800">\${l.user_name}</span>
              <span class="text-slate-400 text-sm">\${l.department || ''} · \${l.position || ''}</span>
              <span class="badge badge-pending text-xs">대기중</span>
            </div>
            <div class="flex items-center gap-3 text-sm text-slate-600 flex-wrap">
              <span class="font-medium text-indigo-600">\${l.leave_type}</span>
              <span>\${l.start_date} ~ \${l.end_date}</span>
              <span class="bg-slate-100 px-2 py-0.5 rounded text-xs font-medium">\${l.days}일</span>
              \${l.reason ? '<span class="text-slate-400">· ' + l.reason + '</span>' : ''}
            </div>
            <div class="text-xs text-slate-400 mt-1">신청일: \${formatDate(l.created_at)}</div>
          </div>
          <div class="flex gap-2 shrink-0">
            <button onclick="approveLeave(\${l.id},'approved')"
              class="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-600 transition flex items-center gap-1.5">
              <i class="fas fa-check"></i> 승인
            </button>
            <button onclick="openRejectModal(\${l.id})"
              class="bg-red-100 text-red-600 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-200 transition flex items-center gap-1.5">
              <i class="fas fa-times"></i> 반려
            </button>
          </div>
        </div>
      </div>
    \`;
  });

  html += \`</div></div>\`;
  el.innerHTML = html;
}

// ── 탭2: 전체 현황 ──────────────────────────────────────────
async function renderAdminAllStats() {
  const el = document.getElementById('leave-content');
  el.innerHTML = '<div class="flex justify-center py-12"><i class="fas fa-spinner fa-spin text-indigo-400 text-2xl"></i></div>';

  const allStats = await api('GET', '/leaves/all-stats');

  // 부서 목록
  const depts = [...new Set(allStats.map(u => u.department).filter(Boolean))];

  let html = \`
    <!-- 검색/필터 -->
    <div class="card p-4 mb-4 flex flex-wrap gap-3 items-center">
      <input id="lf-search" type="text" placeholder="이름 검색..." value="\${leaveSearchKeyword}"
        oninput="leaveSearchKeyword=this.value; renderAdminAllStats()"
        class="border border-slate-200 rounded-lg px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
      <select id="lf-dept" onchange="leaveFilterDept=this.value; renderAdminAllStats()"
        class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
        <option value="">전체 부서</option>
        \${depts.map(d => '<option value="' + d + '" ' + (leaveFilterDept===d?'selected':'') + '>' + d + '</option>').join('')}
      </select>
      <button onclick="openAdminLeaveModal()" class="ml-auto bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition flex items-center gap-2">
        <i class="fas fa-plus"></i> 연차 직접 등록
      </button>
    </div>
    <div class="card overflow-hidden">
      <div class="px-5 py-4 border-b">
        <h3 class="font-semibold text-slate-700">전체 직원 연차 현황</h3>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="text-left px-5 py-3 text-slate-500 font-medium">직원</th>
              <th class="text-center px-3 py-3 text-slate-500 font-medium">총 연차</th>
              <th class="text-center px-3 py-3 text-slate-500 font-medium">사용</th>
              <th class="text-center px-3 py-3 text-slate-500 font-medium">대기</th>
              <th class="text-center px-3 py-3 text-slate-500 font-medium">잔여</th>
              <th class="text-left px-3 py-3 text-slate-500 font-medium hidden md:table-cell">사용률</th>
              <th class="text-center px-3 py-3 text-slate-500 font-medium">상세</th>
            </tr>
          </thead>
          <tbody class="divide-y">
  \`;

  let filtered = allStats;
  if (leaveFilterDept) filtered = filtered.filter(u => u.department === leaveFilterDept);
  if (leaveSearchKeyword) filtered = filtered.filter(u => u.name && u.name.includes(leaveSearchKeyword));

  filtered.forEach(u => {
    const pct = u.annual_leave_total ? Math.round((u.used_days / u.annual_leave_total) * 100) : 0;
    const remainClass = u.remaining_days < 3 ? 'text-red-500 font-bold' : 'text-green-600 font-medium';
    html += \`
      <tr class="hover:bg-slate-50">
        <td class="px-5 py-3">
          <div class="font-medium text-slate-800">\${u.name}</div>
          <div class="text-xs text-slate-400">\${u.department} · \${u.position}</div>
        </td>
        <td class="text-center px-3 py-3 text-slate-700">\${u.annual_leave_total}</td>
        <td class="text-center px-3 py-3 text-indigo-600 font-medium">\${u.used_days}</td>
        <td class="text-center px-3 py-3">
          \${u.pending_days > 0 ? '<span class="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">' + u.pending_days + '</span>' : '<span class="text-slate-300">-</span>'}
        </td>
        <td class="text-center px-3 py-3 \${remainClass}">\${u.remaining_days}</td>
        <td class="px-3 py-3 hidden md:table-cell">
          <div class="flex items-center gap-2">
            <div class="leave-bar flex-1"><div class="leave-bar-fill" style="width:\${pct}%"></div></div>
            <span class="text-xs text-slate-500 w-8">\${pct}%</span>
          </div>
        </td>
        <td class="text-center px-3 py-3">
          <button onclick="viewUserLeaves(\${u.id}, '\${u.name}')"
            class="text-indigo-500 hover:text-indigo-700 text-xs px-2 py-1 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition">
            내역
          </button>
        </td>
      </tr>
    \`;
  });

  if (!filtered.length) {
    html += \`<tr><td colspan="7" class="text-center py-8 text-slate-400">해당하는 직원이 없습니다.</td></tr>\`;
  }

  html += \`</tbody></table></div></div>\`;
  el.innerHTML = html;
}

// ── 탭3: 전체 신청 내역 ──────────────────────────────────────
async function renderAdminHistory() {
  const el = document.getElementById('leave-content');
  el.innerHTML = '<div class="flex justify-center py-12"><i class="fas fa-spinner fa-spin text-indigo-400 text-2xl"></i></div>';

  const leaves = await api('GET', '/leaves?status=' + (leaveFilterStatus === 'all' ? '' : leaveFilterStatus));

  let html = \`
    <div class="card p-4 mb-4 flex flex-wrap gap-3 items-center">
      <select onchange="leaveFilterStatus=this.value; renderAdminHistory()"
        class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
        <option value="all" \${leaveFilterStatus==='all'?'selected':''}>전체 상태</option>
        <option value="pending" \${leaveFilterStatus==='pending'?'selected':''}>대기</option>
        <option value="approved" \${leaveFilterStatus==='approved'?'selected':''}>승인</option>
        <option value="rejected" \${leaveFilterStatus==='rejected'?'selected':''}>반려</option>
      </select>
      <span class="text-sm text-slate-500 ml-2">총 \${leaves.length}건</span>
    </div>
    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="text-left px-5 py-3 text-slate-500 font-medium">직원</th>
              <th class="text-left px-3 py-3 text-slate-500 font-medium">종류</th>
              <th class="text-left px-3 py-3 text-slate-500 font-medium">기간</th>
              <th class="text-center px-3 py-3 text-slate-500 font-medium">일수</th>
              <th class="text-center px-3 py-3 text-slate-500 font-medium">상태</th>
              <th class="text-left px-3 py-3 text-slate-500 font-medium hidden md:table-cell">처리자</th>
              <th class="text-center px-3 py-3 text-slate-500 font-medium">액션</th>
            </tr>
          </thead>
          <tbody class="divide-y">
  \`;

  if (!leaves.length) {
    html += \`<tr><td colspan="7" class="text-center py-8 text-slate-400">신청 내역이 없습니다.</td></tr>\`;
  } else {
    leaves.forEach(l => {
      const statusLabel = l.status === 'pending' ? '대기' : l.status === 'approved' ? '승인' : '반려';
      const canApprove = l.status === 'pending';
      html += \`
        <tr class="hover:bg-slate-50">
          <td class="px-5 py-3">
            <div class="font-medium text-slate-800">\${l.user_name}</div>
            <div class="text-xs text-slate-400">\${l.department || ''}</div>
          </td>
          <td class="px-3 py-3 text-slate-700">\${l.leave_type}</td>
          <td class="px-3 py-3 text-slate-600 text-xs">
            \${l.start_date} ~ \${l.end_date}
            \${l.reason ? '<div class="text-slate-400 mt-0.5">' + l.reason + '</div>' : ''}
          </td>
          <td class="text-center px-3 py-3 font-medium text-slate-700">\${l.days}일</td>
          <td class="text-center px-3 py-3">
            <span class="badge badge-\${l.status}">\${statusLabel}</span>
            \${l.status === 'rejected' && l.reject_reason ? '<div class="text-xs text-red-400 mt-0.5">' + l.reject_reason + '</div>' : ''}
          </td>
          <td class="px-3 py-3 text-slate-500 text-xs hidden md:table-cell">
            \${l.approver_name || '-'}
            \${l.approved_at ? '<div class="text-slate-400">' + formatDate(l.approved_at) + '</div>' : ''}
          </td>
          <td class="text-center px-3 py-3">
            \${canApprove ? \`
              <div class="flex gap-1 justify-center">
                <button onclick="approveLeave(\${l.id},'approved')"
                  class="bg-green-500 text-white px-2.5 py-1 rounded text-xs font-semibold hover:bg-green-600 transition">승인</button>
                <button onclick="openRejectModal(\${l.id})"
                  class="bg-red-100 text-red-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-red-200 transition">반려</button>
              </div>
            \` : \`
              <button onclick="adminDeleteLeave(\${l.id})"
                class="text-slate-400 hover:text-red-500 text-xs px-2 py-1 border border-slate-200 rounded hover:border-red-300 transition">삭제</button>
            \`}
          </td>
        </tr>
      \`;
    });
  }

  html += \`</tbody></table></div></div>\`;
  el.innerHTML = html;
}

async function renderMyLeave() {
  const [stats, leaves] = await Promise.all([
    api('GET', '/leaves/stats'),
    api('GET', '/leaves')
  ]);

  const pct = stats.total ? Math.round((stats.used / stats.total) * 100) : 0;
  let html = \`
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="card p-5 text-center">
        <div class="text-3xl font-bold text-slate-800">\${stats.total}</div>
        <div class="text-slate-500 text-sm mt-1">총 연차</div>
      </div>
      <div class="card p-5 text-center">
        <div class="text-3xl font-bold text-indigo-600">\${stats.used}</div>
        <div class="text-slate-500 text-sm mt-1">사용 연차</div>
      </div>
      <div class="card p-5 text-center">
        <div class="text-3xl font-bold text-green-600">\${stats.remaining}</div>
        <div class="text-slate-500 text-sm mt-1">잔여 연차</div>
      </div>
    </div>
    <div class="card p-5 mb-6">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-slate-700">연차 사용률</span>
        <span class="text-sm font-bold text-indigo-600">\${pct}%</span>
      </div>
      <div class="leave-bar"><div class="leave-bar-fill" style="width:\${pct}%"></div></div>
      \${stats.pending > 0 ? '<p class="text-xs text-amber-600 mt-2"><i class="fas fa-clock mr-1"></i>승인 대기 중: ' + stats.pending + '일</p>' : ''}
    </div>
    <div class="card overflow-hidden">
      <div class="px-5 py-4 border-b flex items-center justify-between">
        <h3 class="font-semibold text-slate-700">연차 신청 내역</h3>
        <span class="text-slate-400 text-sm">\${leaves.length}건</span>
      </div>
      <div class="divide-y">
  \`;

  if (!leaves.length) {
    html += \`<div class="py-12 text-center text-slate-400"><i class="fas fa-calendar-times text-3xl mb-3 block"></i>신청 내역이 없습니다.</div>\`;
  } else {
    leaves.forEach(l => {
      const statusLabel = l.status === 'pending' ? '대기' : l.status === 'approved' ? '승인' : '반려';
      html += \`
        <div class="flex items-start gap-4 px-5 py-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-medium text-slate-800">\${l.leave_type}</span>
              <span class="badge badge-\${l.status}">\${statusLabel}</span>
            </div>
            <div class="text-slate-500 text-xs">\${l.start_date} ~ \${l.end_date} (\${l.days}일) \${l.reason ? '· ' + l.reason : ''}</div>
            \${l.status === 'rejected' && l.reject_reason ? '<div class="text-xs text-red-400 mt-1"><i class="fas fa-comment-slash mr-1"></i>반려 사유: ' + l.reject_reason + '</div>' : ''}
          </div>
          <div class="text-xs text-slate-400 shrink-0">\${formatDate(l.created_at)}</div>
          \${l.status === 'pending' ? '<button onclick="cancelLeave(' + l.id + ')" class="text-red-400 hover:text-red-600 text-xs px-2 py-1 border border-red-200 rounded-lg shrink-0">취소</button>' : ''}
        </div>
      \`;
    });
  }
  html += \`</div></div>\`;
  document.getElementById('leave-content').innerHTML = html;
}

async function viewUserLeaves(userId, name) {
  const leaves = await api('GET', '/leaves?user_id=' + userId);
  const stats = await api('GET', '/leaves/stats?user_id=' + userId);
  let html = \`
    <div class="bg-indigo-50 rounded-xl p-4 mb-4">
      <div class="grid grid-cols-3 gap-3 text-center">
        <div><div class="text-xl font-bold text-slate-800">\${stats.total}</div><div class="text-xs text-slate-500">총 연차</div></div>
        <div><div class="text-xl font-bold text-indigo-600">\${stats.used}</div><div class="text-xs text-slate-500">사용</div></div>
        <div><div class="text-xl font-bold text-green-600">\${stats.remaining}</div><div class="text-xs text-slate-500">잔여</div></div>
      </div>
    </div>
    <div class="space-y-2">
  \`;
  if (!leaves.length) {
    html += \`<p class="text-center text-slate-400 py-6">연차 내역이 없습니다.</p>\`;
  } else {
    leaves.forEach(l => {
      const statusLabel = l.status === 'pending' ? '대기' : l.status === 'approved' ? '승인' : '반려';
      html += \`
        <div class="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium text-sm">\${l.leave_type}</span>
              <span class="badge badge-\${l.status}">\${statusLabel}</span>
            </div>
            <div class="text-xs text-slate-500 mt-0.5">\${l.start_date} ~ \${l.end_date} (\${l.days}일)\${l.reason ? ' · ' + l.reason : ''}</div>
            \${l.status === 'rejected' && l.reject_reason ? '<div class="text-xs text-red-400 mt-0.5">반려 사유: ' + l.reject_reason + '</div>' : ''}
          </div>
          <div class="text-xs text-slate-400 shrink-0">\${formatDate(l.created_at)}</div>
        </div>
      \`;
    });
  }
  html += \`</div>\`;
  openModal(name + ' 님의 연차 내역', html);
}

// ── 연차 신청 모달 (직원용) ─────────────────────────────────
function openLeaveModal() {
  const today = new Date().toISOString().split('T')[0];
  openModal('연차 신청', \`
    <form id="leave-form" class="space-y-4">
      <div><label class="text-xs font-medium text-slate-600 block mb-1">연차 종류 *</label>
        <select name="leave_type" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required>
          <option>연차</option><option>오전반차</option><option>오후반차</option><option>경조사</option><option>병가</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-xs font-medium text-slate-600 block mb-1">시작일 *</label><input name="start_date" type="date" value="\${today}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required /></div>
        <div><label class="text-xs font-medium text-slate-600 block mb-1">종료일 *</label><input name="end_date" type="date" value="\${today}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required /></div>
      </div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">사용 일수 *</label>
        <select name="days" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required>
          <option value="0.5">0.5일 (반차)</option>
          <option value="1" selected>1일</option>
          <option value="2">2일</option><option value="3">3일</option>
          <option value="4">4일</option><option value="5">5일</option>
        </select>
      </div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">사유</label>
        <textarea name="reason" rows="3" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="연차 사유를 입력해주세요."></textarea>
      </div>
      <div id="leave-form-error" class="text-red-500 text-sm hidden"></div>
      <button type="submit" class="w-full bg-indigo-600 text-white rounded-lg py-2.5 font-semibold hover:bg-indigo-700 transition">신청하기</button>
    </form>
  \`);
  document.getElementById('leave-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.days = Number(data.days);
    const res = await api('POST', '/leaves', data);
    if (res.error) {
      document.getElementById('leave-form-error').textContent = res.error;
      document.getElementById('leave-form-error').classList.remove('hidden');
      return;
    }
    closeModal();
    showToast('연차가 신청되었습니다.');
    renderLeave(document.getElementById('page-content'));
  });
}

// ── 관리자 직접 연차 등록 모달 ──────────────────────────────
let adminLeaveUsers = [];
async function openAdminLeaveModal() {
  if (!adminLeaveUsers.length) {
    const res = await api('GET', '/users');
    adminLeaveUsers = Array.isArray(res) ? res : (res.users || []);
  }
  const today = new Date().toISOString().split('T')[0];
  const userOptions = adminLeaveUsers
    .map(u => '<option value="' + u.id + '">' + u.name + ' (' + (u.department||'') + ')</option>')
    .join('');

  openModal('연차 직접 등록 (관리자)', \`
    <form id="admin-leave-form" class="space-y-4">
      <div class="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
        <i class="fas fa-info-circle mr-1"></i>관리자가 직접 등록하는 연차는 자동으로 승인 처리됩니다.
      </div>
      <div>
        <label class="text-xs font-medium text-slate-600 block mb-1">직원 선택 *</label>
        <select name="target_user_id" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required>
          <option value="">-- 직원을 선택하세요 --</option>
          \${userOptions}
        </select>
      </div>
      <div>
        <label class="text-xs font-medium text-slate-600 block mb-1">연차 종류 *</label>
        <select name="leave_type" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required>
          <option>연차</option><option>오전반차</option><option>오후반차</option><option>경조사</option><option>병가</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-xs font-medium text-slate-600 block mb-1">시작일 *</label><input name="start_date" type="date" value="\${today}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required /></div>
        <div><label class="text-xs font-medium text-slate-600 block mb-1">종료일 *</label><input name="end_date" type="date" value="\${today}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required /></div>
      </div>
      <div>
        <label class="text-xs font-medium text-slate-600 block mb-1">사용 일수 *</label>
        <select name="days" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required>
          <option value="0.5">0.5일 (반차)</option>
          <option value="1" selected>1일</option>
          <option value="2">2일</option><option value="3">3일</option>
          <option value="4">4일</option><option value="5">5일</option>
        </select>
      </div>
      <div>
        <label class="text-xs font-medium text-slate-600 block mb-1">사유</label>
        <textarea name="reason" rows="2" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="예: 개인 사유, 경조사 등"></textarea>
      </div>
      <div id="admin-leave-error" class="text-red-500 text-sm hidden"></div>
      <button type="submit" class="w-full bg-indigo-600 text-white rounded-lg py-2.5 font-semibold hover:bg-indigo-700 transition">등록 (자동 승인)</button>
    </form>
  \`);
  document.getElementById('admin-leave-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd);
    data.days = Number(data.days);
    data.target_user_id = Number(data.target_user_id);
    if (!data.target_user_id) {
      document.getElementById('admin-leave-error').textContent = '직원을 선택해주세요.';
      document.getElementById('admin-leave-error').classList.remove('hidden');
      return;
    }
    const res = await api('POST', '/leaves', data);
    if (res.error) {
      document.getElementById('admin-leave-error').textContent = res.error;
      document.getElementById('admin-leave-error').classList.remove('hidden');
      return;
    }
    closeModal();
    showToast('연차가 등록되었습니다. (자동 승인)');
    renderAdminAllStats();
  });
}

// ── 반려 사유 모달 ──────────────────────────────────────────
function openRejectModal(leaveId) {
  openModal('반려 사유 입력', \`
    <div class="space-y-4">
      <p class="text-sm text-slate-600">반려 사유를 입력하면 직원에게 표시됩니다. (선택)</p>
      <textarea id="reject-reason-input" rows="4"
        class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
        placeholder="반려 사유를 입력해주세요. (미입력 시 사유 없음으로 처리)"></textarea>
      <div class="flex gap-3">
        <button onclick="closeModal()" class="flex-1 border border-slate-200 text-slate-600 rounded-lg py-2.5 font-semibold hover:bg-slate-50 transition">취소</button>
        <button onclick="submitReject(\${leaveId})" class="flex-1 bg-red-500 text-white rounded-lg py-2.5 font-semibold hover:bg-red-600 transition">반려 확정</button>
      </div>
    </div>
  \`);
}

async function submitReject(id) {
  const reason = (document.getElementById('reject-reason-input').value || '').trim();
  const res = await api('PUT', '/leaves/' + id + '/approve', { status: 'rejected', reject_reason: reason || null });
  if (res.error) { showToast(res.error, 'error'); return; }
  closeModal();
  showToast('반려 처리되었습니다.');
  switchLeaveTab(leaveAdminTab);
}

async function approveLeave(id, status) {
  if (status === 'rejected') { openRejectModal(id); return; }
  const res = await api('PUT', '/leaves/' + id + '/approve', { status });
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('승인되었습니다.');
  switchLeaveTab(leaveAdminTab);
}

async function adminDeleteLeave(id) {
  if (!confirm('이 연차 내역을 삭제하시겠습니까?')) return;
  const res = await api('DELETE', '/leaves/' + id);
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('삭제되었습니다.');
  renderAdminHistory();
}

async function cancelLeave(id) {
  if (!confirm('연차 신청을 취소하시겠습니까?')) return;
  const res = await api('DELETE', '/leaves/' + id);
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('연차가 취소되었습니다.');
  renderLeave(document.getElementById('page-content'));
}


// ==================== 공지사항 ====================
let noticeList = [];
let noticePage = 1;
let noticeTotal = 0;

async function renderNotice(container) {
  container.innerHTML = \`
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-xl font-bold text-slate-800">공지사항</h2>
        <p class="text-slate-500 text-sm mt-0.5">전사 공지 게시판</p>
      </div>
      \${currentUser.role === 'admin' ? \`<button onclick="openNoticeWriteModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition flex items-center gap-2"><i class="fas fa-pen"></i> 공지 작성</button>\` : ''}
    </div>
    <div id="notice-list"></div>
    <div id="notice-pagination" class="flex justify-center mt-6 gap-2"></div>
  \`;
  await loadNotices(1);
}

async function loadNotices(page) {
  noticePage = page;
  const data = await api('GET', '/notices?page=' + page);
  noticeList = data.notices || [];
  noticeTotal = data.total || 0;

  const listEl = document.getElementById('notice-list');
  if (!listEl) return;

  if (!noticeList.length) {
    listEl.innerHTML = \`<div class="card py-16 text-center text-slate-400"><i class="fas fa-inbox text-4xl mb-3 block"></i><p>공지사항이 없습니다.</p></div>\`;
    return;
  }

  let html = \`<div class="card overflow-hidden"><div class="divide-y">\`;
  noticeList.forEach(n => {
    html += \`
      <div class="flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition cursor-pointer" onclick="viewNotice(\${n.id})">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            \${n.is_pinned ? \`<span class="badge" style="background:#fef3c7;color:#92400e"><i class="fas fa-thumbtack text-xs mr-1"></i>고정</span>\` : ''}
            <span class="font-semibold text-slate-800 truncate">\${n.title}</span>
          </div>
          <div class="text-xs text-slate-400">\${n.author_name} (\${n.author_department}) · \${formatDate(n.created_at)}</div>
        </div>
        <div class="flex items-center gap-1 text-slate-400 text-xs shrink-0">
          <i class="fas fa-eye"></i> \${n.view_count}
        </div>
        \${currentUser.role === 'admin' ? \`
        <div class="flex gap-1 shrink-0">
          <button onclick="event.stopPropagation();openNoticeEditModal(\${n.id})" class="text-slate-400 hover:text-indigo-600 px-2 text-sm"><i class="fas fa-edit"></i></button>
          <button onclick="event.stopPropagation();deleteNotice(\${n.id})" class="text-slate-400 hover:text-red-500 px-2 text-sm"><i class="fas fa-trash"></i></button>
        </div>\` : ''}
      </div>
    \`;
  });
  html += \`</div></div>\`;
  listEl.innerHTML = html;

  // 페이지네이션
  const pageEl = document.getElementById('notice-pagination');
  if (pageEl) {
    const totalPages = Math.ceil(noticeTotal / 10);
    let pHtml = '';
    for (let i = 1; i <= totalPages; i++) {
      pHtml += \`<button onclick="loadNotices(\${i})" class="w-9 h-9 rounded-lg text-sm font-medium transition \${i === page ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}">\${i}</button>\`;
    }
    pageEl.innerHTML = pHtml;
  }
}

async function viewNotice(id) {
  const n = await api('GET', '/notices/' + id);
  openModal(n.title, \`
    <div class="space-y-4">
      <div class="flex items-center gap-3 text-sm text-slate-500 pb-3 border-b">
        <i class="fas fa-user"></i> \${n.author_name} (\${n.author_department})
        <span>·</span>
        <i class="fas fa-calendar"></i> \${formatDate(n.created_at)}
        <span>·</span>
        <i class="fas fa-eye"></i> \${n.view_count}
      </div>
      <div class="text-slate-700 leading-relaxed whitespace-pre-line">\${n.content}</div>
    </div>
  \`);
  // 목록 뷰카운트 갱신
  loadNotices(noticePage);
}

function openNoticeWriteModal(notice) {
  openModal(notice ? '공지 수정' : '공지 작성', \`
    <form id="notice-form" class="space-y-4">
      <div><label class="text-xs font-medium text-slate-600 block mb-1">제목 *</label><input name="title" value="\${notice?.title||''}" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required /></div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">내용 *</label><textarea name="content" rows="6" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" required>\${notice?.content||''}</textarea></div>
      <div class="flex items-center gap-2">
        <input type="checkbox" name="is_pinned" id="pin-check" \${notice?.is_pinned ? 'checked' : ''} class="rounded" />
        <label for="pin-check" class="text-sm text-slate-600">상단 고정</label>
      </div>
      <button type="submit" class="w-full bg-indigo-600 text-white rounded-lg py-2.5 font-semibold hover:bg-indigo-700 transition">\${notice ? '수정' : '작성'}</button>
    </form>
  \`);

  document.getElementById('notice-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      title: fd.get('title'),
      content: fd.get('content'),
      is_pinned: fd.get('is_pinned') === 'on'
    };
    const res = notice
      ? await api('PUT', '/notices/' + notice.id, data)
      : await api('POST', '/notices', data);
    if (res.error) { showToast(res.error, 'error'); return; }
    closeModal();
    showToast(notice ? '공지가 수정되었습니다.' : '공지가 작성되었습니다.');
    loadNotices(noticePage);
  });
}

async function openNoticeEditModal(id) {
  const n = await api('GET', '/notices/' + id);
  openNoticeWriteModal(n);
}

async function deleteNotice(id) {
  if (!confirm('이 공지를 삭제하시겠습니까?')) return;
  const res = await api('DELETE', '/notices/' + id);
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('공지가 삭제되었습니다.');
  loadNotices(noticePage);
}

// ==================== 메신저 ====================
let chatMessages = [];
let lastChatTime = null;

async function renderChat(container) {
  const users = await api('GET', '/users');
  const contacts = await api('GET', '/messages/contacts');

  container.innerHTML = \`
    <div class="mb-6">
      <h2 class="text-xl font-bold text-slate-800">사내 메신저</h2>
      <p class="text-slate-500 text-sm mt-0.5">채널 및 1:1 채팅</p>
    </div>
    <div class="flex gap-4 h-[600px]">
      <!-- 채팅방 목록 -->
      <div class="w-64 shrink-0 flex flex-col gap-3">
        <!-- 채널 -->
        <div class="card p-3">
          <div class="text-xs font-semibold text-slate-500 mb-2 px-1">채널</div>
          \${CHANNELS.map(ch => \`
            <button onclick="selectChannel('\${ch.id}')" id="ch-btn-\${ch.id}"
              class="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition \${ch.id === currentChannel ? 'bg-indigo-50 text-indigo-700 font-semibold' : ''}">
              <i class="fas \${ch.icon} text-slate-400 w-4"></i> \${ch.name}
            </button>
          \`).join('')}
        </div>
        <!-- DM -->
        <div class="card p-3 flex-1 overflow-y-auto scroll-hide">
          <div class="text-xs font-semibold text-slate-500 mb-2 px-1">다이렉트 메시지</div>
          \${users.filter(u => u.id !== currentUser.id).map(u => {
            const contact = contacts.find ? contacts.find(c => c.contact_id === u.id) : null;
            return \`
              <button onclick="selectDm(\${u.id}, '\${u.name}')" id="dm-btn-\${u.id}"
                class="w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-100 transition \${currentDmUser?.id === u.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : ''}">
                <div class="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">\${u.name[0]}</div>
                <div class="flex-1 min-w-0">
                  <div class="truncate">\${u.name}</div>
                  <div class="text-xs text-slate-400 truncate">\${u.department}</div>
                </div>
                \${contact?.unread_count > 0 ? \`<span class="bg-red-500 text-white text-xs rounded-full px-1.5 min-w-4 text-center">\${contact.unread_count}</span>\` : ''}
              </button>
            \`;
          }).join('')}
        </div>
      </div>

      <!-- 채팅 영역 -->
      <div class="card flex-1 flex flex-col overflow-hidden">
        <div id="chat-header" class="px-5 py-3 border-b bg-slate-50 flex items-center gap-3">
          <i class="fas fa-hashtag text-slate-400"></i>
          <span class="font-semibold text-slate-700">전체 채널</span>
        </div>
        <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3 chat-scroll scroll-hide">
          <div class="flex justify-center py-6"><i class="fas fa-spinner fa-spin text-indigo-400"></i></div>
        </div>
        <div class="px-4 py-3 border-t bg-slate-50">
          <div class="flex gap-2">
            <input id="chat-input" type="text" placeholder="메시지를 입력하세요..." 
              class="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white"
              onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage();}" />
            <button onclick="sendMessage()" class="bg-indigo-600 text-white px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition text-sm">
              <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  \`;

  // 기본 채널 로드
  currentDmUser = null;
  await loadChannelMessages(currentChannel);
  startChatPolling();
}

async function selectChannel(channelId) {
  currentChannel = channelId;
  currentDmUser = null;

  // 버튼 스타일 업데이트
  CHANNELS.forEach(ch => {
    const btn = document.getElementById('ch-btn-' + ch.id);
    if (btn) btn.className = btn.className.replace('bg-indigo-50 text-indigo-700 font-semibold', '');
  });
  const activeBtn = document.getElementById('ch-btn-' + channelId);
  if (activeBtn) activeBtn.classList.add('bg-indigo-50', 'text-indigo-700', 'font-semibold');

  const ch = CHANNELS.find(c => c.id === channelId);
  const header = document.getElementById('chat-header');
  if (header) header.innerHTML = \`<i class="fas fa-hashtag text-slate-400"></i><span class="font-semibold text-slate-700">\${ch?.name || channelId}</span>\`;

  await loadChannelMessages(channelId);
}

async function selectDm(userId, userName) {
  currentDmUser = { id: userId, name: userName };
  currentChannel = null;

  // 버튼 스타일
  const dmBtns = document.querySelectorAll('[id^="dm-btn-"]');
  dmBtns.forEach(b => { b.classList.remove('bg-indigo-50', 'text-indigo-700', 'font-semibold'); });
  const activeBtn = document.getElementById('dm-btn-' + userId);
  if (activeBtn) activeBtn.classList.add('bg-indigo-50', 'text-indigo-700', 'font-semibold');

  CHANNELS.forEach(ch => {
    const btn = document.getElementById('ch-btn-' + ch.id);
    if (btn) { btn.classList.remove('bg-indigo-50', 'text-indigo-700', 'font-semibold'); }
  });

  const header = document.getElementById('chat-header');
  if (header) header.innerHTML = \`
    <div class="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">\${userName[0]}</div>
    <span class="font-semibold text-slate-700">\${userName}</span>
  \`;

  await loadDmMessages(userId);
}

async function loadChannelMessages(channel) {
  const data = await api('GET', '/messages/channel/' + channel);
  renderMessages(data);
}

async function loadDmMessages(userId) {
  const data = await api('GET', '/messages/dm/' + userId);
  renderMessages(data);
}

function renderMessages(msgs) {
  const el = document.getElementById('chat-messages');
  if (!el) return;

  if (!msgs || !msgs.length) {
    el.innerHTML = \`<div class="flex flex-col items-center justify-center h-full text-slate-400">
      <i class="fas fa-comments text-4xl mb-3"></i>
      <p class="text-sm">아직 메시지가 없습니다. 먼저 말을 걸어보세요!</p>
    </div>\`;
    return;
  }

  let html = '';
  let prevDate = '';
  msgs.forEach(m => {
    const msgDate = m.created_at?.substring(0, 10) || '';
    if (msgDate !== prevDate) {
      html += \`<div class="flex items-center gap-3 my-2">
        <div class="flex-1 border-t border-slate-200"></div>
        <span class="text-xs text-slate-400">\${msgDate}</span>
        <div class="flex-1 border-t border-slate-200"></div>
      </div>\`;
      prevDate = msgDate;
    }

    const isMine = m.sender_id === currentUser.id;
    if (isMine) {
      html += \`
        <div class="flex justify-end gap-2 items-end">
          <div class="text-xs text-slate-400">\${m.created_at?.substring(11, 16) || ''}</div>
          <div class="msg-bubble-mine px-4 py-2.5 max-w-xs text-sm">\${escapeHtml(m.content)}</div>
        </div>
      \`;
    } else {
      html += \`
        <div class="flex gap-2 items-end">
          <div class="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs shrink-0">\${(m.sender_name||'?')[0]}</div>
          <div>
            <div class="text-xs text-slate-500 mb-1">\${m.sender_name} <span class="text-slate-400">\${m.sender_department || ''}</span></div>
            <div class="flex items-end gap-2">
              <div class="msg-bubble-other px-4 py-2.5 max-w-xs text-sm">\${escapeHtml(m.content)}</div>
              <div class="text-xs text-slate-400">\${m.created_at?.substring(11, 16) || ''}</div>
            </div>
          </div>
        </div>
      \`;
    }
  });
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const content = input.value.trim();
  if (!content) return;
  input.value = '';

  if (currentDmUser) {
    await api('POST', '/messages/dm/' + currentDmUser.id, { content });
    await loadDmMessages(currentDmUser.id);
  } else if (currentChannel) {
    await api('POST', '/messages/channel/' + currentChannel, { content });
    await loadChannelMessages(currentChannel);
  }
}

function startChatPolling() {
  clearInterval(chatPollingInterval);
  chatPollingInterval = setInterval(async () => {
    if (currentDmUser) {
      await loadDmMessages(currentDmUser.id);
    } else if (currentChannel) {
      await loadChannelMessages(currentChannel);
    }
  }, 3000);
}

function startUnreadPolling() {
  clearInterval(unreadPollingInterval);
  unreadPollingInterval = setInterval(async () => {
    const data = await api('GET', '/messages/unread');
    const badge = document.getElementById('unread-badge');
    if (badge) {
      if (data.unread > 0) {
        badge.textContent = data.unread;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }, 5000);
}

// ==================== 설정 ====================
let settingsTab = 'departments';

async function renderSettings(container) {
  container.innerHTML = \`
    <div class="p-6">
      <h2 class="text-2xl font-bold text-gray-800 mb-6"><i class="fas fa-cog mr-2 text-indigo-600"></i>설정</h2>

      <!-- 탭 네비게이션 -->
      <div class="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        <button onclick="switchSettingsTab('departments')" id="stab-departments"
          class="settings-tab px-5 py-2 rounded-lg text-sm font-medium transition-all">
          <i class="fas fa-building mr-1"></i>부서 관리
        </button>
        <button onclick="switchSettingsTab('positions')" id="stab-positions"
          class="settings-tab px-5 py-2 rounded-lg text-sm font-medium transition-all">
          <i class="fas fa-user-tag mr-1"></i>직급 관리
        </button>
        <button onclick="switchSettingsTab('annualleave')" id="stab-annualleave"
          class="settings-tab px-5 py-2 rounded-lg text-sm font-medium transition-all">
          <i class="fas fa-calendar-check mr-1"></i>연차 설정
        </button>
        <button onclick="switchSettingsTab('system')" id="stab-system"
          class="settings-tab px-5 py-2 rounded-lg text-sm font-medium transition-all">
          <i class="fas fa-sliders-h mr-1"></i>시스템 설정
        </button>
        <button onclick="switchSettingsTab('employees')" id="stab-employees"
          class="settings-tab px-5 py-2 rounded-lg text-sm font-medium transition-all">
          <i class="fas fa-users-cog mr-1"></i>직원 관리
        </button>
        <button onclick="switchSettingsTab('loginsettings')" id="stab-loginsettings"
          class="settings-tab px-5 py-2 rounded-lg text-sm font-medium transition-all">
          <i class="fas fa-sign-in-alt mr-1"></i>로그인 설정
        </button>
      </div>

      <!-- 탭 콘텐츠 -->
      <div id="settings-tab-content"></div>
    </div>
  \`;
  switchSettingsTab(settingsTab);
}

function switchSettingsTab(tab) {
  settingsTab = tab;
  const tabs = ['departments','positions','annualleave','system','employees','loginsettings'];
  tabs.forEach(t => {
    const el = document.getElementById('stab-' + t);
    if (!el) return;
    if (t === tab) {
      el.classList.add('bg-white','shadow','text-indigo-700','font-semibold');
      el.classList.remove('text-gray-600');
    } else {
      el.classList.remove('bg-white','shadow','text-indigo-700','font-semibold');
      el.classList.add('text-gray-600');
    }
  });
  const content = document.getElementById('settings-tab-content');
  if (!content) return;
  if (tab === 'departments') renderDeptTab(content);
  else if (tab === 'positions') renderPositionsTab(content);
  else if (tab === 'annualleave') renderAnnualLeaveTab(content);
  else if (tab === 'system') renderSystemTab(content);
  else if (tab === 'employees') renderSettingsEmployees(content);
  else if (tab === 'loginsettings') renderLoginSettings(content);
}

// ── 부서 관리 탭 ──────────────────────────────
async function renderDeptTab(container) {
  container.innerHTML = '<div class="text-gray-400 py-8 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</div>';
  const depts = await api('GET', '/settings/departments');
  if (depts.error) { container.innerHTML = \`<p class="text-red-500">\${depts.error}</p>\`; return; }

  container.innerHTML = \`
    <div class="card p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold text-gray-700"><i class="fas fa-building mr-2 text-indigo-500"></i>부서 목록</h3>
        <button onclick="openDeptModal()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <i class="fas fa-plus mr-1"></i>부서 추가
        </button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-gray-600 font-semibold rounded-tl-lg">부서명</th>
              <th class="px-4 py-3 text-left text-gray-600 font-semibold">설명</th>
              <th class="px-4 py-3 text-center text-gray-600 font-semibold">기본 연차</th>
              <th class="px-4 py-3 text-center text-gray-600 font-semibold">정렬순서</th>
              <th class="px-4 py-3 text-center text-gray-600 font-semibold rounded-tr-lg">관리</th>
            </tr>
          </thead>
          <tbody id="dept-tbody">
          </tbody>
        </table>
      </div>
    </div>

    <!-- 부서 추가/수정 모달 -->
    <div id="dept-modal" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 hidden">
      <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h4 id="dept-modal-title" class="text-lg font-bold text-gray-800 mb-5"></h4>
        <input type="hidden" id="dept-edit-id" value="" />
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">부서명 <span class="text-red-500">*</span></label>
            <input id="dept-name" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="예) 개발팀" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">설명</label>
            <input id="dept-desc" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="부서 설명 (선택)" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">기본 연차일수</label>
              <input id="dept-annual" type="number" min="0" max="365" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="15" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">정렬순서</label>
              <input id="dept-order" type="number" min="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="0" />
            </div>
          </div>
        </div>
        <div id="dept-modal-err" class="text-red-500 text-sm mt-3 hidden"></div>
        <div class="flex gap-3 mt-6">
          <button onclick="saveDept()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium transition-colors">저장</button>
          <button onclick="closeDeptModal()" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors">취소</button>
        </div>
      </div>
    </div>
  \`;

  // 테이블 데이터 렌더
  const tbody = document.getElementById('dept-tbody');
  if (!depts.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-8">등록된 부서가 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = depts.map((d, i) => \`
    <tr class="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      <td class="px-4 py-3 font-medium text-gray-800"><i class="fas fa-building mr-2 text-indigo-400"></i>\${d.name}</td>
      <td class="px-4 py-3 text-gray-500">\${d.description || '-'}</td>
      <td class="px-4 py-3 text-center"><span class="badge bg-blue-100 text-blue-700">\${d.default_annual_leave}일</span></td>
      <td class="px-4 py-3 text-center text-gray-500">\${d.sort_order}</td>
      <td class="px-4 py-3 text-center">
        <button onclick="openDeptModal(\${d.id},'\${escHtml(d.name)}','\${escHtml(d.description||'')}',\${d.default_annual_leave},\${d.sort_order})"
          class="text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded mr-1 text-xs font-medium hover:bg-indigo-50 transition-colors">
          <i class="fas fa-edit mr-1"></i>수정
        </button>
        <button onclick="deleteDept(\${d.id},'\${escHtml(d.name)}')"
          class="text-red-500 hover:text-red-700 px-2 py-1 rounded text-xs font-medium hover:bg-red-50 transition-colors">
          <i class="fas fa-trash mr-1"></i>삭제
        </button>
      </td>
    </tr>
  \`).join('');
}

function escHtml(str) {
  return String(str).replace(/'/g,"&#39;").replace(/"/g,"&quot;");
}

function openDeptModal(id, name, desc, annual, order) {
  document.getElementById('dept-modal').classList.remove('hidden');
  document.getElementById('dept-modal-err').classList.add('hidden');
  if (id) {
    document.getElementById('dept-modal-title').textContent = '부서 수정';
    document.getElementById('dept-edit-id').value = id;
    document.getElementById('dept-name').value = name || '';
    document.getElementById('dept-desc').value = desc || '';
    document.getElementById('dept-annual').value = annual != null ? annual : 15;
    document.getElementById('dept-order').value = order != null ? order : 0;
  } else {
    document.getElementById('dept-modal-title').textContent = '부서 추가';
    document.getElementById('dept-edit-id').value = '';
    document.getElementById('dept-name').value = '';
    document.getElementById('dept-desc').value = '';
    document.getElementById('dept-annual').value = 15;
    document.getElementById('dept-order').value = 0;
  }
}

function closeDeptModal() {
  document.getElementById('dept-modal').classList.add('hidden');
}

async function saveDept() {
  const id = document.getElementById('dept-edit-id').value;
  const name = document.getElementById('dept-name').value.trim();
  const desc = document.getElementById('dept-desc').value.trim();
  const annual = Number(document.getElementById('dept-annual').value) || 15;
  const order = Number(document.getElementById('dept-order').value) || 0;
  const errEl = document.getElementById('dept-modal-err');

  if (!name) { errEl.textContent = '부서명을 입력해주세요.'; errEl.classList.remove('hidden'); return; }

  const method = id ? 'PUT' : 'POST';
  const endpoint = id ? '/settings/departments/' + id : '/settings/departments';
  const res = await api(method, endpoint, { name, description: desc, default_annual_leave: annual, sort_order: order });
  if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); return; }

  closeDeptModal();
  const content = document.getElementById('settings-tab-content');
  renderDeptTab(content);
}

async function deleteDept(id, name) {
  if (!confirm('[' + name + '] 부서를 삭제하시겠습니까? (해당 부서에 직원이 있으면 삭제할 수 없습니다)')) return;
  const res = await api('DELETE', '/settings/departments/' + id);
  if (res.error) { alert(res.error); return; }
  const content = document.getElementById('settings-tab-content');
  renderDeptTab(content);
}

// ── 직급 관리 탭 ──────────────────────────────
async function renderPositionsTab(container) {
  container.innerHTML = '<div class="text-gray-400 py-8 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</div>';
  const positions = await api('GET', '/settings/positions');
  if (positions.error) { container.innerHTML = \`<p class="text-red-500">\${positions.error}</p>\`; return; }

  container.innerHTML = \`
    <div class="card p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold text-gray-700"><i class="fas fa-user-tag mr-2 text-indigo-500"></i>직급 목록</h3>
        <button onclick="openPosModal()" class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <i class="fas fa-plus mr-1"></i>직급 추가
        </button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-gray-600 font-semibold rounded-tl-lg">직급명</th>
              <th class="px-4 py-3 text-center text-gray-600 font-semibold">레벨</th>
              <th class="px-4 py-3 text-center text-gray-600 font-semibold">정렬순서</th>
              <th class="px-4 py-3 text-center text-gray-600 font-semibold rounded-tr-lg">관리</th>
            </tr>
          </thead>
          <tbody id="pos-tbody"></tbody>
        </table>
      </div>
    </div>

    <!-- 직급 추가/수정 모달 -->
    <div id="pos-modal" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 hidden">
      <div class="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h4 id="pos-modal-title" class="text-lg font-bold text-gray-800 mb-5"></h4>
        <input type="hidden" id="pos-edit-id" value="" />
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">직급명 <span class="text-red-500">*</span></label>
            <input id="pos-name" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="예) 사원" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">레벨 (숫자)</label>
              <input id="pos-level" type="number" min="1" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="1" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">정렬순서</label>
              <input id="pos-order" type="number" min="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="0" />
            </div>
          </div>
        </div>
        <div id="pos-modal-err" class="text-red-500 text-sm mt-3 hidden"></div>
        <div class="flex gap-3 mt-6">
          <button onclick="savePos()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium transition-colors">저장</button>
          <button onclick="closePosModal()" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors">취소</button>
        </div>
      </div>
    </div>
  \`;

  const tbody = document.getElementById('pos-tbody');
  if (!positions.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">등록된 직급이 없습니다.</td></tr>';
    return;
  }

  const levelColors = ['','bg-gray-100 text-gray-600','bg-green-100 text-green-700','bg-blue-100 text-blue-700','bg-indigo-100 text-indigo-700','bg-purple-100 text-purple-700','bg-pink-100 text-pink-700','bg-orange-100 text-orange-700','bg-red-100 text-red-700'];
  tbody.innerHTML = positions.map(p => {
    const colorClass = levelColors[Math.min(p.level, levelColors.length - 1)] || 'bg-gray-100 text-gray-600';
    return \`<tr class="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      <td class="px-4 py-3 font-medium text-gray-800"><i class="fas fa-id-badge mr-2 text-indigo-400"></i>\${p.name}</td>
      <td class="px-4 py-3 text-center"><span class="badge \${colorClass}">Lv.\${p.level}</span></td>
      <td class="px-4 py-3 text-center text-gray-500">\${p.sort_order}</td>
      <td class="px-4 py-3 text-center">
        <button onclick="openPosModal(\${p.id},'\${escHtml(p.name)}',\${p.level},\${p.sort_order})"
          class="text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded mr-1 text-xs font-medium hover:bg-indigo-50 transition-colors">
          <i class="fas fa-edit mr-1"></i>수정
        </button>
        <button onclick="deletePos(\${p.id},'\${escHtml(p.name)}')"
          class="text-red-500 hover:text-red-700 px-2 py-1 rounded text-xs font-medium hover:bg-red-50 transition-colors">
          <i class="fas fa-trash mr-1"></i>삭제
        </button>
      </td>
    </tr>\`;
  }).join('');
}

function openPosModal(id, name, level, order) {
  document.getElementById('pos-modal').classList.remove('hidden');
  document.getElementById('pos-modal-err').classList.add('hidden');
  if (id) {
    document.getElementById('pos-modal-title').textContent = '직급 수정';
    document.getElementById('pos-edit-id').value = id;
    document.getElementById('pos-name').value = name || '';
    document.getElementById('pos-level').value = level != null ? level : 1;
    document.getElementById('pos-order').value = order != null ? order : 0;
  } else {
    document.getElementById('pos-modal-title').textContent = '직급 추가';
    document.getElementById('pos-edit-id').value = '';
    document.getElementById('pos-name').value = '';
    document.getElementById('pos-level').value = 1;
    document.getElementById('pos-order').value = 0;
  }
}

function closePosModal() {
  document.getElementById('pos-modal').classList.add('hidden');
}

async function savePos() {
  const id = document.getElementById('pos-edit-id').value;
  const name = document.getElementById('pos-name').value.trim();
  const level = Number(document.getElementById('pos-level').value) || 1;
  const order = Number(document.getElementById('pos-order').value) || 0;
  const errEl = document.getElementById('pos-modal-err');

  if (!name) { errEl.textContent = '직급명을 입력해주세요.'; errEl.classList.remove('hidden'); return; }

  const method = id ? 'PUT' : 'POST';
  const endpoint = id ? '/settings/positions/' + id : '/settings/positions';
  const res = await api(method, endpoint, { name, level, sort_order: order });
  if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); return; }

  closePosModal();
  const content = document.getElementById('settings-tab-content');
  renderPositionsTab(content);
}

async function deletePos(id, name) {
  if (!confirm(\`"[\${name}]" 직급을 삭제하시겠습니까?\`)) return;
  const res = await api('DELETE', '/settings/positions/' + id);
  if (res.error) { alert(res.error); return; }
  const content = document.getElementById('settings-tab-content');
  renderPositionsTab(content);
}

// ── 연차 설정 탭 (회계연도 기반) ──────────────────────────────
let fySubTab = 'list';     // 'list' | 'grants'
let fySelectedYear = null;
let fyPolicyTab = 'fiscal'; // 'fiscal' | 'hire_date'
let fyPreviewData = null;

async function renderAnnualLeaveTab(container) {
  container.innerHTML = '<div class="text-gray-400 py-8 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</div>';
  fySubTab = 'list';
  await renderFYList(container);
}

// ── 회계연도 목록 + 자동부여 정책 통합 화면 ───────────────
async function renderFYList(container) {
  container.innerHTML = '<div class="text-gray-400 py-8 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</div>';
  const [fyList, sysRes] = await Promise.all([
    api('GET', '/settings/fiscal-years'),
    api('GET', '/settings/system')
  ]);
  if (fyList.error) { container.innerHTML = \`<p class="text-red-500">\${fyList.error}</p>\`; return; }

  const now = new Date();
  const currentYear = now.getFullYear();
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

  // 활성 회계연도
  const activeFY = fyList.find(f => f.is_active === 1) || fyList[0];
  const savedPolicy = sysRes['leave_grant_policy'] || 'fiscal';

  container.innerHTML = \`
    <div class="space-y-6">

      <!-- ① 자동 부여 정책 섹션 -->
      <div class="card p-6">
        <div class="flex items-center gap-2 mb-1">
          <i class="fas fa-magic text-indigo-500"></i>
          <h3 class="text-lg font-semibold text-gray-800">연차 자동 부여 정책</h3>
        </div>
        <p class="text-xs text-gray-400 mb-5">부여 기준을 선택하고 미리보기 후 적용합니다.</p>

        <!-- 기준 선택 탭 -->
        <div class="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-5">
          <button id="ptab-fiscal" onclick="switchPolicyTab('fiscal')"
            class="px-4 py-2 rounded-lg text-sm font-medium transition">
            <i class="fas fa-calendar-alt mr-1.5"></i>회계연도 기준
          </button>
          <button id="ptab-hire_date" onclick="switchPolicyTab('hire_date')"
            class="px-4 py-2 rounded-lg text-sm font-medium transition">
            <i class="fas fa-user-clock mr-1.5"></i>입사일 기준
          </button>
        </div>

        <!-- 회계연도 기준 설명 -->
        <div id="policy-desc-fiscal" class="hidden">
          <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-4 text-sm text-indigo-800 space-y-1">
            <p><i class="fas fa-info-circle mr-1 text-indigo-500"></i><strong>회계연도 기준</strong>: 회계연도 시작일 기준으로 근속연수를 계산하여 연차를 부여합니다.</p>
            <p class="text-indigo-600 text-xs ml-4">예) 4월 시작 회계연도 → 매년 4월 1일 기준 근속연수 적용</p>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div class="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div class="text-2xl font-bold text-indigo-600">11일</div>
              <div class="text-xs text-gray-500 mt-1">1년 미만 (월 1일)</div>
            </div>
            <div class="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div class="text-2xl font-bold text-indigo-600">15일</div>
              <div class="text-xs text-gray-500 mt-1">1~2년 미만</div>
            </div>
            <div class="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div class="text-2xl font-bold text-indigo-600">최대 25일</div>
              <div class="text-xs text-gray-500 mt-1">3년↑ (2년마다 +1일)</div>
            </div>
          </div>
        </div>

        <!-- 입사일 기준 설명 -->
        <div id="policy-desc-hire_date" class="hidden">
          <div class="bg-green-50 border border-green-100 rounded-xl p-4 mb-4 text-sm text-green-800 space-y-1">
            <p><i class="fas fa-info-circle mr-1 text-green-500"></i><strong>입사일 기준</strong>: 오늘 날짜 기준으로 각 직원의 근속연수를 계산하여 연차를 부여합니다.</p>
            <p class="text-green-600 text-xs ml-4">예) 입사일 2022-03-01 → 오늘 기준 근속 3년 → 16일 부여</p>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <div class="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div class="text-2xl font-bold text-green-600">11일</div>
              <div class="text-xs text-gray-500 mt-1">1년 미만 (월 1일)</div>
            </div>
            <div class="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div class="text-2xl font-bold text-green-600">15일</div>
              <div class="text-xs text-gray-500 mt-1">1~2년 미만</div>
            </div>
            <div class="bg-white border border-gray-200 rounded-lg p-3 text-center">
              <div class="text-2xl font-bold text-green-600">최대 25일</div>
              <div class="text-xs text-gray-500 mt-1">3년↑ (2년마다 +1일)</div>
            </div>
          </div>
        </div>

        <!-- 세부 설정 (공통) -->
        <details class="mb-4">
          <summary class="cursor-pointer text-sm text-gray-600 font-medium hover:text-gray-800 select-none">
            <i class="fas fa-cog mr-1"></i>세부 정책 설정 (클릭하여 펼치기)
          </summary>
          <div class="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">기본 연차일수 (1년↑)</label>
              <div class="flex items-center gap-1">
                <input id="policy-base-days" type="number" min="1" max="365"
                  value="\${sysRes['leave_base_days'] || 15}"
                  class="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <span class="text-xs text-gray-500">일</span>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">최대 연차일수</label>
              <div class="flex items-center gap-1">
                <input id="policy-max-days" type="number" min="1" max="365"
                  value="\${sysRes['leave_max_days'] || 25}"
                  class="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <span class="text-xs text-gray-500">일</span>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">1년 미만 최대 일수</label>
              <div class="flex items-center gap-1">
                <input id="policy-probation-days" type="number" min="1" max="30"
                  value="\${sysRes['leave_probation_days'] || 11}"
                  class="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <span class="text-xs text-gray-500">일</span>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">추가 기준 근속 (년)</label>
              <div class="flex items-center gap-1">
                <input id="policy-tenure-unit" type="number" min="1" max="10"
                  value="\${sysRes['leave_tenure_unit'] || 2}"
                  class="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <span class="text-xs text-gray-500">년마다</span>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">추가 일수</label>
              <div class="flex items-center gap-1">
                <input id="policy-tenure-incr" type="number" min="1" max="10"
                  value="\${sysRes['leave_tenure_increment'] || 1}"
                  class="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                <span class="text-xs text-gray-500">일</span>
              </div>
            </div>
          </div>
        </details>

        <!-- 대상 회계연도 선택 -->
        <div class="flex flex-wrap gap-3 items-end mb-4">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">적용 회계연도</label>
            <select id="policy-fy-select"
              class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
              \${fyList.map(f => '<option value="' + f.fiscal_year + '" ' + (f.is_active===1?'selected':'') + '>' + f.fiscal_year + '년도' + (f.is_active===1?' (운영 중)':'') + '</option>').join('')}
            </select>
          </div>
          <button onclick="previewAutoGrant()"
            class="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2">
            <i class="fas fa-eye"></i> 미리보기
          </button>
          <button onclick="applyAutoGrant(false)"
            class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2">
            <i class="fas fa-magic"></i> 자동 부여 실행
          </button>
        </div>

        <!-- 미리보기 결과 영역 -->
        <div id="policy-preview-area" class="hidden">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-semibold text-gray-700"><i class="fas fa-table mr-1 text-indigo-500"></i>미리보기 결과</h4>
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 cursor-pointer">
                <input type="checkbox" id="preview-overwrite" class="rounded" />
                이미 부여된 직원도 덮어쓰기
              </label>
              <button onclick="applyAutoGrant(true)"
                class="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition flex items-center gap-1.5">
                <i class="fas fa-check"></i> 미리보기 결과 적용
              </button>
            </div>
          </div>
          <div id="policy-preview-table" class="overflow-x-auto"></div>
        </div>
      </div>

      <!-- ② 회계연도 관리 섹션 -->
      <div>
        <div class="flex justify-between items-center mb-3">
          <div>
            <h3 class="text-lg font-semibold text-gray-800"><i class="fas fa-calendar-alt mr-2 text-indigo-500"></i>회계연도 관리</h3>
            <p class="text-xs text-gray-400 mt-0.5">연도별 연차 기준일수 및 운영 기간을 설정합니다.</p>
          </div>
          <button onclick="openFYModal()"
            class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <i class="fas fa-plus mr-1"></i>회계연도 추가
          </button>
        </div>

        <div id="fy-card-list" class="grid grid-cols-1 gap-4">
          \${fyList.length === 0 ? '<div class="card p-8 text-center text-gray-400">등록된 회계연도가 없습니다.</div>' :
            fyList.map(fy => {
              const sm = monthNames[fy.start_month - 1] || fy.start_month + '월';
              const em = monthNames[fy.end_month   - 1] || fy.end_month   + '월';
              const isActive = fy.is_active === 1;
              const isCurrent = fy.fiscal_year === currentYear;
              return \`
                <div class="card p-5 \${isActive ? 'ring-2 ring-indigo-400' : ''}">
                  <div class="flex items-center justify-between flex-wrap gap-3">
                    <div class="flex items-center gap-3">
                      <div class="w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold \${isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}">
                        \${fy.fiscal_year}
                      </div>
                      <div>
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="font-semibold text-gray-800 text-base">\${fy.fiscal_year}년도 회계연도</span>
                          \${isActive ? '<span class="badge bg-indigo-100 text-indigo-700"><i class="fas fa-circle text-indigo-500 mr-1" style="font-size:7px"></i>운영 중</span>' : ''}
                          \${isCurrent ? '<span class="badge bg-green-100 text-green-700">현재 연도</span>' : ''}
                        </div>
                        <div class="text-sm text-gray-500 mt-0.5 flex items-center gap-3 flex-wrap">
                          <span><i class="fas fa-calendar-day mr-1 text-gray-400"></i>\${fy.fiscal_year}년 \${sm} ~ \${fy.fiscal_year + (fy.start_month > 1 ? 1 : 0)}년 \${em}</span>
                          <span><i class="fas fa-sun mr-1 text-amber-400"></i>기본 <strong class="text-gray-700">\${fy.default_days}일</strong> 부여</span>
                          <span><i class="fas fa-users mr-1 text-blue-400"></i>부여 완료: <strong class="text-gray-700">\${fy.granted_count}명</strong></span>
                        </div>
                        \${fy.note ? '<div class="text-xs text-gray-400 mt-1"><i class="fas fa-sticky-note mr-1"></i>' + fy.note + '</div>' : ''}
                      </div>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                      \${!isActive ? \`
                        <button onclick="activateFY(\${fy.id}, \${fy.fiscal_year})"
                          class="text-xs px-3 py-1.5 rounded-lg border border-indigo-300 text-indigo-600 hover:bg-indigo-50 font-medium transition-colors">
                          <i class="fas fa-check-circle mr-1"></i>운영 설정
                        </button>\` : ''}
                      <button onclick="openFYGrantModal(\${fy.id}, \${fy.fiscal_year}, \${fy.default_days})"
                        class="text-xs px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 font-medium transition-colors">
                        <i class="fas fa-gift mr-1"></i>일괄 부여
                      </button>
                      <button onclick="openFYGrantDetail(\${fy.fiscal_year})"
                        class="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50 font-medium transition-colors">
                        <i class="fas fa-list mr-1"></i>부여 현황
                      </button>
                      <button onclick="openFYModal(\${fy.id}, \${fy.fiscal_year}, \${fy.start_month}, \${fy.default_days}, '\${escHtml(fy.note||'')}')"
                        class="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium transition-colors">
                        <i class="fas fa-edit mr-1"></i>수정
                      </button>
                      <button onclick="deleteFY(\${fy.id}, \${fy.fiscal_year})"
                        class="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 font-medium transition-colors">
                        <i class="fas fa-trash mr-1"></i>삭제
                      </button>
                    </div>
                  </div>
                </div>
              \`;
            }).join('')}
        </div>
      </div>

    </div>

    <!-- 회계연도 추가/수정 모달 -->
    <div id="fy-modal" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 hidden">
      <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h4 id="fy-modal-title" class="text-lg font-bold text-gray-800 mb-5"></h4>
        <input type="hidden" id="fy-edit-id" />
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">회계연도 <span class="text-red-500">*</span></label>
              <input id="fy-year" type="number" min="2000" max="2099" placeholder="\${currentYear}"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">시작월 <span class="text-red-500">*</span></label>
              <select id="fy-start-month"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                \${monthNames.map((m,i) => '<option value="' + (i+1) + '">' + m + '</option>').join('')}
              </select>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">기본 연차 일수</label>
            <div class="flex items-center gap-2">
              <input id="fy-default-days" type="number" min="0" max="365" value="15"
                class="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <span class="text-sm text-gray-500">일 (일괄 부여 시 기본값)</span>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <input id="fy-note" type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="예) 4월 회계연도 적용" />
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-3"><i class="fas fa-info-circle mr-1"></i>종료월은 시작월 기준으로 자동 계산됩니다.</p>
        <div id="fy-modal-err" class="text-red-500 text-sm mt-3 hidden"></div>
        <div class="flex gap-3 mt-5">
          <button onclick="saveFY()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium transition-colors">저장</button>
          <button onclick="closeFYModal()" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors">취소</button>
        </div>
      </div>
    </div>

    <!-- 연차 일괄 부여 모달 -->
    <div id="fy-grant-modal" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 hidden">
      <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h4 class="text-lg font-bold text-gray-800 mb-1">연차 일괄 부여</h4>
        <p id="fy-grant-subtitle" class="text-sm text-gray-500 mb-5"></p>
        <input type="hidden" id="fy-grant-year" />
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">부여 일수 <span class="text-red-500">*</span></label>
            <div class="flex items-center gap-2">
              <input id="fy-grant-days" type="number" min="0" max="365"
                class="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <span class="text-sm text-gray-500">일</span>
            </div>
          </div>
          <div class="flex items-center gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <input type="checkbox" id="fy-grant-overwrite" class="rounded" />
            <label for="fy-grant-overwrite" class="text-sm text-amber-800 cursor-pointer">
              <i class="fas fa-exclamation-triangle mr-1 text-amber-500"></i>이미 부여된 직원도 덮어쓰기
            </label>
          </div>
        </div>
        <div id="fy-grant-msg" class="mt-3 text-sm hidden"></div>
        <div class="flex gap-3 mt-5">
          <button onclick="bulkGrantLeave()" class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors">
            <i class="fas fa-gift mr-1"></i>전체 부여 실행
          </button>
          <button onclick="closeFYGrantModal()" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors">취소</button>
        </div>
      </div>
    </div>
  \`;

  // 정책 탭 초기화
  switchPolicyTab(savedPolicy);
}

// ── 정책 탭 전환 ────────────────────────────────────────────
function switchPolicyTab(tab) {
  fyPolicyTab = tab;
  ['fiscal','hire_date'].forEach(t => {
    const btn = document.getElementById('ptab-' + t);
    const desc = document.getElementById('policy-desc-' + t);
    if (!btn || !desc) return;
    if (t === tab) {
      btn.classList.add('bg-white','text-indigo-600','shadow-sm');
      btn.classList.remove('text-slate-500');
      desc.classList.remove('hidden');
    } else {
      btn.classList.remove('bg-white','text-indigo-600','shadow-sm');
      btn.classList.add('text-slate-500');
      desc.classList.add('hidden');
    }
  });
  // 미리보기 초기화
  const area = document.getElementById('policy-preview-area');
  if (area) area.classList.add('hidden');
  fyPreviewData = null;
}

// ── 세부 정책 값 수집 ───────────────────────────────────────
function collectPolicySettings() {
  return {
    leave_base_days:        document.getElementById('policy-base-days')?.value || '15',
    leave_max_days:         document.getElementById('policy-max-days')?.value  || '25',
    leave_probation_days:   document.getElementById('policy-probation-days')?.value || '11',
    leave_tenure_unit:      document.getElementById('policy-tenure-unit')?.value || '2',
    leave_tenure_increment: document.getElementById('policy-tenure-incr')?.value || '1',
  };
}

// ── 미리보기 ────────────────────────────────────────────────
async function previewAutoGrant() {
  const fy = Number(document.getElementById('policy-fy-select')?.value);
  if (!fy) { showToast('회계연도를 선택하세요.', 'error'); return; }

  // 세부 정책 먼저 저장
  await api('PUT', '/settings/system', collectPolicySettings());

  const area = document.getElementById('policy-preview-area');
  const tableEl = document.getElementById('policy-preview-table');
  area.classList.remove('hidden');
  tableEl.innerHTML = '<div class="flex justify-center py-6"><i class="fas fa-spinner fa-spin text-indigo-400 text-xl"></i></div>';

  const res = await api('POST', '/settings/leave-grants/preview', {
    fiscal_year: fy,
    policy_type: fyPolicyTab
  });

  if (res.error) { tableEl.innerHTML = '<p class="text-red-500 text-sm p-3">' + res.error + '</p>'; return; }

  fyPreviewData = res;

  const rows = res.preview;
  const upCount   = rows.filter(r => r.diff > 0).length;
  const downCount = rows.filter(r => r.diff < 0).length;
  const sameCount = rows.filter(r => r.diff === 0).length;

  let html = \`
    <div class="flex gap-4 mb-3 flex-wrap">
      <span class="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium"><i class="fas fa-arrow-up mr-1"></i>증가 \${upCount}명</span>
      <span class="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium"><i class="fas fa-arrow-down mr-1"></i>감소 \${downCount}명</span>
      <span class="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full font-medium"><i class="fas fa-minus mr-1"></i>변동 없음 \${sameCount}명</span>
      <span class="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-medium">
        \${fyPolicyTab === 'fiscal' ? '회계연도 기준 · ' + fy + '년도' : '입사일 기준 · 오늘 기준'}
      </span>
    </div>
    <div class="border border-gray-200 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="text-left px-4 py-2.5 text-gray-600 font-semibold text-xs">직원</th>
            <th class="text-left px-3 py-2.5 text-gray-600 font-semibold text-xs">입사일</th>
            <th class="text-center px-3 py-2.5 text-gray-600 font-semibold text-xs">근속</th>
            <th class="text-center px-3 py-2.5 text-gray-600 font-semibold text-xs">현재</th>
            <th class="text-center px-3 py-2.5 text-gray-600 font-semibold text-xs">계산값</th>
            <th class="text-center px-3 py-2.5 text-gray-600 font-semibold text-xs">변동</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
  \`;

  rows.forEach(r => {
    const tenureStr = r.tenure_years > 0
      ? r.tenure_years + '년 ' + r.tenure_months + '개월'
      : r.tenure_months + '개월';
    const diffStr = r.diff > 0
      ? '<span class="text-green-600 font-bold">+' + r.diff + '일</span>'
      : r.diff < 0
        ? '<span class="text-red-500 font-bold">' + r.diff + '일</span>'
        : '<span class="text-gray-400">-</span>';
    const rowClass = r.diff !== 0 ? 'bg-yellow-50' : '';
    html += \`
      <tr class="hover:bg-gray-50 \${rowClass}">
        <td class="px-4 py-2.5">
          <div class="font-medium text-gray-800">\${r.name}</div>
          <div class="text-xs text-gray-400">\${r.department}</div>
        </td>
        <td class="px-3 py-2.5 text-xs text-gray-500">\${r.hire_date}</td>
        <td class="text-center px-3 py-2.5 text-xs text-gray-600">\${tenureStr}</td>
        <td class="text-center px-3 py-2.5 font-medium text-gray-700">\${r.current_days}일</td>
        <td class="text-center px-3 py-2.5 font-bold text-indigo-600">\${r.calculated_days}일</td>
        <td class="text-center px-3 py-2.5">\${diffStr}</td>
      </tr>
    \`;
  });

  html += \`</tbody></table></div>\`;
  tableEl.innerHTML = html;
}

// ── 자동 부여 실행 ───────────────────────────────────────────
async function applyAutoGrant(fromPreview) {
  const fy = Number(document.getElementById('policy-fy-select')?.value);
  if (!fy) { showToast('회계연도를 선택하세요.', 'error'); return; }

  const overwrite = fromPreview
    ? (document.getElementById('preview-overwrite')?.checked || false)
    : false;

  const policyLabel = fyPolicyTab === 'fiscal' ? '회계연도 기준' : '입사일 기준';
  const overwriteLabel = overwrite ? '이미 부여된 직원도 덮어씁니다' : '이미 부여된 직원은 건너뜁니다';

  if (!confirm(fy + '년도에 ' + policyLabel + '으로 연차를 자동 부여하시겠습니까? (' + overwriteLabel + ')')) return;

  // 세부 정책 저장
  await api('PUT', '/settings/system', collectPolicySettings());

  const res = await api('POST', '/settings/leave-grants/auto-apply', {
    fiscal_year:  fy,
    policy_type:  fyPolicyTab,
    overwrite
  });

  if (res.error) { showToast(res.error, 'error'); return; }

  showToast(
    '완료! 신규 ' + res.inserted + '명 부여, 수정 ' + res.updated + '명, 건너뜀 ' + res.skipped + '명 (총 ' + res.total + '명)'
  );
  renderAnnualLeaveTab(document.getElementById('settings-tab-content'));
}

// ─── 부여 현황 상세 화면 ────────────────────────
async function openFYGrantDetail(fiscalYear) {
  fySelectedYear = fiscalYear;
  const container = document.getElementById('settings-tab-content');
  container.innerHTML = '<div class="text-gray-400 py-8 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</div>';
  const grants = await api('GET', '/settings/leave-grants/' + fiscalYear);
  if (grants.error) { container.innerHTML = \`<p class="text-red-500">\${grants.error}</p>\`; return; }

  container.innerHTML = \`
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <button onclick="renderAnnualLeaveTab(document.getElementById('settings-tab-content'))"
          class="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm font-medium hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
          <i class="fas fa-arrow-left mr-1"></i>목록으로
        </button>
        <div>
          <h3 class="text-lg font-semibold text-gray-800"><i class="fas fa-list mr-2 text-blue-500"></i>\${fiscalYear}년도 연차 부여 현황</h3>
          <p class="text-xs text-gray-400">\${grants.length}명에게 부여됨</p>
        </div>
      </div>

      \${grants.length === 0 ? \`
        <div class="card p-8 text-center text-gray-400">
          <i class="fas fa-inbox text-4xl mb-3 block opacity-30"></i>
          \${fiscalYear}년도 부여 내역이 없습니다.
          <div class="mt-3">
            <button onclick="renderAnnualLeaveTab(document.getElementById('settings-tab-content'))"
              class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">← 목록으로 돌아가 자동 부여하기</button>
          </div>
        </div>
      \` : \`
        <div class="card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-gray-600 font-semibold">사원번호</th>
                  <th class="px-4 py-3 text-left text-gray-600 font-semibold">이름</th>
                  <th class="px-4 py-3 text-left text-gray-600 font-semibold">부서</th>
                  <th class="px-4 py-3 text-left text-gray-600 font-semibold">직급</th>
                  <th class="px-4 py-3 text-center text-gray-600 font-semibold">부여일수</th>
                  <th class="px-4 py-3 text-center text-gray-600 font-semibold">사용일수</th>
                  <th class="px-4 py-3 text-center text-gray-600 font-semibold">잔여</th>
                  <th class="px-4 py-3 text-left text-gray-600 font-semibold">메모</th>
                  <th class="px-4 py-3 text-center text-gray-600 font-semibold">수정</th>
                </tr>
              </thead>
              <tbody>
                \${grants.map(g => {
                  const remaining = g.granted_days - g.used_days;
                  const pct = g.granted_days > 0 ? Math.round((g.used_days / g.granted_days) * 100) : 0;
                  const barColor = pct >= 80 ? 'bg-red-400' : pct >= 50 ? 'bg-amber-400' : 'bg-indigo-500';
                  return \`
                    <tr class="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td class="px-4 py-3 text-gray-500 text-xs">\${g.employee_id}</td>
                      <td class="px-4 py-3 font-medium text-gray-800">\${g.name}</td>
                      <td class="px-4 py-3 text-gray-600">\${g.department}</td>
                      <td class="px-4 py-3 text-gray-600">\${g.position}</td>
                      <td class="px-4 py-3 text-center">
                        <span class="font-semibold text-indigo-700">\${g.granted_days}일</span>
                      </td>
                      <td class="px-4 py-3 text-center text-gray-600">\${g.used_days}일</td>
                      <td class="px-4 py-3 text-center">
                        <div class="flex items-center gap-2 justify-center">
                          <span class="font-medium \${remaining < 3 ? 'text-red-600' : 'text-green-700'}">\${remaining}일</span>
                          <div class="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div class="\${barColor} h-full rounded-full" style="width:\${pct}%"></div>
                          </div>
                        </div>
                      </td>
                      <td class="px-4 py-3 text-xs text-gray-400">\${g.note || '-'}</td>
                      <td class="px-4 py-3 text-center">
                        <button onclick="openGrantEditModal(\${g.id}, '\${escHtml(g.name)}', \${g.granted_days}, '\${escHtml(g.note||'')}')"
                          class="text-xs px-2.5 py-1 rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 font-medium transition-colors">
                          <i class="fas fa-edit"></i>
                        </button>
                      </td>
                    </tr>
                  \`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      \`}
    </div>

    <!-- 개별 부여일수 수정 모달 -->
    <div id="grant-edit-modal" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 hidden">
      <div class="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h4 class="text-lg font-bold text-gray-800 mb-1">연차 수정</h4>
        <p id="grant-edit-name" class="text-sm text-gray-500 mb-4"></p>
        <input type="hidden" id="grant-edit-id" />
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">부여 일수</label>
            <div class="flex items-center gap-2">
              <input id="grant-edit-days" type="number" min="0" max="365"
                class="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <span class="text-sm text-gray-500">일</span>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <input id="grant-edit-note" type="text"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="수정 사유 (선택)" />
          </div>
        </div>
        <div id="grant-edit-err" class="text-red-500 text-sm mt-3 hidden"></div>
        <div class="flex gap-3 mt-5">
          <button onclick="saveGrantEdit()" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium transition-colors">저장</button>
          <button onclick="closeGrantEditModal()" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors">취소</button>
        </div>
      </div>
    </div>
  \`;
}

// ── 회계연도 모달 함수 ─────────────────────────
function openFYModal(id, year, startMonth, defaultDays, note) {
  document.getElementById('fy-modal').classList.remove('hidden');
  document.getElementById('fy-modal-err').classList.add('hidden');
  const monthNames = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
  if (id) {
    document.getElementById('fy-modal-title').textContent = '회계연도 수정';
    document.getElementById('fy-edit-id').value = id;
    document.getElementById('fy-year').value = year;
    document.getElementById('fy-start-month').value = startMonth || 1;
    document.getElementById('fy-default-days').value = defaultDays != null ? defaultDays : 15;
    document.getElementById('fy-note').value = note || '';
  } else {
    document.getElementById('fy-modal-title').textContent = '회계연도 추가';
    document.getElementById('fy-edit-id').value = '';
    document.getElementById('fy-year').value = new Date().getFullYear() + 1;
    document.getElementById('fy-start-month').value = 1;
    document.getElementById('fy-default-days').value = 15;
    document.getElementById('fy-note').value = '';
  }
}

function closeFYModal() {
  document.getElementById('fy-modal').classList.add('hidden');
}

async function saveFY() {
  const id = document.getElementById('fy-edit-id').value;
  const fiscal_year = Number(document.getElementById('fy-year').value);
  const start_month = Number(document.getElementById('fy-start-month').value);
  const default_days = Number(document.getElementById('fy-default-days').value) || 15;
  const note = document.getElementById('fy-note').value.trim();
  const errEl = document.getElementById('fy-modal-err');

  if (!fiscal_year || fiscal_year < 2000) {
    errEl.textContent = '올바른 연도를 입력해주세요. (2000 이상)';
    errEl.classList.remove('hidden'); return;
  }

  const method = id ? 'PUT' : 'POST';
  const endpoint = id ? '/settings/fiscal-years/' + id : '/settings/fiscal-years';
  const res = await api(method, endpoint, { fiscal_year, start_month, default_days, note });
  if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); return; }

  closeFYModal();
  renderAnnualLeaveTab(document.getElementById('settings-tab-content'));
}

async function deleteFY(id, year) {
  if (!confirm(year + '년도 회계연도를 삭제하시겠습니까? (연차 부여 내역이 있으면 삭제할 수 없습니다)')) return;
  const res = await api('DELETE', '/settings/fiscal-years/' + id);
  if (res.error) { alert(res.error); return; }
  renderAnnualLeaveTab(document.getElementById('settings-tab-content'));
}

async function activateFY(id, year) {
  if (!confirm(year + '년도를 현재 운영 중인 회계연도로 설정하시겠습니까?')) return;
  const res = await api('POST', '/settings/fiscal-years/' + id + '/activate');
  if (res.error) { alert(res.error); return; }
  renderAnnualLeaveTab(document.getElementById('settings-tab-content'));
}

// ── 일괄 부여 모달 ────────────────────────────
function openFYGrantModal(id, year, defaultDays) {
  document.getElementById('fy-grant-modal').classList.remove('hidden');
  document.getElementById('fy-grant-year').value = year;
  document.getElementById('fy-grant-days').value = defaultDays || 15;
  document.getElementById('fy-grant-overwrite').checked = false;
  document.getElementById('fy-grant-subtitle').textContent = year + '년도 전체 직원에게 연차를 일괄 부여합니다.';
  document.getElementById('fy-grant-msg').classList.add('hidden');
}

function closeFYGrantModal() {
  document.getElementById('fy-grant-modal').classList.add('hidden');
}

async function bulkGrantLeave() {
  const fiscal_year = Number(document.getElementById('fy-grant-year').value);
  const days = Number(document.getElementById('fy-grant-days').value);
  const overwrite = document.getElementById('fy-grant-overwrite').checked;
  const msgEl = document.getElementById('fy-grant-msg');

  if (!days || days < 0) { alert('올바른 연차 일수를 입력해주세요.'); return; }
  if (!confirm(fiscal_year + '년도 전체 직원에게 ' + days + '일을 부여하시겠습니까? (' + (overwrite ? '이미 부여된 직원도 덮어씁니다' : '이미 부여된 직원은 건너뜁니다') + ')')) return;

  msgEl.classList.add('hidden');
  const res = await api('POST', '/settings/leave-grants/bulk', { fiscal_year, days, overwrite });
  if (res.error) {
    msgEl.textContent = res.error; msgEl.className = 'mt-3 text-sm text-red-500'; msgEl.classList.remove('hidden'); return;
  }
  msgEl.innerHTML = '<i class="fas fa-check-circle mr-1"></i>완료! 부여/수정: <strong>' + res.inserted + '명</strong>' + (res.skipped > 0 ? ', 건너뜀: ' + res.skipped + '명' : '') + ' (총 ' + res.total + '명)';
  msgEl.className = 'mt-3 text-sm text-green-600';
  msgEl.classList.remove('hidden');
  setTimeout(() => {
    closeFYGrantModal();
    renderAnnualLeaveTab(document.getElementById('settings-tab-content'));
  }, 1500);
}

// ── 개별 부여일수 수정 모달 ─────────────────────
function openGrantEditModal(id, name, days, note) {
  document.getElementById('grant-edit-modal').classList.remove('hidden');
  document.getElementById('grant-edit-id').value = id;
  document.getElementById('grant-edit-name').textContent = name + ' 님의 연차를 수정합니다.';
  document.getElementById('grant-edit-days').value = days;
  document.getElementById('grant-edit-note').value = note || '';
  document.getElementById('grant-edit-err').classList.add('hidden');
}

function closeGrantEditModal() {
  document.getElementById('grant-edit-modal').classList.add('hidden');
}

async function saveGrantEdit() {
  const id = document.getElementById('grant-edit-id').value;
  const granted_days = Number(document.getElementById('grant-edit-days').value);
  const note = document.getElementById('grant-edit-note').value.trim();
  const errEl = document.getElementById('grant-edit-err');

  if (isNaN(granted_days) || granted_days < 0) {
    errEl.textContent = '올바른 일수를 입력해주세요.'; errEl.classList.remove('hidden'); return;
  }

  const res = await api('PUT', '/settings/leave-grants/' + id, { granted_days, note });
  if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); return; }

  closeGrantEditModal();
  openFYGrantDetail(fySelectedYear);
}


// ── 시스템 설정 탭 ──────────────────────────────
async function renderSystemTab(container) {
  container.innerHTML = '<div class="text-gray-400 py-8 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</div>';
  const sys = await api('GET', '/settings/system');
  if (sys.error) { container.innerHTML = \`<p class="text-red-500">\${sys.error}</p>\`; return; }

  container.innerHTML = \`
    <div class="card p-6 max-w-2xl">
      <h3 class="text-lg font-semibold text-gray-700 mb-6"><i class="fas fa-sliders-h mr-2 text-indigo-500"></i>시스템 기본 설정</h3>
      <div class="space-y-5">

        <div class="pb-5 border-b border-gray-100">
          <label class="block text-sm font-semibold text-gray-700 mb-1">회사명</label>
          <p class="text-xs text-gray-400 mb-2">시스템 상단에 표시될 회사명입니다.</p>
          <input id="sys-company-name" type="text" value="\${escHtml(sys.company_name || '')}"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="예) (주)제이컴퍼니" />
        </div>

        <div class="pb-5 border-b border-gray-100">
          <label class="block text-sm font-semibold text-gray-700 mb-1">기본 연차 일수</label>
          <p class="text-xs text-gray-400 mb-2">신규 직원 등록 시 기본으로 부여될 연차 일수입니다.</p>
          <div class="flex items-center gap-2">
            <input id="sys-default-annual" type="number" min="0" max="365" value="\${sys.default_annual_leave || 15}"
              class="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            <span class="text-sm text-gray-500">일</span>
          </div>
        </div>

        <div class="pb-5 border-b border-gray-100">
          <label class="block text-sm font-semibold text-gray-700 mb-1">연차 승인 방식</label>
          <p class="text-xs text-gray-400 mb-2">연차 신청 시 처리 방식을 선택합니다.</p>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="sys-approve-mode" value="manual" \${(sys.leave_approval_mode || 'manual') === 'manual' ? 'checked' : ''}
                class="text-indigo-600" />
              <span class="text-sm text-gray-700">수동 승인 (관리자가 직접 승인)</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="sys-approve-mode" value="auto" \${sys.leave_approval_mode === 'auto' ? 'checked' : ''}
                class="text-indigo-600" />
              <span class="text-sm text-gray-700">자동 승인</span>
            </label>
          </div>
        </div>

      </div>
      <div id="sys-save-msg" class="mt-4 text-sm hidden"></div>
      <div class="mt-6">
        <button onclick="saveSystemSettings()"
          class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors">
          <i class="fas fa-save mr-2"></i>설정 저장
        </button>
      </div>
    </div>
  \`;
}

async function saveSystemSettings() {
  const companyName = document.getElementById('sys-company-name').value.trim();
  const defaultAnnual = Number(document.getElementById('sys-default-annual').value) || 15;
  const approveMode = document.querySelector('input[name="sys-approve-mode"]:checked');
  const msgEl = document.getElementById('sys-save-msg');

  const payload = {
    company_name: companyName,
    default_annual_leave: defaultAnnual,
    leave_approval_mode: approveMode ? approveMode.value : 'manual'
  };

  const res = await api('PUT', '/settings/system', payload);
  if (res.error) {
    msgEl.textContent = res.error; msgEl.className = 'text-sm text-red-500'; msgEl.classList.remove('hidden'); return;
  }
  msgEl.textContent = '설정이 저장되었습니다.';
  msgEl.className = 'text-sm text-green-600';
  msgEl.classList.remove('hidden');
  setTimeout(() => msgEl.classList.add('hidden'), 3000);
}

// ── 설정 > 직원 관리 탭 ──────────────────────────────
let settingsEmpFilter = 'all';
let settingsEmpList = [];

async function renderSettingsEmployees(container) {
  container.innerHTML = '<div class="text-gray-400 py-8 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</div>';
  const users = await api('GET', '/users');
  if (users.error) { container.innerHTML = \`<p class="text-red-500">\${users.error}</p>\`; return; }
  settingsEmpList = users;

  const depts = ['all', ...new Set(users.map(u => u.department))].filter(Boolean);

  container.innerHTML = \`
    <div class="space-y-4">

      <!-- 헤더 -->
      <div class="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h3 class="text-lg font-semibold text-gray-800"><i class="fas fa-users-cog mr-2 text-indigo-500"></i>직원 관리</h3>
          <p class="text-xs text-gray-400 mt-0.5">직원 정보 수정, 비밀번호 초기화, 삭제를 한 곳에서 관리합니다.</p>
        </div>
        <button onclick="openSettingsAddUser()"
          class="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <i class="fas fa-plus mr-1"></i>직원 추가
        </button>
      </div>

      <!-- 부서 필터 -->
      <div class="flex flex-wrap gap-2">
        \${depts.map(d => \`
          <button onclick="filterSettingsEmp('\${escHtml(d)}')" id="semp-tab-\${d === 'all' ? 'all' : escHtml(d)}"
            class="semp-tab px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
              \${settingsEmpFilter === d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400'}">
            \${d === 'all' ? '전체' : d}
            <span class="ml-1 opacity-70">\${d === 'all' ? users.length : users.filter(u => u.department === d).length}</span>
          </button>
        \`).join('')}
      </div>

      <!-- 직원 테이블 -->
      <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b">
              <tr>
                <th class="px-4 py-3 text-left text-gray-600 font-semibold">사원번호</th>
                <th class="px-4 py-3 text-left text-gray-600 font-semibold">이름</th>
                <th class="px-4 py-3 text-left text-gray-600 font-semibold">부서 / 직급</th>
                <th class="px-4 py-3 text-left text-gray-600 font-semibold hidden md:table-cell">이메일</th>
                <th class="px-4 py-3 text-center text-gray-600 font-semibold">권한</th>
                <th class="px-4 py-3 text-center text-gray-600 font-semibold">연차</th>
                <th class="px-4 py-3 text-center text-gray-600 font-semibold">관리</th>
              </tr>
            </thead>
            <tbody id="semp-tbody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 직원 추가/수정 모달 -->
    <div id="semp-modal" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 hidden">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-screen overflow-y-auto">
        <div class="p-6">
          <h4 id="semp-modal-title" class="text-lg font-bold text-gray-800 mb-5"></h4>
          <input type="hidden" id="semp-edit-id" />
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">사원번호 <span class="text-red-500">*</span></label>
              <input id="semp-empid" type="text" placeholder="EMP001"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">이름 <span class="text-red-500">*</span></label>
              <input id="semp-name" type="text" placeholder="홍길동"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div class="col-span-2">
              <label class="block text-xs font-semibold text-gray-600 mb-1">이메일 <span class="text-red-500">*</span></label>
              <input id="semp-email" type="email" placeholder="example@company.com"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div id="semp-pw-wrap" class="col-span-2">
              <label class="block text-xs font-semibold text-gray-600 mb-1">비밀번호 <span class="text-red-500">*</span></label>
              <input id="semp-password" type="password" placeholder="초기 비밀번호"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">부서 <span class="text-red-500">*</span></label>
              <select id="semp-dept"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">-- 부서 선택 --</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">직급 <span class="text-red-500">*</span></label>
              <select id="semp-pos"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="">-- 직급 선택 --</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">입사일 <span class="text-red-500">*</span></label>
              <input id="semp-hire" type="date"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">연락처</label>
              <input id="semp-phone" type="text" placeholder="010-0000-0000"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">연차 총일수</label>
              <input id="semp-annual" type="number" min="0" max="365" value="15"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-1">권한</label>
              <select id="semp-role"
                class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                <option value="employee">일반직원</option>
                <option value="admin">관리자</option>
              </select>
            </div>
          </div>
          <div id="semp-modal-err" class="text-red-500 text-sm mt-3 hidden"></div>
          <div class="flex gap-3 mt-5">
            <button onclick="saveSettingsEmp()"
              class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-medium transition-colors">저장</button>
            <button onclick="closeSempModal()"
              class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors">취소</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 비밀번호 초기화 모달 -->
    <div id="semp-pw-modal" class="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 hidden">
      <div class="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h4 class="text-lg font-bold text-gray-800 mb-1">비밀번호 초기화</h4>
        <p id="semp-pw-target" class="text-sm text-gray-500 mb-4"></p>
        <input type="hidden" id="semp-pw-uid" />
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 <span class="text-red-500">*</span></label>
          <input id="semp-pw-new" type="password" placeholder="새 비밀번호를 입력하세요"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div class="mt-3">
          <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
          <input id="semp-pw-confirm" type="password" placeholder="비밀번호를 다시 입력하세요"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div id="semp-pw-err" class="text-red-500 text-sm mt-3 hidden"></div>
        <div class="flex gap-3 mt-5">
          <button onclick="confirmResetPw()"
            class="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-lg font-medium transition-colors">
            <i class="fas fa-key mr-1"></i>초기화
          </button>
          <button onclick="closePwModal()"
            class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors">취소</button>
        </div>
      </div>
    </div>
  \`;

  filterSettingsEmp(settingsEmpFilter);
}

function filterSettingsEmp(dept) {
  settingsEmpFilter = dept;
  document.querySelectorAll('.semp-tab').forEach(btn => {
    const isActive = btn.id === 'semp-tab-' + (dept === 'all' ? 'all' : dept);
    if (isActive) {
      btn.className = 'semp-tab px-3 py-1.5 rounded-full text-xs font-medium border transition-colors bg-indigo-600 text-white border-indigo-600';
    } else {
      btn.className = 'semp-tab px-3 py-1.5 rounded-full text-xs font-medium border transition-colors bg-white text-gray-600 border-gray-200 hover:border-indigo-400';
    }
  });
  const filtered = dept === 'all' ? settingsEmpList : settingsEmpList.filter(u => u.department === dept);
  const tbody = document.getElementById('semp-tbody');
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-10">해당 부서 직원이 없습니다.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(u => \`
    <tr class="border-t border-gray-100 hover:bg-gray-50 transition-colors" id="semp-row-\${u.id}">
      <td class="px-4 py-3 text-gray-500 text-xs font-mono">\${u.employee_id}</td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">\${u.name[0]}</div>
          <span class="font-medium text-gray-800">\${u.name}</span>
        </div>
      </td>
      <td class="px-4 py-3 text-gray-600 text-xs">
        <div>\${u.department}</div>
        <div class="text-gray-400">\${u.position}</div>
      </td>
      <td class="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">\${u.email}</td>
      <td class="px-4 py-3 text-center">
        <span class="badge \${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}">
          \${u.role === 'admin' ? '관리자' : '직원'}
        </span>
      </td>
      <td class="px-4 py-3 text-center">
        <span class="font-medium text-indigo-600">\${u.annual_leave_total}일</span>
      </td>
      <td class="px-4 py-3">
        <div class="flex items-center justify-center gap-1">
          <button onclick="openSettingsEditUser(\${u.id})"
            title="정보 수정"
            class="text-xs px-2 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="openResetPwModal(\${u.id})"
            title="비밀번호 초기화"
            class="text-xs px-2 py-1 rounded border border-amber-200 text-amber-600 hover:bg-amber-50 transition-colors">
            <i class="fas fa-key"></i>
          </button>
          <button onclick="deleteSettingsUser(\${u.id})"
            title="직원 삭제"
            class="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  \`).join('');
}

async function openSettingsAddUser() {
  document.getElementById('semp-modal').classList.remove('hidden');
  document.getElementById('semp-modal-title').textContent = '직원 추가';
  document.getElementById('semp-edit-id').value = '';
  document.getElementById('semp-empid').value = '';
  document.getElementById('semp-name').value = '';
  document.getElementById('semp-email').value = '';
  document.getElementById('semp-password').value = '';
  document.getElementById('semp-hire').value = '';
  document.getElementById('semp-phone').value = '';
  document.getElementById('semp-annual').value = 15;
  document.getElementById('semp-role').value = 'employee';
  document.getElementById('semp-pw-wrap').style.display = '';
  document.getElementById('semp-modal-err').classList.add('hidden');
  await loadDeptPosSelects('', '');
}

async function openSettingsEditUser(id) {
  const u = settingsEmpList.find(x => x.id === id);
  if (!u) return;
  document.getElementById('semp-modal').classList.remove('hidden');
  document.getElementById('semp-modal-title').textContent = '직원 정보 수정';
  document.getElementById('semp-edit-id').value = id;
  document.getElementById('semp-empid').value = u.employee_id;
  document.getElementById('semp-name').value = u.name;
  document.getElementById('semp-email').value = u.email;
  document.getElementById('semp-hire').value = u.hire_date;
  document.getElementById('semp-phone').value = u.phone || '';
  document.getElementById('semp-annual').value = u.annual_leave_total;
  document.getElementById('semp-role').value = u.role;
  document.getElementById('semp-pw-wrap').style.display = 'none';
  document.getElementById('semp-modal-err').classList.add('hidden');
  await loadDeptPosSelects(u.department, u.position);
}

// 부서/직급 select 옵션을 API에서 실시간 로드하는 헬퍼
async function loadDeptPosSelects(currentDept, currentPos) {
  const [depts, positions] = await Promise.all([
    api('GET', '/settings/departments'),
    api('GET', '/settings/positions')
  ]);

  const deptSel = document.getElementById('semp-dept');
  const posSel  = document.getElementById('semp-pos');

  // 부서 드롭다운 채우기
  deptSel.innerHTML = '<option value="">-- 부서 선택 --</option>';
  (depts || []).forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.name;
    opt.textContent = d.name;
    if (d.name === currentDept) opt.selected = true;
    deptSel.appendChild(opt);
  });
  // DB에 없는 기존 값이면 직접 추가 (데이터 무결성 유지)
  if (currentDept && !(depts || []).find(d => d.name === currentDept)) {
    const opt = document.createElement('option');
    opt.value = currentDept;
    opt.textContent = currentDept + ' (기존값)';
    opt.selected = true;
    deptSel.appendChild(opt);
  }

  // 직급 드롭다운 채우기
  posSel.innerHTML = '<option value="">-- 직급 선택 --</option>';
  (positions || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    if (p.name === currentPos) opt.selected = true;
    posSel.appendChild(opt);
  });
  // DB에 없는 기존 값이면 직접 추가
  if (currentPos && !(positions || []).find(p => p.name === currentPos)) {
    const opt = document.createElement('option');
    opt.value = currentPos;
    opt.textContent = currentPos + ' (기존값)';
    opt.selected = true;
    posSel.appendChild(opt);
  }
}

function closeSempModal() {
  document.getElementById('semp-modal').classList.add('hidden');
}

async function saveSettingsEmp() {
  const id = document.getElementById('semp-edit-id').value;
  const errEl = document.getElementById('semp-modal-err');
  errEl.classList.add('hidden');

  const employee_id    = document.getElementById('semp-empid').value.trim();
  const name           = document.getElementById('semp-name').value.trim();
  const email          = document.getElementById('semp-email').value.trim();
  const password       = document.getElementById('semp-password').value;
  const department     = document.getElementById('semp-dept').value.trim();
  const position       = document.getElementById('semp-pos').value.trim();
  const hire_date      = document.getElementById('semp-hire').value;
  const phone          = document.getElementById('semp-phone').value.trim();
  const annual_leave_total = Number(document.getElementById('semp-annual').value) || 15;
  const role           = document.getElementById('semp-role').value;

  if (!employee_id || !name || !email || !department || !position || !hire_date) {
    errEl.textContent = '필수 항목(*)을 모두 입력해주세요.'; errEl.classList.remove('hidden'); return;
  }
  if (!id && !password) {
    errEl.textContent = '비밀번호를 입력해주세요.'; errEl.classList.remove('hidden'); return;
  }

  let res;
  if (id) {
    // 수정
    res = await api('PUT', '/users/' + id, { employee_id, name, email, department, position, hire_date, phone, annual_leave_total, role });
  } else {
    // 추가
    res = await api('POST', '/users', { employee_id, name, email, password, department, position, hire_date, phone, annual_leave_total, role });
  }

  if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); return; }
  closeSempModal();
  showToast(id ? '직원 정보가 수정되었습니다.' : '직원이 추가되었습니다.');
  renderSettingsEmployees(document.getElementById('settings-tab-content'));
}

async function deleteSettingsUser(id) {
  const u = settingsEmpList.find(x => x.id === id);
  const name = u ? u.name : '이 직원';
  if (!confirm(name + ' 님을 삭제하시겠습니까? (삭제 후 복구 불가)')) return;
  const res = await api('DELETE', '/users/' + id);
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('직원이 삭제되었습니다.');
  renderSettingsEmployees(document.getElementById('settings-tab-content'));
}

// 비밀번호 초기화 모달
function openResetPwModal(id) {
  const u = settingsEmpList.find(x => x.id === id);
  if (!u) return;
  document.getElementById('semp-pw-modal').classList.remove('hidden');
  document.getElementById('semp-pw-uid').value = id;
  document.getElementById('semp-pw-target').textContent = u.name + ' (' + u.email + ') 님의 비밀번호를 초기화합니다.';
  document.getElementById('semp-pw-new').value = '';
  document.getElementById('semp-pw-confirm').value = '';
  document.getElementById('semp-pw-err').classList.add('hidden');
}

function closePwModal() {
  document.getElementById('semp-pw-modal').classList.add('hidden');
}

async function confirmResetPw() {
  const id = document.getElementById('semp-pw-uid').value;
  const newPw = document.getElementById('semp-pw-new').value;
  const confirmPw = document.getElementById('semp-pw-confirm').value;
  const errEl = document.getElementById('semp-pw-err');
  errEl.classList.add('hidden');

  if (!newPw) { errEl.textContent = '새 비밀번호를 입력해주세요.'; errEl.classList.remove('hidden'); return; }
  if (newPw.length < 4) { errEl.textContent = '비밀번호는 4자 이상이어야 합니다.'; errEl.classList.remove('hidden'); return; }
  if (newPw !== confirmPw) { errEl.textContent = '비밀번호가 일치하지 않습니다.'; errEl.classList.remove('hidden'); return; }

  const res = await api('PUT', '/users/' + id + '/reset-password', { password: newPw });
  if (res.error) { errEl.textContent = res.error; errEl.classList.remove('hidden'); return; }
  closePwModal();
  showToast('비밀번호가 초기화되었습니다.');
}

// ── 설정 > 로그인 설정 탭 ──────────────────────────────
async function renderLoginSettings(container) {
  container.innerHTML = '<div class="text-gray-400 py-8 text-center"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</div>';
  const sys = await api('GET', '/settings/system');
  if (sys.error) { container.innerHTML = \`<p class="text-red-500">\${sys.error}</p>\`; return; }

  const showTest    = sys.show_test_accounts !== 'false';
  const loginNotice = sys.login_notice || '';
  const pwMin       = sys.pw_min_length || '4';
  const sessionTmo  = sys.session_timeout_min || '480';
  const siteTitle   = sys.site_title || '사내 HR 시스템';

  container.innerHTML = \`
    <div class="space-y-5 max-w-2xl">

      <!-- 로그인 화면 표시 설정 -->
      <div class="card p-6">
        <h3 class="text-base font-semibold text-gray-800 mb-4">
          <i class="fas fa-desktop mr-2 text-indigo-500"></i>로그인 화면 설정
        </h3>
        <div class="space-y-5">

          <div class="pb-4 border-b border-gray-100">
            <label class="block text-sm font-semibold text-gray-700 mb-1">시스템 타이틀</label>
            <p class="text-xs text-gray-400 mb-2">로그인 화면 및 브라우저 탭에 표시될 제목입니다.</p>
            <input id="ls-title" type="text" value="\${escHtml(siteTitle)}"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="사내 HR 시스템" />
          </div>

          <div class="pb-4 border-b border-gray-100">
            <div class="flex items-center justify-between mb-2">
              <div>
                <label class="text-sm font-semibold text-gray-700">테스트 계정 빠른 로그인 버튼 표시</label>
                <p class="text-xs text-gray-400 mt-0.5">로그인 화면에 테스트 계정 선택 버튼을 표시합니다.</p>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="ls-show-test" class="sr-only peer" \${showTest ? 'checked' : ''} />
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
            <div id="ls-test-accounts-section" class="\${showTest ? '' : 'hidden'} mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p class="text-xs font-semibold text-gray-600 mb-2">현재 표시 중인 테스트 계정</p>
              <div id="ls-test-account-list" class="space-y-1 text-xs text-gray-600">
                <div class="flex items-center gap-2 p-2 bg-white rounded border">
                  <i class="fas fa-user-shield text-purple-500"></i>
                  <span class="font-medium">관리자</span>
                  <span class="text-gray-400">admin@company.com / admin123</span>
                </div>
                <div class="flex items-center gap-2 p-2 bg-white rounded border">
                  <i class="fas fa-user text-blue-500"></i>
                  <span class="font-medium">일반직원</span>
                  <span class="text-gray-400">dev1@company.com / pass123</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">로그인 화면 공지 문구</label>
            <p class="text-xs text-gray-400 mb-2">로그인 화면 하단에 표시할 공지나 안내 문구를 입력합니다. (비워두면 미표시)</p>
            <textarea id="ls-notice" rows="2"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              placeholder="예) 사용에 문제가 있으신 경우 인사팀으로 문의 바랍니다.">\${escHtml(loginNotice)}</textarea>
          </div>

        </div>
      </div>

      <!-- 보안 설정 -->
      <div class="card p-6">
        <h3 class="text-base font-semibold text-gray-800 mb-4">
          <i class="fas fa-shield-alt mr-2 text-green-500"></i>보안 설정
        </h3>
        <div class="space-y-5">

          <div class="pb-4 border-b border-gray-100">
            <label class="block text-sm font-semibold text-gray-700 mb-1">비밀번호 최소 길이</label>
            <p class="text-xs text-gray-400 mb-2">직원 비밀번호 설정 시 최소 자리 수 기준입니다.</p>
            <div class="flex items-center gap-2">
              <input id="ls-pw-min" type="number" min="4" max="20" value="\${pwMin}"
                class="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <span class="text-sm text-gray-500">자 이상</span>
            </div>
          </div>

          <div>
            <label class="block text-sm font-semibold text-gray-700 mb-1">세션 자동 만료 시간</label>
            <p class="text-xs text-gray-400 mb-2">로그인 후 일정 시간 동안 활동이 없으면 자동으로 로그아웃됩니다. 0이면 만료 없음.</p>
            <div class="flex items-center gap-2">
              <input id="ls-session-tmo" type="number" min="0" max="10080" value="\${sessionTmo}"
                class="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              <span class="text-sm text-gray-500">분 (0 = 제한 없음, 480 = 8시간)</span>
            </div>
          </div>

        </div>
      </div>

      <!-- 저장 -->
      <div id="ls-save-msg" class="text-sm hidden"></div>
      <button onclick="saveLoginSettings()"
        class="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors">
        <i class="fas fa-save mr-2"></i>설정 저장
      </button>

    </div>
  \`;

  // 토글 연동
  document.getElementById('ls-show-test').addEventListener('change', function() {
    const section = document.getElementById('ls-test-accounts-section');
    if (this.checked) section.classList.remove('hidden');
    else section.classList.add('hidden');
  });
}

async function saveLoginSettings() {
  const siteTitle   = document.getElementById('ls-title').value.trim();
  const showTest    = document.getElementById('ls-show-test').checked;
  const loginNotice = document.getElementById('ls-notice').value.trim();
  const pwMin       = Number(document.getElementById('ls-pw-min').value) || 4;
  const sessionTmo  = Number(document.getElementById('ls-session-tmo').value) || 0;
  const msgEl       = document.getElementById('ls-save-msg');

  const payload = {
    site_title:          siteTitle || '사내 HR 시스템',
    show_test_accounts:  showTest ? 'true' : 'false',
    login_notice:        loginNotice,
    pw_min_length:       pwMin,
    session_timeout_min: sessionTmo
  };

  const res = await api('PUT', '/settings/system', payload);
  if (res.error) {
    msgEl.textContent = res.error;
    msgEl.className = 'text-sm text-red-500';
    msgEl.classList.remove('hidden');
    return;
  }

  msgEl.textContent = '로그인 설정이 저장되었습니다.';
  msgEl.className = 'text-sm text-green-600';
  msgEl.classList.remove('hidden');
  setTimeout(() => msgEl.classList.add('hidden'), 3000);

  // 로그인 화면 테스트 계정 버튼 실시간 반영
  const testSection = document.getElementById('login-test-section');
  if (testSection) {
    testSection.style.display = showTest ? '' : 'none';
  }
}

// 초기 로드: 세션 체크 + 로그인 화면 설정 적용
(async () => {
  // 로그인 설정(공개 API 없이 공개 시스템 설정은 직접 반영)
  // 테스트 계정 섹션은 기본 표시, 설정 로드 전까지 유지
  try {
    const [authRes, sysRes] = await Promise.all([
      api('GET', '/auth/me').catch(() => null),
      fetch('/api/settings/public').then(r => r.json()).catch(() => ({}))
    ]);

    // 로그인 화면 설정 적용
    if (sysRes) {
      // 테스트 계정 버튼 표시 여부
      if (sysRes.show_test_accounts === 'false') {
        const ts = document.getElementById('login-test-section');
        if (ts) ts.style.display = 'none';
      }
      // 로그인 공지 문구
      if (sysRes.login_notice) {
        const loginCard = document.querySelector('#login-page .card');
        if (loginCard) {
          const noticeEl = document.createElement('div');
          noticeEl.className = 'mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800';
          noticeEl.innerHTML = '<i class="fas fa-info-circle mr-1"></i>' + sysRes.login_notice;
          loginCard.appendChild(noticeEl);
        }
      }
    }

    if (authRes && authRes.id) {
      currentUser = authRes;
      initApp();
    }
  } catch(e) {
    // 로그인 화면 유지
  }
})();
</script>
</body>
</html>`)
})

export default app
