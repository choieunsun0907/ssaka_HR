import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import auth from './routes/auth'
import users from './routes/users'
import leaves from './routes/leaves'
import notices from './routes/notices'
import messages from './routes/messages'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors({ origin: '*', credentials: true }))

// API 라우트
app.route('/api/auth', auth)
app.route('/api/users', users)
app.route('/api/leaves', leaves)
app.route('/api/notices', notices)
app.route('/api/messages', messages)

// 헬스체크
app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }))

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
    <div class="mb-5">
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
      <button onclick="navigate('hr')" class="sidebar-link w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-100 text-sm" data-page="hr">
        <i class="fas fa-users w-4 text-center"></i> 인사 관리
      </button>
      <button onclick="navigate('leave')" class="sidebar-link w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-100 text-sm" data-page="leave">
        <i class="fas fa-calendar-check w-4 text-center"></i> 연차 관리
        <span id="pending-badge" class="ml-auto badge" style="background:rgba(255,255,255,.2);color:#fff;display:none"></span>
      </button>
      <button onclick="navigate('notice')" class="sidebar-link w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-100 text-sm" data-page="notice">
        <i class="fas fa-bullhorn w-4 text-center"></i> 공지사항
      </button>
      <button onclick="navigate('chat')" class="sidebar-link w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-indigo-100 text-sm" data-page="chat">
        <i class="fas fa-comments w-4 text-center"></i> 사내 메신저
        <span id="unread-badge" class="ml-auto badge" style="background:rgba(255,100,100,.8);color:#fff;display:none"></span>
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

// 탭 클릭 → 입력창에 계정 정보 채우기
function fillAccount(email, password, btn) {
  // 입력창에 값 채우기
  const emailEl = document.getElementById('login-email');
  const passEl  = document.getElementById('login-password');
  emailEl.value    = email;
  passEl.value     = password;

  // 선택된 탭 강조 표시
  document.querySelectorAll('.quick-login-btn').forEach(b => {
    b.classList.remove('border-indigo-500', 'bg-indigo-50', 'ring-2', 'ring-indigo-200');
  });
  btn.classList.add('border-indigo-500', 'bg-indigo-50', 'ring-2', 'ring-indigo-200');

  // 비밀번호 입력창에 포커스 → 바로 엔터 칠 수 있도록
  passEl.focus();
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

  startUnreadPolling();
  navigate('hr');
}

// ==================== 네비게이션 ====================
function navigate(page) {
  const sidebar = document.getElementById('sidebar');
  // 이미 활성화된 메뉴를 다시 클릭하면 사이드바 토글 (모바일/데스크탑 공통)
  if (currentPage === page) {
    sidebar?.classList.toggle('open');
    return;
  }
  currentPage = page;
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
            <button onclick="deleteUser(\${u.id},'\${u.name}')" class="text-slate-400 hover:text-red-500 transition text-sm px-2 py-1"><i class="fas fa-trash"></i></button>
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

function showExcelPreview(data) {
  const prev = document.getElementById('excel-preview');
  if (!prev) return;
  prev.classList.remove('hidden');

  let html = \`
    <div class="border border-slate-200 rounded-xl overflow-hidden">
      <div class="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
        <span class="text-sm font-semibold text-slate-700">미리보기 — \${data.length}명</span>
        <button onclick="submitExcelUpload(\${JSON.stringify(data).replace(/"/g,'&quot;')})"
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
                <td class="px-3 py-2 text-slate-700">\${r.employee_id}</td>
                <td class="px-3 py-2 font-medium text-slate-800">\${r.name}</td>
                <td class="px-3 py-2 text-slate-600">\${r.department}</td>
                <td class="px-3 py-2 text-slate-600">\${r.position}</td>
                <td class="px-3 py-2 text-slate-600">\${r.hire_date}</td>
                <td class="px-3 py-2 text-slate-500">\${r.email}</td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  \`;
  prev.innerHTML = html;
}

async function submitExcelUpload(dataStr) {
  let data;
  try { data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr; } catch(e) { showToast('데이터 오류','error'); return; }

  const btn = document.querySelector('#excel-preview button');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 등록 중...'; }

  let ok = 0, fail = 0, failList = [];
  for (const user of data) {
    const res = await api('POST', '/users', user);
    if (res.error) { fail++; failList.push(user.name + '(' + res.error + ')'); }
    else ok++;
  }

  closeModal();
  if (fail > 0) {
    showToast(\`\${ok}명 등록 완료, \${fail}명 실패\`, 'error');
    console.warn('실패 목록:', failList);
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

async function deleteUser(id, name) {
  if (!confirm(\`\${name} 님을 삭제하시겠습니까?\`)) return;
  const res = await api('DELETE', '/users/' + id);
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast('직원이 삭제되었습니다.');
  renderHR(document.getElementById('page-content'));
}

// ==================== 연차 관리 ====================
async function renderLeave(container) {
  container.innerHTML = \`
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-xl font-bold text-slate-800">연차 관리</h2>
        <p class="text-slate-500 text-sm mt-0.5">\${currentUser.role === 'admin' ? '전체 직원 연차 현황 및 승인 관리' : '내 연차 현황 및 신청'}</p>
      </div>
      \${currentUser.role !== 'admin' ? \`<button onclick="openLeaveModal()" class="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition flex items-center gap-2"><i class="fas fa-plus"></i> 연차 신청</button>\` : ''}
    </div>
    <div id="leave-content">
      <div class="flex justify-center py-12"><i class="fas fa-spinner fa-spin text-indigo-400 text-2xl"></i></div>
    </div>
  \`;

  if (currentUser.role === 'admin') {
    await renderAdminLeave();
  } else {
    await renderMyLeave();
  }
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
      \${stats.pending > 0 ? \`<p class="text-xs text-amber-600 mt-2"><i class="fas fa-clock mr-1"></i>승인 대기 중: \${stats.pending}일</p>\` : ''}
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
      html += \`
        <div class="flex items-center gap-4 px-5 py-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-medium text-slate-800">\${l.leave_type}</span>
              <span class="badge badge-\${l.status}">\${l.status === 'pending' ? '대기' : l.status === 'approved' ? '승인' : '반려'}</span>
            </div>
            <div class="text-slate-500 text-xs">\${l.start_date} ~ \${l.end_date} (\${l.days}일) \${l.reason ? '· ' + l.reason : ''}</div>
          </div>
          <div class="text-xs text-slate-400">\${formatDate(l.created_at)}</div>
          \${l.status === 'pending' ? \`<button onclick="cancelLeave(\${l.id})" class="text-red-400 hover:text-red-600 text-xs px-2 py-1 border border-red-200 rounded-lg">취소</button>\` : ''}
        </div>
      \`;
    });
  }
  html += \`</div></div>\`;
  document.getElementById('leave-content').innerHTML = html;
}

async function renderAdminLeave() {
  const [allStats, pendingLeaves] = await Promise.all([
    api('GET', '/leaves/all-stats'),
    api('GET', '/leaves')
  ]);

  const pending = pendingLeaves.filter(l => l.status === 'pending');
  // 대기 배지 업데이트
  const badge = document.getElementById('pending-badge');
  if (pending.length > 0) {
    badge.textContent = pending.length;
    badge.style.display = 'inline-flex';
  }

  let html = '';
  if (pending.length > 0) {
    html += \`
      <div class="card overflow-hidden mb-6">
        <div class="px-5 py-4 border-b bg-amber-50 flex items-center gap-2">
          <i class="fas fa-clock text-amber-500"></i>
          <span class="font-semibold text-amber-700">승인 대기 (\${pending.length}건)</span>
        </div>
        <div class="divide-y">
    \`;
    pending.forEach(l => {
      html += \`
        <div class="flex items-center gap-4 px-5 py-4">
          <div class="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            <span class="text-indigo-600 font-bold text-sm">\${l.user_name[0]}</span>
          </div>
          <div class="flex-1">
            <div class="font-medium text-slate-800">\${l.user_name} <span class="text-slate-400 text-sm">(\${l.department})</span></div>
            <div class="text-slate-500 text-xs">\${l.leave_type} · \${l.start_date} ~ \${l.end_date} (\${l.days}일) \${l.reason ? '· ' + l.reason : ''}</div>
          </div>
          <div class="flex gap-2">
            <button onclick="approveLeave(\${l.id},'approved')" class="bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-green-600 transition">승인</button>
            <button onclick="approveLeave(\${l.id},'rejected')" class="bg-red-400 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-500 transition">반려</button>
          </div>
        </div>
      \`;
    });
    html += \`</div></div>\`;
  }

  html += \`
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
              <th class="text-center px-3 py-3 text-slate-500 font-medium">잔여</th>
              <th class="text-left px-3 py-3 text-slate-500 font-medium hidden md:table-cell">사용률</th>
            </tr>
          </thead>
          <tbody class="divide-y">
  \`;

  allStats.forEach(u => {
    const pct = u.annual_leave_total ? Math.round((u.used_days / u.annual_leave_total) * 100) : 0;
    html += \`
      <tr class="hover:bg-slate-50 cursor-pointer" onclick="viewUserLeaves(\${u.id}, '\${u.name}')">
        <td class="px-5 py-3">
          <div class="font-medium text-slate-800">\${u.name}</div>
          <div class="text-xs text-slate-400">\${u.department} · \${u.position}</div>
        </td>
        <td class="text-center px-3 py-3 text-slate-700">\${u.annual_leave_total}</td>
        <td class="text-center px-3 py-3 text-indigo-600 font-medium">\${u.used_days}</td>
        <td class="text-center px-3 py-3 \${u.remaining_days < 3 ? 'text-red-500' : 'text-green-600'} font-medium">\${u.remaining_days}</td>
        <td class="px-3 py-3 hidden md:table-cell">
          <div class="flex items-center gap-2">
            <div class="leave-bar flex-1"><div class="leave-bar-fill" style="width:\${pct}%"></div></div>
            <span class="text-xs text-slate-500 w-8">\${pct}%</span>
          </div>
        </td>
      </tr>
    \`;
  });
  html += \`</tbody></table></div></div>\`;
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
      html += \`
        <div class="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
          <div class="flex-1">
            <div class="flex items-center gap-2"><span class="font-medium text-sm">\${l.leave_type}</span><span class="badge badge-\${l.status}">\${l.status === 'pending' ? '대기' : l.status === 'approved' ? '승인' : '반려'}</span></div>
            <div class="text-xs text-slate-500">\${l.start_date} ~ \${l.end_date} (\${l.days}일)</div>
          </div>
        </div>
      \`;
    });
  }
  html += \`</div>\`;
  openModal(name + ' 님의 연차 내역', html);
}

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
          <option value="2">2일</option>
          <option value="3">3일</option>
          <option value="4">4일</option>
          <option value="5">5일</option>
        </select>
      </div>
      <div><label class="text-xs font-medium text-slate-600 block mb-1">사유</label><textarea name="reason" rows="3" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="연차 사유를 입력해주세요."></textarea></div>
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

async function approveLeave(id, status) {
  const res = await api('PUT', '/leaves/' + id + '/approve', { status });
  if (res.error) { showToast(res.error, 'error'); return; }
  showToast(status === 'approved' ? '승인되었습니다.' : '반려되었습니다.');
  renderLeave(document.getElementById('page-content'));
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

// 초기 로드: 세션 체크
(async () => {
  try {
    const res = await api('GET', '/auth/me');
    if (res.id) {
      currentUser = res;
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
