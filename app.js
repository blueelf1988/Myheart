/* ==========================================================
   BrandCoach Demo Web · v2.0
   - 评分报告弹窗 + 收藏到话术本
   - AI 角色选择
   - 用户岗位画像（onboarding）
   - Web Speech API 语音输入 + TTS 播放
   - 话术本 + 能力雷达图（Canvas 自绘）
   ========================================================== */

const API_BASE = (() => {
  const p = new URLSearchParams(location.search);
  if (p.get('api')) return p.get('api');
  return location.origin;
})();

// user_id：admin 模式（?user=admin 或 ?user=demo_admin_001）— 无限积分、全部剧本已解锁
function resolveUserId() {
  const p = new URLSearchParams(location.search);
  const q = (p.get('user') || '').trim();
  if (q) return q;
  if (localStorage.getItem('bc_user')) return localStorage.getItem('bc_user');
  return 'demo_user_001';
}
function isAdminUserId(uid) { return /admin/i.test(uid || ''); }
let USER_ID = resolveUserId();
let IS_ADMIN = isAdminUserId(USER_ID);
localStorage.setItem('bc_user', USER_ID);

// --------- 状态 ---------
const State = {
  env: null,
  wallet: null,
  profile: null,
  plans: null,
  packages: [],
  scripts: [],
  characters: [],
  currentScript: null,
  chosenCharacterId: null,
  session: null,
  messages: [],
  period: 'yearly',
  groupResult: null,
  coachSlots: [],
  phrasebook: [],
  history: null,
  // Web Speech
  recognition: null,
  isRecording: false,
  tts: window.speechSynthesis || null,
  ttsEnabled: true,
  // v2.1
  streak: null,
  weekly: null,
  inbox: [],
  writingPractice: [],
  ttsVoices: [],
  ttsVoice: localStorage.getItem(TTS_KEY) || '',
  lastFeedback: null,    // 最近一次评分（用于报告弹窗 + 推荐剧本跳转）
  recommendedToday: null,  // v2.2 今日复习剧本推荐
};

const DIM_LABELS = {
  grammar: '语法准确度',
  vocabulary: '词汇丰富度',
  business: '商务得体度',
  cross_cultural: '跨文化敏感度',
  marketing: '营销专业度',
};
const DIM_ORDER = ['grammar', 'vocabulary', 'business', 'cross_cultural', 'marketing'];
const TTS_KEY = 'bc_tts_voice_v2';
const STORAGE_BADGES = 'bc_seen_badges';

// ---- i18n ----
const LANG_KEY = 'bc_lang';
let LANG = localStorage.getItem(LANG_KEY) || 'zh-CN';
const I18N = {
  'zh-CN': {
    'nav.home': '首页', 'nav.scripts': '剧本库', 'nav.session': '陪练会话',
    'nav.wallet': '钱包', 'nav.subscribe': '订阅', 'nav.coaching': '1v1 教练',
    'nav.progress': '能力雷达', 'nav.admin': '团队管理',
    'dim.grammar': '语法准确度', 'dim.vocabulary': '词汇丰富度',
    'dim.business': '商务得体度', 'dim.cross_cultural': '跨文化敏感度', 'dim.marketing': '营销专业度',
    'home.greeting': '今天也要加油练习哦', 'home.start_session': '开始一次对话',
    'home.streak': '连续打卡', 'home.weekly': '本周报告', 'home.inbox': '收件箱',
    'feedback.overall': '综合评分', 'feedback.recommended': '推荐练习',
    'lang.switch': 'EN', 'lang.label': '中文',
  },
  'en-US': {
    'nav.home': 'Home', 'nav.scripts': 'Scripts', 'nav.session': 'Practice',
    'nav.wallet': 'Wallet', 'nav.subscribe': 'Subscribe', 'nav.coaching': '1v1 Coach',
    'nav.progress': 'Radar', 'nav.admin': 'Team Admin',
    'dim.grammar': 'Grammar', 'dim.vocabulary': 'Vocabulary',
    'dim.business': 'Business Etiquette', 'dim.cross_cultural': 'Cross-cultural', 'dim.marketing': 'Marketing',
    'home.greeting': 'Keep practicing today!', 'home.start_session': 'Start a session',
    'home.streak': 'Streak', 'home.weekly': 'Weekly Report', 'home.inbox': 'Inbox',
    'feedback.overall': 'Overall Score', 'feedback.recommended': 'Recommended',
    'lang.switch': '中', 'lang.label': 'English',
  },
};
function t(key) { return (I18N[LANG] || I18N['zh-CN'])[key] || (I18N['zh-CN'])[key] || key; }
function setLang(lang) {
  LANG = lang;
  localStorage.setItem(LANG_KEY, lang);
  // 更新导航标签
  $$('.navlink').forEach(a => {
    const tab = a.dataset.tab;
    const label = a.querySelector('span:not(.nav-ico):not(.nav-badge)');
    if (label) label.textContent = t('nav.' + tab);
  });
  // 更新维度标签
  for (const [k, v] of Object.entries(I18N[lang] || {})) {
    if (k.startsWith('dim.')) DIM_LABELS[k.replace('dim.', '')] = v;
  }
  // 更新语言按钮
  const langBtn = $('#langToggle');
  if (langBtn) langBtn.textContent = t('lang.switch');
  const langLabel = $('#langLabel');
  if (langLabel) langLabel.textContent = t('lang.label');
}

// --------- API 客户端 ---------
const api = {
  async req(path, opts = {}) {
    const sep = path.includes('?') ? '&' : '?';
    const hasUser = /([?&])user_id=/.test(path);
    const url = (hasUser ? API_BASE + path : API_BASE + path + sep + 'user_id=' + encodeURIComponent(USER_ID));
    const r = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': USER_ID,
        ...(opts.headers || {}),
      },
      ...opts,
    });
    const text = await r.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!r.ok) {
      const msg = (body && (body.detail || body.message)) || r.statusText;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return body;
  },
  get(p)         { return this.req(p); },
  post(p, body)  { return this.req(p, { method: 'POST', body: JSON.stringify(body || {}) }); },
  del(p)         { return this.req(p, { method: 'DELETE' }); },
  // ---- endpoints ----
  health()        { return this.get('/health'); },
  fetchEnv()      { return this.get('/admin/env'); },
  reset()         { return this.post('/admin/reset'); },
  fetchWallet()   { return this.get('/credits/wallet'); },
  fetchPackages() { return this.get('/credits/packages').then(r => r.packages || []); },
  fetchPlans()    { return this.get('/subscriptions/plans').then(r => r.plans || {}); },
  fetchScripts()  { return this.get('/scripts'); },
  fetchCharacters()      { return this.get('/characters').then(r => r.characters || []); },
  fetchCharactersFor(sid){ return this.get(`/characters/for-script/${sid}`).then(r => r.characters || []); },
  unlockScript(id){ return this.post(`/scripts/${id}/unlock`, { script_id: id }); },
  startSession(p) { return this.post('/sessions/start', p); },
  sendTurn(id, t) { return this.post(`/sessions/${id}/turn`, { user_input: t }); },
  endSession(id)  { return this.post(`/sessions/${id}/end`); },
  checkout(p)     { return this.post('/subscriptions/checkout', p); },
  payMock(id)     { return this.post('/subscriptions/pay/mock', { order_id: id }); },
  groupPurchase(p){ return this.post('/subscriptions/group', p); },
  coachSlots(w=2) { return this.get(`/coaching/slots?weeks=${w}`).then(r => r.slots || []); },
  bookCoaching(sid){ return this.post('/coaching/bookings', { slot_id: sid, pay_with_credits: false }); },
  // v2.0
  fetchProfile()  { return this.get('/me/profile'); },
  saveProfile(p)  { return this.post('/me/profile', p); },
  fetchPhrasebook(){ return this.get('/me/phrasebook').then(r => r.items || []); },
  addPhrase(p)    { return this.post('/me/phrasebook', p); },
  delPhrase(id)   { return this.del(`/me/phrasebook/${id}`); },
  fetchHistory()  { return this.get('/me/history?limit=20'); },
  // v2.1
  fetchStreak()   { return this.get('/me/streak'); },
  fetchWeekly(push=false) { return this.get(`/me/weekly-report?push=${push}`); },
  fetchInbox()    { return this.get('/me/inbox').then(r => r.items || []); },
  fetchRecommendedToday() { return this.get('/me/recommended-today'); },
  dismissRecommendedToday(sid) { return this.post('/me/recommended-today/dismiss', {script_id: sid}); },
  markInboxRead(id) { return this.post(`/me/inbox/${id}/read`); },
  fetchWritingPractice() { return this.get('/me/writing-practice').then(r => r.items || []); },
  submitWritingPractice(p) { return this.post('/me/writing-practice', p); },
  fetchTtsVoices() { return this.get('/me/tts/voices'); },
  synthTts(p) { return this.post('/me/tts/synthesize', p); },
  // v4.0 AI 剧本生成
  generateScript(desc, difficulty='mid', scene=null) {
    return this.post('/scripts/generate', { description: desc, difficulty, scene });
  },
  fetchGeneratedScripts() { return this.get('/scripts/generated/list').then(r => r.scripts || []); },
  // v4.0 SRS 间隔重复复习
  fetchSRSReviews() { return this.get('/srs/reviews'); },
  completeSRSReview(scriptId, score, quality='good') {
    return this.post('/srs/reviews/complete', { script_id: scriptId, score, quality });
  },
  fetchSRSStats() { return this.get('/srs/stats'); },
  // v4.0 定级测评
  fetchPlacementTest() { return this.get('/placement/test'); },
  submitPlacement(answers) { return this.post('/placement/submit', { answers }); },
  // v4.0 错题库
  fetchMistakes(type, limit=50) { return this.get('/mistakes/?type=' + (type||'') + '&limit=' + limit); },
  fetchMistakeStats() { return this.get('/mistakes/stats'); },
  addMistake(data) { return this.post('/mistakes/add', data); },
  markMistakeReviewed(id) { return this.post('/mistakes/' + id + '/reviewed', {}); },
  setUser(uid) {
    USER_ID = (uid || 'demo_user_001').trim();
    localStorage.setItem('bc_user', USER_ID);
    IS_ADMIN = isAdminUserId(USER_ID);
    Object.assign(State, { env: null, wallet: null, scripts: [], characters: [], currentScript: null,
                           chosenCharacterId: null, session: null, messages: [], phrasebook: [], history: null });
  },
};

// --------- 工具 ---------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const fmt = (n) => (n === '∞' || n === Infinity) ? '∞' : (n ?? 0).toLocaleString('zh-CN');
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const BADGE_LABELS = {
  'first-step':    '🎯 第一次对话',
  '7day-warrior':  '🔥 7天连续',
  '14day-grinder': '⚡ 14天连续',
  '30day-master':  '👑 30天连续',
  '100-takes':     '💯 100场累计',
};
function badgeLabel(id) { return BADGE_LABELS[id] || id; }

const SCENE_META = {
  'SC-01': { ico: '◇', title: '海外客户提案',   desc: '全球 CMO、4A、新业务 Pitch' },
  'SC-02': { ico: '◆', title: '渠道议价',       desc: 'KOL 议价、媒介采购、危机时刻' },
  'SC-03': { ico: '○', title: '跨地区协作',     desc: '全球总部、跨时区、OKR 评审' },
  'SC-04': { ico: '◈', title: '客户沟通',       desc: '危机公关、投诉、续约谈判' },
  'SC-05': { ico: '◐', title: '求职面试',       desc: 'Behavioral / Case / Final' },
  'SC-06': { ico: '◉', title: '外贸 / CEO 谈判', desc: '广交会、独家代理、欧洲 CEO' },
  'SC-07': { ico: '◍', title: 'CEO 汇报',       desc: '董事会、子公司、行业大会' },
  'SC-08': { ico: '◯', title: '商务英语日常',   desc: '寒暄、Slack、Standup、Status' },
};

function sceneOfSafe(s) {
  if (s.scene) return s.scene;
  const id = s.id;
  if (id.startsWith('S-DY')) return 'SC-08';
  if (id.startsWith('S-PR') || id.startsWith('S-BD')) return 'SC-01';
  if (id.startsWith('S-CH')) return 'SC-02';
  if (id.startsWith('S-IM')) return 'SC-03';
  if (id.startsWith('S-IN')) return 'SC-05';
  if (id.startsWith('S-SL')) return 'SC-06';
  if (id.startsWith('S-CEO')) {
    if (['S-CEO-001', 'S-CEO-004'].includes(id)) return 'SC-06';
    return 'SC-07';
  }
  return 'SC-08';
}

function toast(msg, kind = 'info') {
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  $('#toastWrap').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function openModal(html) {
  $('#modalCard').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() {
  $('#modal').hidden = true;
  $('#modalCard').innerHTML = '';
}

// --------- 路由 ---------
const Tabs = ['home', 'scripts', 'session', 'wallet', 'subscribe', 'coaching', 'progress'];
function setTab(name) {
  if (!Tabs.includes(name)) name = 'home';
  $$('.navlink').forEach(a => a.classList.toggle('active', a.dataset.tab === name));
  if (name === 'home') renderHome();
  else if (name === 'scripts') renderScripts();
  else if (name === 'session') renderSession();
  else if (name === 'wallet') renderWallet();
  else if (name === 'subscribe') renderSubscribe();
  else if (name === 'coaching') renderCoaching();
  else if (name === 'progress') renderProgress();
  else if (name === 'reviews') renderReviews();
  else if (name === 'placement') renderPlacement();
  else if (name === 'mistakes') renderMistakes();
  history.replaceState(null, '', '#' + name);
}

// --------- 渲染：全局状态 ---------

async function refreshGlobal() {
  const fail = (e, label) => {
    console.warn(`${label} fetch fail`, e);
    toast(`${label} 加载失败：${e.message || e}`, 'error');
  };
  try {
    State.wallet = await api.fetchWallet();
    State.profile = await api.fetchProfile();
  } catch (e) { fail(e, '账户'); }
  try {
    State.env = await api.fetchEnv();
  } catch (e) {
    try { const h = await api.health(); State.env = { provider: 'mock' }; }
    catch (e2) { State.env = { provider: 'unknown' }; fail(e2, '环境'); }
  }
  // 顶栏 / 侧栏
  $('#envLabel').textContent = State.env.provider
    ? `${State.env.provider}${State.env.model ? ' · ' + State.env.model : ''}`
    : '未知';
  const state = State.env.provider === 'mock' ? 'mock'
                : State.env.provider === 'deepseek' ? 'live'
                : State.env.provider ? 'live' : 'err';
  $('#envPill').dataset.state = state;

  $('#sidePlan').textContent = (State.wallet?.subscription_plan || 'free').toUpperCase();
  $('#sideBalance').textContent = fmt(State.wallet?.balance ?? 0);
  $('#badgeCredits').textContent = fmt(State.wallet?.balance ?? 0);
  if (State.wallet?.is_admin || IS_ADMIN) {
    $('#sidePlan').textContent = 'ADMIN';
    document.body.classList.add('is-admin');
  } else {
    document.body.classList.remove('is-admin');
  }
  const isAdmin = !!(State.wallet?.is_admin || IS_ADMIN);
  if ($('#userLabel')) {
    $('#userLabel').textContent = isAdmin ? `ADMIN · ${USER_ID}` : USER_ID;
    $('#userDot').className = 'user-dot ' + (isAdmin ? 'admin' : 'user');
    $('#userSwitch').dataset.admin = isAdmin ? '1' : '0';
  }
  try {
    const all = await api.fetchScripts();
    State.scripts = all.scripts || [];
    $('#badgeScripts').textContent = State.scripts.length;
  $('#sideUnlocked').textContent =
    State.scripts.filter(s => s.unlocked).length + ' / ' + State.scripts.length;
  } catch (e) { fail(e, '剧本库'); }
  try {
    State.characters = await api.fetchCharacters();
  } catch (e) { /* 静默，角色非核心 */ }
}

// --------- 首页 ---------

function renderHome() {
  const c = $('#content');
  const plan = State.wallet?.subscription_plan || 'free';
  const bal  = State.wallet?.balance ?? 0;
  const hist = State.history?.aggregate || { avg_overall: 0, count: 0 };
  const profile = State.profile || {};
  const roleLabel = profile.role ? `${profile.role} · ${profile.target_market || '未选市场'} · ${profile.english_level || '未选水平'}` : '尚未设置岗位画像';
  const streak = State.streak || { current_days: 0, longest_days: 0, total_practice_days: 0, badges: [] };
  const weekly = State.weekly || { session_count: 0, avg_overall: 0, weak_dims: [] };
  const inboxUnread = (State.inbox || []).filter(m => !m.read).length;

  c.innerHTML = `
    <div class="hero">
      <div class="hero-left">
        <div class="eyebrow">v2.1 · 商务英语陪练</div>
        <h2>在真实场景里<br/>练出<em>能上桌</em>的英文</h2>
        <p class="lede">8 大场景 · 49 个剧本 · 10 个 AI 角色 · 1v1 教练陪跑
          —— 给海外营销、品牌、外贸、决策者的实战工作英语。</p>
        <div class="hero-cta">
          <button class="btn accent" data-go="scripts">浏览剧本库 →</button>
          <button class="btn ghost" data-go="session" style="color:#fff;border-color:rgba(255,255,255,0.4)">直接开始对话</button>
          <button class="btn ghost" data-go="progress" style="color:#fff;border-color:rgba(255,255,255,0.4)">能力雷达</button>
        </div>
      </div>
      <div class="hero-right">
        <div class="stat-card">
          <div class="num">${State.scripts.length}</div>
          <div class="lbl">真实业务剧本</div>
        </div>
        <div class="stat-card">
          <div class="num">${State.characters.length}</div>
          <div class="lbl">可选 AI 角色</div>
        </div>
        <div class="stat-card">
          <div class="num">${hist.count ? hist.avg_overall.toFixed(1) : '—'}</div>
          <div class="lbl">本账户均分 (${hist.count} 场)</div>
        </div>
        <div class="stat-card">
          <div class="num">${plan === 'free' ? '0' : fmt(bal)}</div>
          <div class="lbl">当前积分余额</div>
        </div>
      </div>
    </div>

    <div class="grid-3" style="margin-top:24px">
      <div class="card" id="cardStreak">
        <div class="card-title">🔥 学习 streak</div>
        <div style="font-family: var(--f-display); font-size: 36px; font-weight: 700; color: var(--c-accent); line-height: 1; margin: 6px 0">${streak.current_days || 0} <span style="font-size: 14px; color: var(--c-mute); font-weight: 400">天</span></div>
        <div class="card-sub">连续打卡 · 累计 ${streak.total_practice_days || 0} 天 · 最长 ${streak.longest_days || 0} 天</div>
        ${streak.badges && streak.badges.length ? `<div class="dim-tags" style="margin-top:10px">${streak.badges.map(b => `<span class="chip">${badgeLabel(b)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="card" id="cardSRS" style="cursor:pointer" onclick="setTab('reviews')">
        <div class="card-title">🔄 今日复习 <span class="chip" style="background:var(--c-primary);color:#fff;font-size:11px">SRS</span></div>
        <div style="font-family: var(--f-display); font-size: 36px; font-weight: 700; color: var(--c-primary); line-height: 1; margin: 6px 0">${State.srs?.today?.length || 0} <span style="font-size: 14px; color: var(--c-mute); font-weight: 400">个剧本待复习</span></div>
        <div class="card-sub">间隔重复记忆法 · 已掌握 ${State.srs?.mastered || 0} 个 · 在学 ${State.srs?.total_learning || 0} 个</div>
        <div style="margin-top:10px; font-size:12.5px; color:var(--c-accent)">开始复习 →</div>
      </div>
      <div class="card" id="cardInbox">
        <div class="card-title">📬 站内消息 <span class="dim-tags"><span class="chip">${inboxUnread} 未读</span></span></div>
        <div style="margin-top:10px; max-height: 80px; overflow: hidden">
          ${(State.inbox || []).slice(0, 3).map(m => `<div style="font-size:13px;padding:6px 0;border-top:1px dashed var(--c-line)"><span style="color:var(--c-mute)">[${m.kind}]</span> ${escapeHtml((m.subject||'').slice(0,40))}</div>`).join('') || '<div style="font-size:12.5px;color:var(--c-mute)">暂无消息</div>'}
        </div>
        <button class="btn ghost sm" id="openInbox" style="margin-top:10px">查看全部 →</button>
      </div>
    </div>

    ${State.recommendedToday && State.recommendedToday.items && State.recommendedToday.items.length ? `
    <div class="card" id="cardRecommended" style="margin-top:24px;background:linear-gradient(135deg,#FFF6F0 0%, #FFFFFF 60%); border:1.5px solid var(--c-accent)">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px">
        <div>
          <div class="card-title" style="font-size:18px">🎯 今日复习剧本 <span class="chip" style="background:var(--c-accent);color:#fff;font-size:11px;margin-left:4px">v2.2 新</span></div>
          <div class="card-sub" style="margin-top:4px">基于你最近 5 场对话的 5 维评分弱项自动生成 · 借鉴 Speak spaced repetition + ELSA EPS 评分联动</div>
        </div>
      </div>
      <div style="margin-top:14px; display:grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap:12px">
        ${State.recommendedToday.items.slice(0,3).map(it => `
          <div class="rec-card" data-script="${it.script_id}" style="padding:12px 14px; border:1px solid var(--c-line); border-radius:8px; background:#fff; cursor:pointer; transition:all 0.15s" onmouseover="this.style.borderColor='var(--c-accent)'" onmouseout="this.style.borderColor='var(--c-line)'">
            <div style="font-family:var(--f-display); font-size:15px; font-weight:600; color:var(--c-primary)">${it.script_id}</div>
            <div style="font-size:12.5px; color:var(--c-ink-soft); margin-top:6px">${escapeHtml(it.reason || '')}</div>
            ${it.weak_dim ? `<div style="margin-top:6px"><span class="chip">弱项: ${DIM_LABELS[it.weak_dim] || it.weak_dim}</span></div>` : ''}
            <div style="margin-top:10px; display:flex; gap:6px">
              <button class="btn ghost sm" data-action="open-script" data-script="${it.script_id}">打开剧本</button>
              <button class="btn ghost sm" data-action="dismiss-reco" data-script="${it.script_id}">已练过</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    ${profile.role ? `
    <div class="card" style="margin-top: 24px; padding: 16px 20px; display:flex; align-items:center; gap:14px">
      <div style="font-size: 28px">👤</div>
      <div style="flex:1">
        <div style="font-family: var(--f-display); font-size: 16px; font-weight:600">${escapeHtml(roleLabel)}</div>
        <div style="font-size: 12.5px; color: var(--c-mute); margin-top: 4px">剧本与角色推荐已根据你的画像定制</div>
      </div>
      <button class="btn ghost sm" id="editProfile">修改画像</button>
    </div>` : `
    <div class="card" style="margin-top: 24px; padding: 20px 24px; display:flex; align-items:center; gap:14px; border: 2px dashed var(--c-accent); background: #FFF6F0">
      <div style="font-size: 32px">🎯</div>
      <div style="flex:1">
        <div style="font-family: var(--f-display); font-size: 17px; font-weight:600">3 步定制你的训练画像</div>
        <div style="font-size: 13px; color: var(--c-ink-soft); margin-top: 4px">选择岗位 + 目标市场 + 英语水平，系统会推荐剧本和角色</div>
      </div>
      <button class="btn accent" id="startOnboarding">开始设置 →</button>
    </div>`}

    <div class="section-h">
      <h3>8 大核心场景</h3>
      <span class="meta">点击进入剧本库</span>
    </div>
    <div class="scene-grid">
      ${Object.entries(SCENE_META).map(([k, v]) => `
        <div class="scene-card" data-go="scripts" data-scene="${k}">
          ${k === 'SC-08' ? '<span class="chip sc08 sc08-flag">团购后全公司 Free</span>' : ''}
          <div class="ico">${v.ico}</div>
          <div class="ttl">${v.title}</div>
          <div class="desc">${v.desc}</div>
        </div>
      `).join('')}
    </div>

    <!-- v4.0 学习路径 -->
    <div class="section-h" style="margin-top:32px">
      <h3>🛤️ 你的学习路径</h3>
      <span class="meta">循序渐进，从入门到精通</span>
    </div>
    <div class="card learning-path-card">
      ${renderLearningPath()}
    </div>

    <div class="section-h">
      <h3>v2.0 新能力</h3>
    </div>
    <div class="grid-3">
      <div class="card">
        <div class="card-title">4 维度 AI 评分</div>
        <div class="card-sub">对话结束后自动评分：语法 / 词汇 / 商务得体度 / 跨文化，给具体改进建议。</div>
      </div>
      <div class="card">
        <div class="card-title">AI 角色自由切换</div>
        <div class="card-sub">同一剧本配多个 AI 角色（Mark、Yuki、James...），不同口音、不同风格。</div>
      </div>
      <div class="card">
        <div class="card-title">语音输入 + TTS 播放</div>
        <div class="card-sub">按住麦克风说英文，听 AI 朗读原声——口语 + 听力一站搞定。</div>
      </div>
    </div>
  `;
  $$('[data-go]', c).forEach(el => el.addEventListener('click', () => {
    setTab(el.dataset.go);
    if (el.dataset.scene) sessionStorage.setItem('filterScene', el.dataset.scene);
  }));
  const edit = $('#editProfile');
  if (edit) edit.onclick = () => openOnboarding();
  const start = $('#startOnboarding');
  if (start) start.onclick = () => openOnboarding();
  const openInboxBtn = $('#openInbox');
  if (openInboxBtn) openInboxBtn.onclick = () => renderInboxModal();

  // v2.2 今日复习剧本：事件委托
  $$('[data-action]', c).forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = el.dataset.action;
      const sid = el.dataset.script;
      if (action === 'open-script') {
        setTab('scripts');
        sessionStorage.setItem('openScriptId', sid);
      } else if (action === 'dismiss-reco') {
        try {
          await api.dismissRecommendedToday(sid);
          State.recommendedToday = await api.fetchRecommendedToday();
          renderHome();
        } catch (err) {
          toast('跳过失败：' + err.message, 'err');
        }
      }
    });
  });
  // 点击 rec-card 主体：打开剧本
  $$('.rec-card[data-script]', c).forEach(el => {
    el.addEventListener('click', () => {
      setTab('scripts');
      sessionStorage.setItem('openScriptId', el.dataset.script);
    });
  });
}

// --------- 剧本库 ---------

function renderScripts(filterScene) {
  const c = $('#content');
  const scene = filterScene || sessionStorage.getItem('filterScene') || '';
  sessionStorage.removeItem('filterScene');

  if (!State.scripts.length) {
    c.innerHTML = `
      <div class="page-h"><div><h1>剧本库</h1><p id="scriptsStatus">正在加载…</p></div></div>
      <div class="card" style="text-align:center; padding: 60px 20px">
        <div style="font-family: var(--f-display); font-size: 60px; color: var(--c-accent); line-height: 1">▤</div>
        <div class="card-title" style="margin: 16px 0 6px">剧本库加载中</div>
        <div class="card-sub">从后端拉取 49 个真实业务剧本…</div>
        <div style="margin-top: 18px; display: flex; gap: 8px; justify-content: center;">
          <button class="btn ghost" id="retryScripts">重试</button>
          <button class="btn" id="diagScripts">诊断后端</button>
        </div>
      </div>
    `;
    refreshGlobal().then(() => {
      if (State.scripts.length) { renderScripts(scene); return; }
      $('#scriptsStatus').textContent = '未拿到剧本，请检查后端';
    }).catch((e) => {
      $('#scriptsStatus').textContent = '加载失败：' + (e.message || e);
    });
    $('#retryScripts').onclick = () => renderScripts(scene);
    $('#diagScripts').onclick = async () => {
      try { const h = await api.health(); toast(`/health OK · version=${h.version}`, 'success'); }
      catch (e) { toast('后端不可达：' + (e.message || e), 'error'); }
    };
    return;
  }

  const groups = {};
  State.scripts.forEach(s => {
    const k = sceneOfSafe(s);
    (groups[k] ||= []).push(s);
  });
  const order = Object.keys(SCENE_META);

  c.innerHTML = `
    <div class="page-h">
      <div>
        <h1>剧本库</h1>
        <p>${scene ? (SCENE_META[scene]?.title || scene) + ' · ' + (groups[scene]?.length || 0) + ' 个剧本' : '全部 ' + State.scripts.length + ' 个真实业务剧本'}</p>
      </div>
      <div class="page-actions">
        <button class="btn ghost sm" data-go="home">← 返回首页</button>
      </div>
    </div>

    <div class="scripts-toolbar">
      <input id="searchScript" type="text" placeholder="搜索剧本标题…" />
      <div style="display:flex;gap:6px;align-items:center">
        <span style="font-size:11px;color:var(--c-mute)">难度：</span>
        <button class="btn ghost sm diff-filter active" data-diff="all">全部</button>
        <button class="btn ghost sm diff-filter" data-diff="intro">入门</button>
        <button class="btn ghost sm diff-filter" data-diff="mid">中级</button>
        <button class="btn ghost sm diff-filter" data-diff="adv">高阶</button>
      </div>
      <button class="btn accent sm" id="btnAIGenerate">✨ AI 生成剧本</button>
      <button class="btn ghost sm" id="clearFilter" ${scene ? '' : 'hidden'}>清除场景筛选 ×</button>
    </div>

    ${order.filter(k => groups[k]?.length).map(k => `
      <div class="scene-section">
        <div class="scene-section-h">
          <span class="ico">${SCENE_META[k].ico}</span>
          <span class="ttl">${SCENE_META[k].title}</span>
          ${k === 'SC-08' ? '<span class="chip sc08">团购后全公司 Free</span>' : ''}
          <span class="count">${groups[k].length} 个剧本</span>
        </div>
        ${groups[k].map(s => scriptRow(s)).join('')}
      </div>
    `).join('')}
  `;

  $('#searchScript').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const diff = $('.diff-filter.active')?.dataset?.diff || 'all';
    $$('.script-row', c).forEach(row => {
      const matchQ = row.dataset.title.toLowerCase().includes(q);
      const matchDiff = diff === 'all' || row.dataset.diff === diff;
      row.hidden = !(matchQ && matchDiff);
    });
  });
  $$('.diff-filter').forEach(btn => btn.addEventListener('click', () => {
    $$('.diff-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const diff = btn.dataset.diff;
    const q = ($('#searchScript')?.value || '').toLowerCase();
    $$('.script-row', c).forEach(row => {
      const matchQ = !q || row.dataset.title.toLowerCase().includes(q);
      const matchDiff = diff === 'all' || row.dataset.diff === diff;
      row.hidden = !(matchQ && matchDiff);
    });
  }));
  if (scene) {
    $('#clearFilter').addEventListener('click', () => renderScripts());
  }
  $('#btnAIGenerate').addEventListener('click', openAIGenerateModal);
  $$('.script-row', c).forEach(row => {
    row.addEventListener('click', () => openScriptDetail(row.dataset.id));
  });
  $$('[data-go]', c).forEach(el => el.addEventListener('click', () => setTab(el.dataset.go)));
}

// ========== v4.0 AI 剧本生成 ==========
function openAIGenerateModal() {
  showModal(`
    <div style="padding: 8px 4px 4px">
      <h3 style="font-family:var(--f-display);font-size:20px;margin:0 0 4px">✨ AI 生成剧本</h3>
      <p style="font-size:13px;color:var(--c-mute);margin:0 0 16px">描述你想练习的商务场景，AI 自动生成专属剧本</p>
      <textarea id="aiDesc" rows="4" placeholder="例如：我要和美国客户开第一次产品介绍会，对方是营销总监，我需要介绍我们的SaaS产品并争取下一步会议…"
        style="width:100%;padding:12px;border:1.5px solid var(--c-line);border-radius:8px;font-size:14px;resize:vertical;font-family:inherit"></textarea>
      <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
        <span style="font-size:13px;color:var(--c-mute)">难度：</span>
        <select id="aiDiff" style="padding:6px 10px;border:1px solid var(--c-line);border-radius:6px;font-size:13px">
          <option value="intro">入门</option>
          <option value="mid" selected>中级</option>
          <option value="adv">高阶</option>
        </select>
        <div style="flex:1"></div>
        <button class="btn ghost" onclick="closeModal()">取消</button>
        <button class="btn accent" id="aiGenBtn">生成剧本</button>
      </div>
      <div id="aiGenResult" style="margin-top:16px;display:none"></div>
    </div>
  `);
  $('#aiGenBtn').onclick = async () => {
    const desc = $('#aiDesc').value.trim();
    if (!desc) { toast('请描述你想练习的场景', 'error'); return; }
    const diff = $('#aiDiff').value;
    $('#aiGenBtn').disabled = true;
    $('#aiGenBtn').textContent = '生成中…';
    try {
      const r = await api.generateScript(desc, diff);
      State.generatedScripts = await api.fetchGeneratedScripts();
      $('#aiGenResult').style.display = 'block';
      $('#aiGenResult').innerHTML = `
        <div style="padding:14px;border:1.5px solid var(--c-accent);border-radius:10px;background:#FFF9F5">
          <div style="font-family:var(--f-display);font-size:16px;font-weight:600;color:var(--c-primary)">${escapeHtml(r.title)}</div>
          <div style="font-size:12.5px;color:var(--c-mute);margin-top:4px">${r.duration_min} min · ${({intro:'入门',mid:'中级',adv:'高阶'}[r.difficulty] || r.difficulty)}</div>
          <div style="font-size:13px;margin-top:8px;color:var(--c-ink)">${escapeHtml(r.scenario || '')}</div>
          ${r.cultural_traps?.length ? `<div style="margin-top:10px"><div style="font-size:12px;font-weight:600;color:var(--c-accent)">跨文化陷阱</div>${r.cultural_traps.map(t => `<div style="font-size:12px;color:var(--c-ink-soft);margin-top:2px">· ${escapeHtml(t)}</div>`).join('')}</div>` : ''}
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn accent sm" onclick="startGeneratedScript('${r.script_id}')">立即开始练习</button>
            <button class="btn ghost sm" onclick="closeModal();renderScripts()">返回剧本库</button>
          </div>
        </div>
      `;
    } catch (e) {
      toast('生成失败：' + (e.message || e), 'error');
    }
    $('#aiGenBtn').disabled = false;
    $('#aiGenBtn').textContent = '重新生成';
  };
}

function startGeneratedScript(scriptId) {
  const gen = (State.generatedScripts || []).find(s => s.id === scriptId);
  if (!gen) { toast('剧本不存在', 'error'); return; }
  closeModal();
  // 直接开始一个使用生成剧本的对话
  openScriptDetail(gen.script_id || gen.id, { generated: gen });
}

// ========== v4.0 SRS 复习页面 ==========
function renderReviews() {
  const c = $('#content');
  const srs = State.srs || { today: [], upcoming: [], mastered: 0, total_learning: 0 };

  c.innerHTML = `
    <div class="page-h">
      <div>
        <h1>复习计划</h1>
        <p>间隔重复记忆法 · 科学安排复习，让表达真正内化</p>
      </div>
      <div class="page-actions">
        <button class="btn ghost sm" data-go="home">← 返回首页</button>
      </div>
    </div>

    <div class="grid-3" style="margin-bottom:20px">
      <div class="card">
        <div class="card-title">今日待复习</div>
        <div style="font-family:var(--f-display);font-size:32px;font-weight:700;color:var(--c-accent)">${srs.today?.length || 0}</div>
        <div class="card-sub">今天需要复习的剧本</div>
      </div>
      <div class="card">
        <div class="card-title">在学中</div>
        <div style="font-family:var(--f-display);font-size:32px;font-weight:700;color:var(--c-primary)">${srs.total_learning || 0}</div>
        <div class="card-sub">正在记忆曲线中的剧本</div>
      </div>
      <div class="card">
        <div class="card-title">已掌握</div>
        <div style="font-family:var(--f-display);font-size:32px;font-weight:700;color:var(--c-success)">${srs.mastered || 0}</div>
        <div class="card-sub">达到长期记忆的剧本</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title" style="font-size:16px">🔔 今日待复习 (${srs.today?.length || 0})</div>
      <div style="margin-top:12px">
        ${srs.today && srs.today.length ? srs.today.map(item => `
          <div style="display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--c-line)">
            <div style="flex:1">
              <div style="font-weight:600;font-size:14px">${escapeHtml(item.script_title)}</div>
              <div style="font-size:12px;color:var(--c-mute);margin-top:2px">
                ${({intro:'入门',mid:'中级',adv:'高阶'}[item.difficulty] || item.difficulty)}
                · 第 ${item.review_stage} 阶段 · 已复习 ${item.total_reviews} 次
                ${item.last_score ? ` · 上次得分 ${item.last_score.toFixed(1)}` : ''}
              </div>
            </div>
            <button class="btn accent sm" onclick="reviewScript('${item.script_id}')">开始复习</button>
          </div>
        `).join('') : '<div style="text-align:center;padding:24px;color:var(--c-mute);font-size:13px">🎉 今日没有待复习的剧本<br/>去练习新剧本，它们会自动加入复习计划</div>'}
      </div>
    </div>

    ${srs.upcoming && srs.upcoming.length ? `
    <div class="card" style="margin-top:16px">
      <div class="card-title" style="font-size:16px">📅 即将到来 (${srs.upcoming.length})</div>
      <div style="margin-top:12px">
        ${srs.upcoming.slice(0,10).map(item => `
          <div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid var(--c-line)">
            <div style="flex:1">
              <div style="font-size:14px">${escapeHtml(item.script_title)}</div>
              <div style="font-size:12px;color:var(--c-mute);margin-top:2px">下次复习：${item.next_review_date} · 第 ${item.review_stage} 阶段</div>
            </div>
            <span class="chip">${item.next_review_date}</span>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;
  $$('[data-go]', c).forEach(el => el.addEventListener('click', () => setTab(el.dataset.go)));
}

function reviewScript(scriptId) {
  // 打开剧本详情开始复习
  openScriptDetail(scriptId);
}

// ========== v4.0 结构化学习路径 ==========
function renderLearningPath() {
  // 5 个学习阶段
  const stages = [
    { id: 1, name: '入门基础', desc: '日常商务英语打底', icon: '🌱', difficulty: 'intro', count: 8 },
    { id: 2, name: '场景进阶', desc: '核心场景对话实战', icon: '🌿', difficulty: 'mid', count: 12 },
    { id: 3, name: '专业提升', desc: '营销/销售/谈判精通', icon: '🌳', difficulty: 'mid', count: 15 },
    { id: 4, name: '高阶突破', desc: '高管级沟通表达', icon: '🏆', difficulty: 'adv', count: 8 },
    { id: 5, name: '大师精通', desc: '跨文化领导力', icon: '👑', difficulty: 'adv', count: 6 },
  ];

  // 根据用户数据计算当前阶段（简化逻辑）
  const placement = State.placementResult;
  const historyCount = State.history?.aggregate?.count || 0;
  const masteredCount = State.srs?.mastered || 0;
  const totalPractice = State.streak?.total_practice_days || 0;

  // 计算当前阶段索引
  let currentStage = 0;
  if (placement) {
    if (placement.level === 'beginner') currentStage = 0;
    else if (placement.level === 'intermediate') currentStage = 1;
    else currentStage = 2;
  }
  if (historyCount > 10) currentStage = Math.max(currentStage, 1);
  if (masteredCount > 5) currentStage = Math.max(currentStage, 2);
  if (masteredCount > 15) currentStage = Math.max(currentStage, 3);
  currentStage = Math.min(currentStage, stages.length - 1);

  // 计算各阶段完成度
  const getProgress = (idx) => {
    if (idx < currentStage) return 100;
    if (idx > currentStage) return 0;
    // 当前阶段：根据练习次数估算
    const base = [0, 10, 25, 40, 60];
    return Math.min(95, base[idx] + (historyCount * 3));
  };

  return `
    <div class="learning-path">
      ${stages.map((s, i) => {
        const progress = getProgress(i);
        const isCurrent = i === currentStage;
        const isDone = i < currentStage;
        return `
          <div class="path-stage ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}">
            <div class="path-node">
              <div class="path-ico">${isDone ? '✓' : s.icon}</div>
              ${i < stages.length - 1 ? `<div class="path-line" style="width:${isDone ? '100%' : progress + '%'}"></div>` : ''}
            </div>
            <div class="path-info">
              <div class="path-name">
                ${s.name}
                ${isCurrent ? '<span class="chip" style="background:var(--c-accent);color:#fff;font-size:10px">进行中</span>' : ''}
                ${isDone ? '<span class="chip" style="background:#ECFDF5;color:#059669;font-size:10px">已完成</span>' : ''}
              </div>
              <div class="path-desc">${s.desc} · ${s.count} 个剧本</div>
              ${isCurrent ? `
                <div class="path-progress">
                  <div class="path-bar"><div style="width:${progress}%"></div></div>
                  <span>${progress}%</span>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--c-line);display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:13px;color:var(--c-mute)">下一步建议</div>
        <div style="font-size:15px;font-weight:600;color:var(--c-ink);margin-top:4px">
          ${placement ? `继续「${stages[currentStage].name}」阶段练习` : '先做能力测评，获取专属学习路径'}
        </div>
      </div>
      <button class="btn accent sm" onclick="${placement ? "setTab('scripts')" : "setTab('placement')"}">
        ${placement ? '继续学习 →' : '开始测评 →'}
      </button>
    </div>
  `;
}

// ========== v4.0 错题库 ==========
function renderMistakes() {
  const c = $('#content');
  const stats = State.mistakeStats || { total: 0, unreviewed: 0, by_type: {}, weak_dimensions: [] };
  const mistakes = State.mistakes || [];
  const filter = State.mistakeFilter || 'all';

  const typeLabels = {
    grammar: '语法错误', vocabulary: '词汇使用', pronunciation: '发音问题',
    cross_cultural: '跨文化表达', business_etiquette: '商务礼仪',
  };

  c.innerHTML = `
    <div class="page-h">
      <div>
        <h1>错题库</h1>
        <p>记录每一次失误，精准补强薄弱项</p>
      </div>
      <div class="page-actions">
        <button class="btn ghost sm" data-go="home">← 返回首页</button>
      </div>
    </div>

    <div class="grid-3">
      <div class="card">
        <div class="card-title">总错题数</div>
        <div style="font-family:var(--f-display);font-size:36px;font-weight:700;color:var(--c-danger);line-height:1;margin:6px 0">${stats.total || 0}</div>
        <div class="card-sub">累计收录的错误表达</div>
      </div>
      <div class="card" style="cursor:pointer" onclick="filterMistakes('unreviewed')">
        <div class="card-title">待复习</div>
        <div style="font-family:var(--f-display);font-size:36px;font-weight:700;color:var(--c-accent);line-height:1;margin:6px 0">${stats.unreviewed || 0}</div>
        <div class="card-sub">还没复习的错题</div>
      </div>
      <div class="card">
        <div class="card-title">最弱维度</div>
        <div style="margin-top:6px">
          ${(stats.weak_dimensions || []).slice(0, 3).map(d => {
            const labels = { grammar:'语法', vocabulary:'词汇', business:'商务沟通', cross_cultural:'跨文化', marketing:'营销专业' };
            return `<span class="chip" style="background:#FEF2F2;color:#DC2626;margin-right:6px;margin-bottom:4px">${labels[d] || d}</span>`;
          }).join('') || '<span style="font-size:13px;color:var(--c-mute)">暂无数据</span>'}
        </div>
      </div>
    </div>

    <!-- 错误类型分布 -->
    <div class="card" style="margin-top:16px">
      <div class="card-title">错误类型分布</div>
      <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">
        <button class="mistake-filter-btn ${filter === 'all' ? 'active' : ''}" onclick="filterMistakes('all')">
          全部 <span>${stats.total || 0}</span>
        </button>
        ${Object.entries(typeLabels).map(([key, label]) => {
          const count = stats.by_type?.[key] || 0;
          return `<button class="mistake-filter-btn ${filter === key ? 'active' : ''}" onclick="filterMistakes('${key}')">
            ${label} <span>${count}</span>
          </button>`;
        }).join('')}
      </div>
    </div>

    <!-- 错题列表 -->
    <div class="card" style="margin-top:16px">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>${filter === 'all' ? '全部错题' : typeLabels[filter] || filter}</span>
        <button class="btn ghost sm" id="addMistakeBtn">+ 添加错题</button>
      </div>
      <div id="mistakeList" style="margin-top:12px">
        ${mistakes.length ? mistakes.map(m => mistakeCard(m)).join('') : `
          <div style="text-align:center;padding:32px;color:var(--c-mute)">
            <div style="font-size:48px;margin-bottom:12px">✅</div>
            <div style="font-size:15px;color:var(--c-ink)">暂无错题</div>
            <div style="font-size:13px;margin-top:4px">对话练习后，错误表达会自动收录到这里</div>
          </div>
        `}
      </div>
    </div>
  `;

  $('#addMistakeBtn').onclick = () => openAddMistakeModal();
  $$('[data-go]', c).forEach(el => el.addEventListener('click', () => setTab(el.dataset.go)));

  // 加载数据
  loadMistakes(filter);
}

function filterMistakes(type) {
  State.mistakeFilter = type;
  loadMistakes(type);
  // 更新 UI
  const list = $('#mistakeList');
  if (list) list.innerHTML = '<div style="text-align:center;padding:24px"><div class="loading-spinner"></div></div>';
}

async function loadMistakes(type) {
  try {
    const r = await api.fetchMistakes(type === 'all' ? null : type === 'unreviewed' ? null : type);
    let mistakes = r.mistakes || [];
    if (type === 'unreviewed') {
      mistakes = mistakes.filter(m => !m.reviewed);
    }
    State.mistakes = mistakes;

    // 更新列表
    const list = $('#mistakeList');
    if (list) {
      if (mistakes.length) {
        list.innerHTML = mistakes.map(m => mistakeCard(m)).join('');
        // 绑定事件
        $$('.mistake-card .mark-reviewed').forEach(btn => {
          btn.onclick = async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            await api.markMistakeReviewed(id);
            loadMistakes(State.mistakeFilter || 'all');
            toast('已标记为已复习', 'success');
          };
        });
      } else {
        list.innerHTML = `
          <div style="text-align:center;padding:32px;color:var(--c-mute)">
            <div style="font-size:48px;margin-bottom:12px">✅</div>
            <div style="font-size:15px;color:var(--c-ink)">暂无错题</div>
            <div style="font-size:13px;margin-top:4px">对话练习后，错误表达会自动收录到这里</div>
          </div>
        `;
      }
    }
  } catch (e) {
    console.warn('load mistakes fail', e);
  }
}

function mistakeCard(m) {
  const typeLabels = {
    grammar: '语法错误', vocabulary: '词汇使用', pronunciation: '发音问题',
    cross_cultural: '跨文化表达', business_etiquette: '商务礼仪',
  };
  const sevColors = { minor: '#10B981', medium: '#F59E0B', major: '#EF4444' };
  const sevLabels = { minor: '轻微', medium: '中等', major: '严重' };

  return `
    <div class="mistake-card" style="padding:14px;border:1px solid var(--c-line);border-radius:10px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
        <div style="flex:1">
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px">
            <span class="chip" style="font-size:11px">${typeLabels[m.type] || m.type}</span>
            <span class="chip" style="font-size:11px;background:${sevColors[m.severity] || '#999'}15;color:${sevColors[m.severity] || '#999'}">${sevLabels[m.severity] || m.severity}</span>
            ${m.reviewed ? '<span class="chip" style="font-size:11px;background:#ECFDF5;color:#059669">已复习</span>' : ''}
          </div>
          <div style="font-size:14px;color:var(--c-danger);text-decoration:line-through;text-decoration-color:#FCA5A5;margin-bottom:6px">
            ${escapeHtml(m.sentence)}
          </div>
          <div style="font-size:14px;color:var(--c-ink);font-weight:500">
            ✓ ${escapeHtml(m.correction)}
          </div>
          ${m.script_id ? `<div style="font-size:12px;color:var(--c-mute);margin-top:6px">来源：${m.script_id}</div>` : ''}
        </div>
        ${!m.reviewed ? `
          <button class="btn ghost sm mark-reviewed" data-id="${m.id}" style="flex-shrink:0">
            标记已复习
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

function openAddMistakeModal() {
  showModal(`
    <div style="padding:4px">
      <h3 style="font-family:var(--f-display);font-size:20px;margin:0 0 16px">📝 添加错题</h3>
      <div style="margin-bottom:12px">
        <label style="font-size:13px;font-weight:500;color:var(--c-ink)">错误表达</label>
        <input id="mSentence" type="text" placeholder="例如：I very like this product"
          style="width:100%;padding:10px 12px;border:1px solid var(--c-line);border-radius:8px;font-size:14px;margin-top:6px" />
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:13px;font-weight:500;color:var(--c-ink)">正确表达</label>
        <input id="mCorrection" type="text" placeholder="例如：I like this product very much"
          style="width:100%;padding:10px 12px;border:1px solid var(--c-line);border-radius:8px;font-size:14px;margin-top:6px" />
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:13px;font-weight:500;color:var(--c-ink)">错误类型</label>
        <select id="mType" style="width:100%;padding:10px 12px;border:1px solid var(--c-line);border-radius:8px;font-size:14px;margin-top:6px">
          <option value="grammar">语法错误</option>
          <option value="vocabulary">词汇使用</option>
          <option value="pronunciation">发音问题</option>
          <option value="cross_cultural">跨文化表达</option>
          <option value="business_etiquette">商务礼仪</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn ghost" onclick="closeModal()">取消</button>
        <button class="btn accent" id="mSubmit">添加</button>
      </div>
    </div>
  `);
  $('#mSubmit').onclick = async () => {
    const sentence = $('#mSentence').value.trim();
    const correction = $('#mCorrection').value.trim();
    const type = $('#mType').value;
    if (!sentence || !correction) { toast('请填写错误和正确表达', 'error'); return; }
    try {
      await api.addMistake({ sentence, correction, type });
      await refreshMistakeStats();
      loadMistakes(State.mistakeFilter || 'all');
      closeModal();
      toast('已添加到错题库', 'success');
    } catch (e) {
      toast('添加失败：' + e.message, 'error');
    }
  };
}

async function refreshMistakeStats() {
  try {
    State.mistakeStats = await api.fetchMistakeStats();
    const badge = $('#badgeMistakes');
    if (badge) badge.textContent = State.mistakeStats.unreviewed || 0;
  } catch(e) {}
}

// ========== v4.0 定级测评 ==========
function renderPlacement() {
  const c = $('#content');
  const result = State.placementResult;

  if (result) {
    // 已完成测评，显示结果
    renderPlacementResult(c, result);
  } else {
    // 未完成，显示测评入口
    renderPlacementIntro(c);
  }
}

function renderPlacementIntro(c) {
  c.innerHTML = `
    <div class="page-h">
      <div>
        <h1>能力测评</h1>
        <p>5分钟测出你的商务英语水平，获取个性化学习路径</p>
      </div>
      <div class="page-actions">
        <button class="btn ghost sm" data-go="home">← 返回首页</button>
      </div>
    </div>

    <div class="card" style="max-width:600px;margin:0 auto;padding:32px;text-align:center">
      <div style="font-size:64px;margin-bottom:16px">🎯</div>
      <h2 style="font-family:var(--f-display);font-size:24px;margin:0 0 8px">商务英语能力测评</h2>
      <p style="color:var(--c-mute);font-size:14px;margin:0 0 24px">15道精选题目 · 5个维度全面评估 · 5分钟完成</p>

      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:24px 0">
        ${['语法','词汇','商务沟通','跨文化','营销专业'].map(d => `
          <div style="text-align:center">
            <div style="font-size:24px;margin-bottom:4px">${['📝','📖','💼','🌍','📊'][['语法','词汇','商务沟通','跨文化','营销专业'].indexOf(d)]}</div>
            <div style="font-size:11px;color:var(--c-mute)">${d}</div>
          </div>
        `).join('')}
      </div>

      <div style="text-align:left;background:var(--c-surface);padding:16px;border-radius:8px;margin:24px 0">
        <div style="font-weight:600;font-size:14px;margin-bottom:10px">测评后你将获得：</div>
        <div style="font-size:13px;color:var(--c-ink-soft);line-height:1.8">
          ✅ 综合得分 & 英语等级判定<br/>
          ✅ 5 维度能力雷达图<br/>
          ✅ 强弱项分析<br/>
          ✅ 个性化学习路径推荐<br/>
          ✅ 首批推荐剧本
        </div>
      </div>

      <button class="btn accent" id="startPlacement" style="font-size:16px;padding:14px 32px;width:100%;max-width:280px">
        开始测评 · 约 5 分钟
      </button>
    </div>
  `;
  $('#startPlacement').onclick = startPlacementTest;
  $$('[data-go]', c).forEach(el => el.addEventListener('click', () => setTab(el.dataset.go)));
}

function startPlacementTest() {
  let current = 0;
  let answers = {};
  let questions = [];

  const loadQuestions = async () => {
    try {
      const r = await api.fetchPlacementTest();
      questions = r.questions || [];
      renderQuestion();
    } catch (e) {
      toast('测评加载失败：' + e.message, 'error');
    }
  };

  const renderQuestion = () => {
    const c = $('#content');
    const q = questions[current];
    const progress = ((current + 1) / questions.length * 100).toFixed(0);
    const dimLabels = { grammar:'语法', vocabulary:'词汇', business:'商务沟通', cross_cultural:'跨文化', marketing:'营销专业' };
    const diffLabels = { intro:'入门', mid:'中级', adv:'高阶' };

    c.innerHTML = `
      <div class="page-h">
        <div>
          <h1>能力测评</h1>
          <p>第 ${current + 1} / ${questions.length} 题</p>
        </div>
      </div>

      <div class="card" style="max-width:600px;margin:0 auto;padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div style="display:flex;gap:8px;align-items:center">
            <span class="chip ${q.difficulty}">${diffLabels[q.difficulty] || q.difficulty}</span>
            <span class="chip">${dimLabels[q.dimension] || q.dimension}</span>
          </div>
          <span style="font-size:12px;color:var(--c-mute)">${progress}%</span>
        </div>

        <div style="height:6px;background:var(--c-line);border-radius:3px;margin-bottom:24px;overflow:hidden">
          <div style="height:100%;width:${progress}%;background:var(--c-accent);border-radius:3px;transition:width 0.3s"></div>
        </div>

        <div style="font-size:17px;font-weight:600;color:var(--c-ink);line-height:1.6;margin-bottom:24px">
          ${escapeHtml(q.question)}
        </div>

        <div style="display:flex;flex-direction:column;gap:10px">
          ${q.options.map((opt, i) => `
            <div class="option-card placement-opt ${answers[q.id] === i ? 'selected' : ''}" data-index="${i}" style="text-align:left;padding:14px 16px">
              <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:var(--c-surface);border-radius:50%;font-size:13px;font-weight:600;margin-right:12px;flex-shrink:0">${String.fromCharCode(65 + i)}</span>
              <span>${escapeHtml(opt)}</span>
            </div>
          `).join('')}
        </div>

        <div style="display:flex;justify-content:space-between;margin-top:24px">
          <button class="btn ghost" id="prevQ" ${current === 0 ? 'disabled' : ''}>← 上一题</button>
          <button class="btn accent" id="nextQ" ${answers[q.id] === undefined ? 'disabled' : ''}>
            ${current === questions.length - 1 ? '提交测评 ✓' : '下一题 →'}
          </button>
        </div>
      </div>
    `;

    $$('.placement-opt').forEach(card => card.onclick = () => {
      const idx = parseInt(card.dataset.index);
      answers[q.id] = idx;
      $$('.placement-opt').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      $('#nextQ').disabled = false;
    });

    $('#prevQ').onclick = () => { if (current > 0) { current--; renderQuestion(); } };
    $('#nextQ').onclick = () => {
      if (current < questions.length - 1) {
        current++;
        renderQuestion();
      } else {
        submitPlacement(answers);
      }
    };
  };

  loadQuestions();
}

async function submitPlacement(answers) {
  const c = $('#content');
  c.innerHTML = `
    <div class="page-h">
      <div><h1>能力测评</h1><p>正在计算结果…</p></div>
    </div>
    <div class="card" style="text-align:center;padding:48px">
      <div style="font-size:48px;margin-bottom:16px">📊</div>
      <div style="font-size:18px;color:var(--c-ink)">正在分析你的答题情况…</div>
    </div>
  `;

  try {
    const result = await api.submitPlacement(answers);
    State.placementResult = result;
    localStorage.setItem('bc_placement', JSON.stringify(result));
    renderPlacementResult(c, result);
    toast('测评完成！', 'success');
  } catch (e) {
    toast('提交失败：' + e.message, 'error');
  }
}

function renderPlacementResult(c, result) {
  const dimLabels = { grammar:'语法', vocabulary:'词汇', business:'商务沟通', cross_cultural:'跨文化', marketing:'营销专业' };
  const dims = result.dimension_scores || {};
  const dimList = Object.entries(dims).sort((a, b) => b[1] - a[1]);

  c.innerHTML = `
    <div class="page-h">
      <div>
        <h1>测评结果</h1>
        <p>${result.level_label} · 综合得分 ${result.score} 分</p>
      </div>
      <div class="page-actions">
        <button class="btn ghost sm" id="retakePlacement">重新测评</button>
        <button class="btn ghost sm" data-go="home">返回首页</button>
      </div>
    </div>

    <div class="grid-2">
      <!-- 综合得分卡片 -->
      <div class="card" style="text-align:center;padding:32px">
        <div style="font-size:13px;color:var(--c-mute);margin-bottom:8px">综合得分</div>
        <div style="font-family:var(--f-display);font-size:64px;font-weight:700;color:var(--c-accent);line-height:1">${result.score}</div>
        <div style="font-size:20px;font-weight:600;color:var(--c-ink);margin-top:8px">${result.level_label}</div>
        <div style="font-size:13px;color:var(--c-mute);margin-top:4px">${result.correct_count} / ${result.total_questions} 题正确</div>
        <div style="margin-top:20px;padding:12px;background:var(--c-surface);border-radius:8px">
          <div style="font-size:13px;color:var(--c-ink-soft)">推荐学习路径</div>
          <div style="font-size:15px;font-weight:600;color:var(--c-primary);margin-top:4px">${result.recommended_path}</div>
        </div>
      </div>

      <!-- 维度雷达图占位（用条形图代替） -->
      <div class="card">
        <div class="card-title">📊 五维能力分析</div>
        <div style="margin-top:16px">
          ${dimList.map(([dim, score]) => {
            const label = dimLabels[dim] || dim;
            const isWeak = result.weak_dimensions?.includes(dim);
            const isStrong = result.strong_dimensions?.includes(dim);
            return `
              <div style="margin-bottom:14px">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                  <span style="font-size:13px;font-weight:500">
                    ${label}
                    ${isWeak ? '<span class="chip" style="background:#FEF2F2;color:#DC2626;font-size:10px">弱项</span>' : ''}
                    ${isStrong ? '<span class="chip" style="background:#ECFDF5;color:#059669;font-size:10px">强项</span>' : ''}
                  </span>
                  <span style="font-size:13px;font-weight:600;color:var(--c-ink)">${score}%</span>
                </div>
                <div style="height:8px;background:var(--c-line);border-radius:4px;overflow:hidden">
                  <div style="height:100%;width:${score}%;background:${isWeak ? 'var(--c-danger)' : isStrong ? 'var(--c-success)' : 'var(--c-accent)'};border-radius:4px;transition:width 0.5s"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <!-- 推荐剧本 -->
    <div class="card" style="margin-top:16px">
      <div class="card-title">🎯 为你推荐的首批剧本</div>
      <p class="card-sub" style="margin-top:4px">基于你的级别和弱项精选</p>
      <div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">
        ${(result.recommended_scripts || []).map(sid => {
          const s = (State.scripts || []).find(x => x.id === sid);
          if (!s) return '';
          return `
            <div class="rec-card" data-script="${s.id}" style="padding:14px;border:1px solid var(--c-line);border-radius:10px;cursor:pointer" onmouseover="this.style.borderColor='var(--c-accent)'" onmouseout="this.style.borderColor='var(--c-line)'">
              <div style="font-weight:600;font-size:14px;color:var(--c-ink)">${escapeHtml(s.title)}</div>
              <div style="margin-top:6px">
                <span class="chip ${s.difficulty}">${({intro:'入门',mid:'中级',adv:'高阶'}[s.difficulty] || s.difficulty)}</span>
                <span style="font-size:12px;color:var(--c-mute);margin-left:6px">${s.duration_min} min</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div style="margin-top:16px;text-align:center">
        <button class="btn accent" data-go="scripts">浏览全部剧本 →</button>
      </div>
    </div>
  `;

  $$('.rec-card', c).forEach(card => card.onclick = () => openScriptDetail(card.dataset.script));
  $$('[data-go]', c).forEach(el => el.addEventListener('click', () => setTab(el.dataset.go)));
  $('#retakePlacement').onclick = () => {
    State.placementResult = null;
    localStorage.removeItem('bc_placement');
    startPlacementTest();
  };
}

function scriptRow(s) {
  const unlocked = s.unlocked || IS_ADMIN;
  return `
    <div class="script-row" data-id="${s.id}" data-title="${escapeHtml(s.title)}" data-diff="${s.difficulty || ''}">
      <div style="flex:1">
        <div class="ttl">${escapeHtml(s.title)}</div>
        <div class="sub">
          <span class="chip ${s.difficulty}">${({intro:'入门',mid:'中级',adv:'高阶'}[s.difficulty] || s.difficulty)}</span>
          <span>${s.duration_min} min · ${s.default_session_credits} 积分/对话</span>
          ${s.compatible_characters?.length ? `<span>· ${s.compatible_characters.length} 个 AI 角色可选</span>` : ''}
        </div>
      </div>
      <div class="right">
        ${IS_ADMIN
          ? '<span class="chip unlock">ADMIN · 全开</span>'
          : unlocked
            ? '<span class="chip unlock">已解锁</span>'
            : s.default_unlock_credits === 0
              ? '<span class="chip unlock">FREE</span>'
              : `<span class="chip credits">${s.default_unlock_credits} 积分解锁</span>`}
      </div>
    </div>
  `;
}

async function openScriptDetail(id) {
  const s = State.scripts.find(x => x.id === id);
  if (!s) return;
  const bal = State.wallet?.balance ?? 0;
  const plan = State.wallet?.subscription_plan || 'free';
  const unlocked = s.unlocked || IS_ADMIN;

  // 拉取该剧本的可用角色
  let characters = [];
  try { characters = await api.fetchCharactersFor(id); } catch {}

  const html = `
    <h3>${escapeHtml(s.title)}</h3>
    <p class="lead">${SCENE_META[sceneOfSafe(s)]?.title || ''} · ${s.duration_min} min</p>
    <div class="kv-row"><span>场景</span><b>${SCENE_META[sceneOfSafe(s)]?.title || sceneOfSafe(s)}</b></div>
    <div class="kv-row"><span>难度</span><b>${({intro:'入门',mid:'中级',adv:'高阶'}[s.difficulty])}</b></div>
    <div class="kv-row"><span>对话积分</span><b>${s.default_session_credits} 积分/turn</b></div>
    <div class="kv-row"><span>解锁积分</span><b>${s.default_unlock_credits === 0 ? '免费剧本' : s.default_unlock_credits + ' 积分'}</b></div>
    <div class="kv-row"><span>当前订阅</span><b>${plan.toUpperCase()}</b></div>
    <div class="kv-row"><span>积分余额</span><b>${IS_ADMIN ? '∞' : fmt(bal)}</b></div>
    <div class="kv-row"><span>AI 角色</span><b>${characters.length} 个可选</b></div>
    ${characters.length ? `
      <div style="margin-top: 12px; font-size: 12.5px; color: var(--c-mute)">默认 AI 角色：${escapeHtml(s.ai_role || '—')}</div>
    ` : ''}
    <div class="pay-actions" style="margin-top:18px">
      <button class="btn ghost" data-act="close">关闭</button>
      ${unlocked
        ? `<button class="btn accent" data-act="start">选择角色并开始</button>`
        : `<button class="btn" data-act="unlock">用 ${s.default_unlock_credits} 积分解锁</button>
           <button class="btn ghost" data-act="subscribe">升级订阅</button>`}
    </div>
  `;
  openModal(html);
  $('#modalCard [data-act="close"]').onclick = closeModal;
  if (unlocked) {
    $('#modalCard [data-act="start"]').onclick = () => {
      closeModal();
      openCharacterPicker(s, characters);
    };
  } else {
    $('#modalCard [data-act="unlock"]').onclick = async () => {
      try {
        const r = await api.unlockScript(s.id);
        toast(`已解锁，剩余 ${r.new_balance} 积分`, 'success');
        await refreshGlobal();
        await openScriptDetail(s.id);
      } catch (e) { toast('解锁失败：' + e.message, 'error'); }
    };
    $('#modalCard [data-act="subscribe"]').onclick = () => { closeModal(); setTab('subscribe'); };
  }
}

// --------- 角色选择 + 启动会话 ---------

function openCharacterPicker(script, characters) {
  if (!characters || !characters.length) {
    return startSessionWith(script, null);
  }
  const html = `
    <h3>选择 AI 角色</h3>
    <p class="lead">同一剧本下，不同角色会有不同的口音、性格和沟通风格</p>
    <div class="character-grid">
      ${characters.map(c => `
        <div class="character-card" data-cid="${c.id}">
          <div class="char-avatar">${c.avatar_emoji || '🧑‍💼'}</div>
          <div class="char-name">${escapeHtml(c.name_zh || c.name)} <span style="color:var(--c-mute);font-size:13px;font-weight:400">${escapeHtml(c.name)}</span></div>
          <div class="char-role">${escapeHtml(c.nationality_zh || c.nationality)} · ${escapeHtml(c.role_zh || c.role)}</div>
          <div class="char-traits">${escapeHtml(c.personality_zh || c.personality)}</div>
          <div class="char-sample">"${escapeHtml((c.sample_lines || [])[0] || '')}"</div>
        </div>
      `).join('')}
    </div>
    <div class="pay-actions">
      <button class="btn ghost" data-act="close">取消</button>
      <button class="btn accent" data-act="start" disabled>用此角色开始对话</button>
    </div>
  `;
  openModal(html);
  let picked = null;
  $$('.character-card').forEach(card => card.addEventListener('click', () => {
    $$('.character-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    picked = card.dataset.cid;
    $('[data-act="start"]').disabled = false;
  }));
  $('[data-act="close"]').onclick = closeModal;
  $('[data-act="start"]').onclick = () => {
    closeModal();
    startSessionWith(script, picked);
  };
}

async function startSessionWith(s, characterId) {
  const profile = State.profile || {};
  const enable_annotation = s.id.startsWith('S-DY'); // SC-08 默认开注解
  const html = `
    <h3>${escapeHtml(s.title)}</h3>
    <p class="lead">选择模式开始陪练</p>
    <div class="scenario-block" style="margin-bottom:16px">${escapeHtml(s.scenario || '')}</div>
    <div class="kv-row"><span>对话积分</span><b>${s.default_session_credits} / 轮</b></div>
    <div class="kv-row"><span>当前余额</span><b>${fmt(State.wallet?.balance ?? 0)} 积分</b></div>
    <div class="kv-row"><span>你的岗位</span><b>${escapeHtml(profile.role || s.user_role || '未设置')}</b></div>
    <label class="ann-toggle" style="margin: 14px 0; display: flex; gap: 6px; align-items: center;">
      <input type="checkbox" id="ann" ${enable_annotation ? 'checked' : ''} /> 开启中文注解对照（适合初中级用户）
    </label>
    <div class="pay-actions" style="margin-top: 12px">
      <button class="btn ghost" data-act="close">取消</button>
      <button class="btn accent" data-act="start">开始对话</button>
    </div>
  `;
  openModal(html);
  $('[data-act="close"]').onclick = closeModal;
  $('[data-act="start"]').onclick = async () => {
    const enable_annotation = $('#modalCard #ann').checked;
    closeModal();
    try {
      const r = await api.startSession({
        script_id: s.id,
        difficulty: s.difficulty,
        enable_annotation,
        character_id: characterId,
        user_role_override: profile.role || null,
      });
      State.currentScript = s;
      State.chosenCharacterId = characterId;
      State.session = r;
      const greet = r.character?.sample_lines?.[0]
        ? `${r.character.sample_lines[0]} — what's on your mind?`
        : `Hi, I'm your ${r.ai_role} for this ${r.scenario} practice. Let's start — what would you like to open with?`;
      State.messages = [{ role: 'ai', text: greet, annotations: [] }];
      setTab('session');
      // 自动朗读开场白
      if (State.ttsEnabled) setTimeout(() => speak(greet), 600);
    } catch (e) { toast('启动失败：' + e.message, 'error'); }
  };
}

// --------- 会话页 ---------

function renderSession() {
  const c = $('#content');
  if (!State.session || !State.currentScript) {
    c.innerHTML = `
      <div class="page-h">
        <div>
          <h1>陪练会话</h1>
          <p>先到剧本库选一个剧本开始</p>
        </div>
      </div>
      <div class="card" style="text-align:center; padding: 60px 20px">
        <div style="font-family: var(--f-display); font-size: 60px; color: var(--c-accent); line-height: 1">◯</div>
        <div class="card-title" style="margin: 16px 0 6px">还没选剧本</div>
        <div class="card-sub">从 49 个真实业务场景里挑一个开始练</div>
        <div style="margin-top: 18px"><button class="btn accent" data-go="scripts">浏览剧本库 →</button></div>
      </div>
    `;
    $$('[data-go]', c).forEach(el => el.addEventListener('click', () => setTab(el.dataset.go)));
    return;
  }

  const s = State.currentScript;
  const sess = State.session;
  const charObj = sess.character || null;
  const turn = State.messages.filter(m => m.role === 'user').length;
  const bal = State.wallet?.balance ?? 0;
  const isAdmin = !!(State.wallet?.is_admin || IS_ADMIN);
  const hasVoice = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  c.innerHTML = `
    <div class="page-h">
      <div>
        <h1>${escapeHtml(s.title)}</h1>
        <p>${escapeHtml(SCENE_META[sceneOfSafe(s)]?.title || '')} · 最多 20 轮</p>
      </div>
    </div>

    <div class="session-wrap">
      <div class="session-stage">
        <div class="session-head">
          <div style="display:flex; align-items:center; gap:12px">
            ${charObj ? `<div style="font-size:28px">${charObj.avatar_emoji || '🧑‍💼'}</div>` : ''}
            <div>
              <div class="ttl">${escapeHtml(sess.scenario || s.title)}</div>
              <div class="role">AI 角色：${escapeHtml(sess.ai_role)}</div>
            </div>
          </div>
          <div class="right">
            <div class="progress"><i style="width:${(turn/20)*100}%"></i></div>
            <span style="font-size:12px;color:var(--c-mute);font-family:var(--f-mono)">${turn}/20</span>
            <span class="credits-pill" id="creditsPill">${fmt(bal)} 积分</span>
            <button class="btn ghost sm" id="endBtn">结束</button>
          </div>
        </div>
        <div class="messages" id="messages">
          ${State.messages.map(m => bubbleHtml(m)).join('')}
          <div id="thinking" hidden>
            <div class="bubble ai">
              <div class="b-ttl">AI</div>
              <div class="b-body" style="opacity:0.6">思考中…</div>
            </div>
          </div>
        </div>
        <div class="composer">
          <textarea id="composer" placeholder="用英文回复…(Shift+Enter 换行)"></textarea>
          <button class="voice-btn" id="voiceBtn" title="${hasVoice ? '按住说话' : '浏览器不支持语音'}" ${hasVoice ? '' : 'disabled'}>🎙️</button>
          <div style="display:flex; flex-direction:column; gap:6px">
            <label class="ann-toggle" style="font-size:11px;color:var(--c-mute)">
              <input type="checkbox" id="annToggle" ${sess.annotationEnabled ? 'checked' : ''} /> 注解
            </label>
            <label class="ann-toggle" style="font-size:11px;color:var(--c-mute)">
              <input type="checkbox" id="ttsToggle" ${State.ttsEnabled ? 'checked' : ''} /> 朗读 AI
              <span id="ttsVoiceLabel" style="cursor:pointer;text-decoration:underline dotted;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="点击切换音色">${escapeHtml((() => { const v = State.ttsVoices.find(x => x.id === State.ttsVoice); return v ? (v.name || v.id) : (State.ttsVoice || '默认'); })())}</span>
            </label>
            <button class="btn accent" id="sendBtn">发送</button>
          </div>
        </div>
      </div>

      <div class="session-aside">
        <div class="card">
          <div class="card-title">本场信息</div>
          <div class="kv-row"><span>剧本</span><b>${s.id}</b></div>
          <div class="kv-row"><span>AI 角色</span><b>${escapeHtml(sess.ai_role)}</b></div>
          <div class="kv-row"><span>用户角色</span><b>${escapeHtml(sess.user_role || '—')}</b></div>
          <div class="kv-row"><span>LLM</span><b>${State.env?.provider || '—'} · ${State.env?.model || '—'}</b></div>
          <div class="kv-row"><span>本场积分消耗</span><b id="kpiSpent">0</b></div>
          <div class="kv-row"><span>余额</span><b id="kpiBal">${isAdmin ? '∞' : fmt(bal)}</b></div>
        </div>
        ${isAdmin ? `
        <div class="card admin-card">
          <div class="card-title">ADMIN · Debug</div>
          <div class="kv-row"><span>Provider</span><b id="dbgProvider">—</b></div>
          <div class="kv-row"><span>Model</span><b id="dbgModel">—</b></div>
          <div class="kv-row"><span>本轮 prompt tokens</span><b id="dbgPrompt">0</b></div>
          <div class="kv-row"><span>本轮 completion tokens</span><b id="dbgCompletion">0</b></div>
          <div class="kv-row"><span>本轮 token 折算 credits</span><b id="dbgInternal">0</b></div>
          <div class="kv-row"><span>本轮 用户计费</span><b id="dbgBilled">0</b></div>
          <div style="font-size:11px;color:var(--c-mute);margin-top:8px">按 <code>?user=admin</code> 任意进入；普通用户看不到这些字段。</div>
        </div>
        ` : ''}
        <div class="card">
          <div class="card-title">情境</div>
          <div class="scenario-block">${escapeHtml(sess.scenario || s.title)}</div>
        </div>
        <div class="card">
          <div class="card-title">跨文化小贴士</div>
          <ul class="traps" style="padding-left:0;list-style:none;margin:6px 0 0">
            ${(s.cultural_traps || ['保持专业、简洁、有数据支撑']).map(t => `<li>${escapeHtml(t)}</li>`).join('')}
          </ul>
        </div>
        <div class="card">
          <button class="btn ghost sm" id="gotoPhrasebook" style="width:100%">📓 话术本 (${State.phrasebook.length})</button>
        </div>
      </div>
    </div>
  `;

  // 发送
  const ta = $('#composer');
  const send = async () => {
    const txt = ta.value.trim();
    if (!txt) return;
    State.messages.push({ role: 'user', text: txt, annotations: [] });
    ta.value = '';
    renderMessages();
    $('#thinking').hidden = false;
    $('#messages').scrollTop = $('#messages').scrollHeight;
    try {
      const r = await api.sendTurn(sess.session_id, txt);
      State.messages.push({ role: 'ai', text: r.ai_text, annotations: r.annotations || [] });
      $('#kpiSpent').textContent = (Number($('#kpiSpent').textContent) + r.credits_used);
      $('#kpiBal').textContent = isAdmin ? '∞' : fmt(r.credits_remaining);
      $('#creditsPill').textContent = isAdmin ? '∞ 积分' : `${fmt(r.credits_remaining)} 积分`;
      if (isAdmin && r.debug) {
        if ($('#dbgProvider'))  { $('#dbgProvider').textContent  = r.debug.provider || '—'; }
        if ($('#dbgModel'))     { $('#dbgModel').textContent     = r.debug.model || '—'; }
        if ($('#dbgPrompt'))    { $('#dbgPrompt').textContent    = r.debug.prompt_tokens ?? 0; }
        if ($('#dbgCompletion')){ $('#dbgCompletion').textContent= r.debug.completion_tokens ?? 0; }
        if ($('#dbgInternal'))  { $('#dbgInternal').textContent  = r.debug.internal_credits_used ?? 0; }
        if ($('#dbgBilled'))    { $('#dbgBilled').textContent    = r.debug.billed_credits ?? 0; }
      }
      $('#thinking').hidden = true;
      renderMessages();
      // 自动朗读 AI 回复
      if (State.ttsEnabled) speak(r.ai_text);
      // 刷新全局余额
      refreshGlobal();
      if (r.finished) {
        toast('已达到最大轮次，自动结束会话', 'warn');
        await endSession();
      }
    } catch (e) {
      $('#thinking').hidden = true;
      toast('对话失败：' + e.message, 'error');
    }
  };
  $('#sendBtn').onclick = send;
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $('#endBtn').onclick = () => endSession();
  $('#annToggle').onchange = (e) => { State.session.annotationEnabled = e.target.checked; renderMessages(); };
  $('#ttsToggle').onchange = (e) => { State.ttsEnabled = e.target.checked; };
  const ttsVL = $('#ttsVoiceLabel'); if (ttsVL) ttsVL.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openVoicePicker(); };
  $('#gotoPhrasebook').onclick = () => renderPhrasebookModal();

  // 语音输入
  initVoiceInput(ta);

  $('#messages').scrollTop = $('#messages').scrollHeight;
}

function bubbleHtml(m) {
  const isUser = m.role === 'user';
  const annotations = (m.annotations || []).map(a => `
    <div class="ann">
      <div class="ph">${escapeHtml(a.phrase)}</div>
      <div class="cn">${escapeHtml(a.translation)}</div>
      ${a.note ? `<div class="nt">${escapeHtml(a.note)}</div>` : ''}
    </div>
  `).join('');
  const ttsBtn = !isUser ? `<button class="tts-btn" data-act="tts" title="朗读">🔊</button>` : '';
  return `
    <div class="bubble ${isUser ? 'user' : 'ai'}">
      <div class="b-ttl" style="display:flex;align-items:center;gap:6px">${isUser ? '你' : 'AI'} ${ttsBtn}</div>
      <div class="b-body">${escapeHtml(m.text)}</div>
      ${(!isUser && State.session?.annotationEnabled) ? annotations : ''}
    </div>
  `;
}

function renderMessages() {
  const wrap = $('#messages');
  if (!wrap) return;
  wrap.querySelectorAll('.bubble').forEach(el => el.remove());
  State.messages.forEach(m => {
    const tmp = document.createElement('div');
    tmp.innerHTML = bubbleHtml(m);
    wrap.insertBefore(tmp.firstElementChild, $('#thinking'));
  });
  wrap.scrollTop = wrap.scrollHeight;
  // 绑定 TTS
  $$('.bubble.ai [data-act="tts"]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const text = btn.parentElement.parentElement.querySelector('.b-body').textContent;
      speak(text);
    };
  });
}

// ---- 语音输入 ----

function initVoiceInput(ta) {
  const btn = $('#voiceBtn');
  if (!btn) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    btn.title = '当前浏览器不支持语音识别';
    return;
  }
  // 销毁旧的
  if (State.recognition) {
    try { State.recognition.stop(); } catch {}
    State.recognition = null;
  }
  const recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  let pressTimer = null;
  let pressedHere = false;

  const start = () => {
    pressedHere = true;
    try { recognition.start(); } catch {}
  };
  const stop = () => {
    pressedHere = false;
    try { recognition.stop(); } catch {}
  };

  btn.addEventListener('mousedown', (e) => { e.preventDefault(); start(); });
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); }, { passive: false });
  btn.addEventListener('mouseup', () => stop());
  btn.addEventListener('mouseleave', () => pressedHere && stop());
  btn.addEventListener('touchend', () => stop());

  recognition.onstart = () => {
    State.isRecording = true;
    btn.classList.add('recording');
    ta.placeholder = '🎙️ Listening... 松开结束';
  };
  recognition.onresult = (ev) => {
    const transcript = ev.results[0][0].transcript;
    ta.value = (ta.value ? ta.value + ' ' : '') + transcript;
  };
  recognition.onerror = (ev) => {
    toast('语音识别失败：' + (ev.error || 'unknown'), 'error');
  };
  recognition.onend = () => {
    State.isRecording = false;
    btn.classList.remove('recording');
    ta.placeholder = '用英文回复…(Shift+Enter 换行)';
  };
  State.recognition = recognition;
}

// ---- TTS ----

// 后端 TTS 音频缓存（同一文本+音色不重复请求）
const _ttsCache = new Map();

function speak(text) {
  if (!State.ttsEnabled || !text) return;
  const selectedId = State.ttsVoice || '';
  // 判断选中的是后端音色还是浏览器音色
  const isBackendVoice = State.ttsVoices.some(v => v.id === selectedId);
  if (isBackendVoice) {
    speakBackend(text, selectedId);
  } else {
    speakBrowser(text);
  }
}

async function speakBackend(text, voiceId) {
  const cacheKey = `${voiceId}::${text}`;
  if (_ttsCache.has(cacheKey)) {
    playAudioBase64(_ttsCache.get(cacheKey));
    return;
  }
  try {
    const r = await api.synthTts({ text, voice: voiceId, rate: '+0%' });
    if (r.audio_bytes_b64) {
      _ttsCache.set(cacheKey, r.audio_bytes_b64);
      if (_ttsCache.size > 80) { const first = _ttsCache.keys().next().value; _ttsCache.delete(first); }
      playAudioBase64(r.audio_bytes_b64, r.format || 'mp3');
    } else if (r.audio_url) {
      new Audio(r.audio_url).play().catch(() => {});
    } else {
      speakBrowser(text);
    }
  } catch (e) {
    console.warn('Backend TTS failed, fallback browser', e);
    speakBrowser(text);
  }
}

function playAudioBase64(b64, fmt) {
  try {
    const mime = fmt === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const blob = new Blob([arr], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.onended = () => URL.revokeObjectURL(url);
    a.play().catch(() => {});
  } catch (e) { console.warn('playAudioBase64 error', e); }
}

function speakBrowser(text) {
  if (!State.tts || !State.tts.speak) return;
  try {
    State.tts.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1.0;
    if (State.ttsVoice) {
      const m = State.tts.getVoices().find(v => v.name === State.ttsVoice || v.voiceURI === State.ttsVoice);
      if (m) u.voice = m;
    }
    if (!u.voice) {
      const enVoice = State.tts.getVoices().find(v => v.lang && v.lang.startsWith('en'));
      if (enVoice) u.voice = enVoice;
    }
    State.tts.speak(u);
  } catch (e) { console.warn('Browser TTS failed', e); }
}

// 试听 TTS 音色
async function previewTtsVoice(voiceId) {
  const text = "Good morning everyone, let's discuss our Q3 marketing strategy.";
  try {
    toast('试听中…', 'info');
    const r = await api.synthTts({ text, voice: voiceId, rate: '+0%' });
    if (r.audio_bytes_b64) {
      playAudioBase64(r.audio_bytes_b64, r.format || 'mp3');
    } else if (r.audio_url) {
      new Audio(r.audio_url).play().catch(() => {});
    } else {
      toast('当前 TTS 后端暂不支持试听', 'error');
    }
  } catch (e) { toast('试听失败：' + e.message, 'error'); }
}

// 音色选择器（弹窗）
function openVoicePicker() {
  const backendVoices = State.ttsVoices || [];
  const browserVoices = (State.tts?.getVoices?.() || []).filter(v => v.lang && v.lang.startsWith('en'));
  const current = State.ttsVoice || '';

  const genderIcon = g => g === 'female' ? '👩' : g === 'male' ? '👨' : '🧑';
  const backendHtml = backendVoices.map(v => `
    <div class="option-card ${current === v.id ? 'selected' : ''}" data-vid="${v.id}" data-backend="1">
      <div style="display:flex;align-items:center;gap:8px">
        <span>${genderIcon(v.gender)}</span>
        <div>
          <div style="font-weight:600;font-size:13.5px">${escapeHtml(v.name || v.id)}</div>
          <div style="font-size:11px;color:var(--c-mute)">${v.lang || ''} · ${v.style || v.id}</div>
        </div>
      </div>
    </div>
  `).join('');

  const browserHtml = browserVoices.slice(0, 10).map(v => `
    <div class="option-card ${current === v.name ? 'selected' : ''}" data-vid="${v.name}" data-backend="0">
      <div style="display:flex;align-items:center;gap:8px">
        <span>🌐</span>
        <div>
          <div style="font-weight:600;font-size:13.5px">${escapeHtml(v.name)}</div>
          <div style="font-size:11px;color:var(--c-mute)">${v.lang} · 浏览器原生</div>
        </div>
      </div>
    </div>
  `).join('');

  openModal(`
    <h3>🔊 选择朗读音色</h3>
    <p class="lead">后端音色由 AI 合成，效果更自然</p>
    ${backendHtml ? `
      <div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--c-mute);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">AI 音色（${backendVoices[0]?.engine || 'Edge TTS'}）</div>
        <div class="option-grid" id="backendVoices">${backendHtml}</div>
      </div>
    ` : ''}
    ${browserHtml ? `
      <div style="margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--c-mute);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">浏览器音色</div>
        <div class="option-grid" id="browserVoices">${browserHtml}</div>
      </div>
    ` : ''}
    <div class="pay-actions" style="margin-top:16px">
      <button class="btn ghost" data-act="close">取消</button>
      <button class="btn" data-act="preview" disabled>🔊 试听</button>
      <button class="btn accent" data-act="save">确认选择</button>
    </div>
  `);

  let picked = current;
  let pickedBackend = backendVoices.some(v => v.id === current) ? '1' : '0';

  $$('.option-card[data-vid]').forEach(card => card.onclick = () => {
    $$('.option-card[data-vid]').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    picked = card.dataset.vid;
    pickedBackend = card.dataset.backend;
    $('[data-act="preview"]').disabled = false;
    $('[data-act="save"]').disabled = false;
  });

  $('[data-act="close"]').onclick = closeModal;
  $('[data-act="preview"]').onclick = () => {
    if (picked && pickedBackend === '1') previewTtsVoice(picked);
    else if (picked && State.tts) {
      State.tts.cancel();
      const u = new SpeechSynthesisUtterance("Good morning everyone, let's discuss our Q3 marketing strategy.");
      const v = browserVoices.find(x => x.name === picked);
      if (v) u.voice = v;
      State.tts.speak(u);
    }
  };
  $('[data-act="save"]').onclick = () => {
    State.ttsVoice = picked;
    localStorage.setItem(TTS_KEY, picked);
    toast('音色已切换', 'success');
    closeModal();
    // 刷新当前会话界面的音色指示器
    const label = $('#ttsVoiceLabel');
    if (label) {
      const v = backendVoices.find(x => x.id === picked);
      label.textContent = v ? (v.name || v.id) : (picked || '默认');
    }
  };
}

// ---- 结束会话 + 评分报告 ----

async function endSession() {
  if (!State.session) return;
  const sid = State.session.session_id;
  try {
    const r = await api.endSession(sid);
    toast(`会话已结束：${r.total_turns} 轮 · ${r.total_credits} 积分`, 'success');
    if (r.feedback && r.feedback.overall_score !== undefined) {
      renderFeedbackReport(r.feedback);
    } else {
      setTab('scripts');
    }
  } catch (e) {
    toast('结束失败：' + e.message, 'error');
  }
  State.session = null;
  State.currentScript = null;
  State.messages = [];
  State.chosenCharacterId = null;
  // 刷新 streak / weekly / inbox
  try { State.streak = await api.fetchStreak(); } catch {}
  try { State.weekly = await api.fetchWeekly(false); } catch {}
  try { State.inbox = await api.fetchInbox(); } catch {}
  try { State.recommendedToday = await api.fetchRecommendedToday(); } catch {}
  refreshGlobal();
}

// ---- 社交分享 ----
function shareReport(fb) {
  const overall = (fb.overall_score || 0).toFixed(1);
  const dims = fb.dimensions || {};
  const dimStr = DIM_ORDER.map(k => `${DIM_LABELS[k]} ${(dims[k]?.score || 0).toFixed(1)}`).join(' | ');
  const script = State.currentScript?.title || '商务英语';
  const badge = overall >= 8 ? '🏆' : overall >= 6 ? '💪' : '📚';
  const text = `${badge} BrandCoach 练习完成！\n📝 ${script}\n⭐ 综合评分：${overall}/10\n📊 ${dimStr}\n\n#BrandCoach #商务英语 #AI陪练`;
  const url = location.href;

  if (navigator.share) {
    navigator.share({ title: 'BrandCoach 练习成绩', text, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      toast('成绩已复制到剪贴板，去社交平台粘贴分享吧！', 'success');
    }).catch(() => {
      openShareModal(text);
    });
  } else {
    openShareModal(text);
  }
}

function openShareModal(text) {
  openModal(`
    <h3>📤 分享练习成绩</h3>
    <p class="lead">复制下方文字，粘贴到微信/小红书/朋友圈</p>
    <textarea readonly style="width:100%;height:160px;padding:12px;border:1px solid var(--c-line);border-radius:var(--r-md);font-size:13px;font-family:inherit;resize:none;background:var(--c-line-soft)">${escapeHtml(text)}</textarea>
    <div class="pay-actions" style="margin-top:14px">
      <button class="btn ghost" data-act="close">关闭</button>
      <button class="btn accent" data-act="copy">📋 复制文字</button>
    </div>
  `);
  $('[data-act="close"]').onclick = closeModal;
  $('[data-act="copy"]').onclick = () => {
    navigator.clipboard?.writeText(text).then(() => {
      toast('已复制！', 'success'); closeModal();
    }).catch(() => { toast('请手动选择复制', 'warn'); });
  };
}

function renderFeedbackReport(fb) {
  State.lastFeedback = fb;
  const dimsHtml = DIM_ORDER.map(k => {
    const d = fb.dimensions?.[k] || {};
    const score = d.score || 0;
    return `
      <div class="feedback-dim">
        <div class="name">${DIM_LABELS[k]}</div>
        <div class="bar"><div class="fill" style="width:${score * 10}%"></div></div>
        <div class="score">${score}/10</div>
      </div>
      <div class="feedback-section" style="margin-top:4px">
        <div class="item"><strong>👍 优点：</strong>${escapeHtml(d.strength || '—')}</div>
        <div class="item"><strong>💡 改进：</strong>${escapeHtml(d.improvement || '—')}</div>
      </div>
    `;
  }).join('');

  // 营销方法论识别
  const modelsHtml = (fb.marketing_models_seen && fb.marketing_models_seen.length)
    ? `<div class="feedback-section">
         <h4>📚 AI 识别到的营销模型/方法论</h4>
         <div class="dim-tags" style="margin-top:6px">${fb.marketing_models_seen.map(m =>
           `<span class="chip">${escapeHtml(m)}</span>`).join('')}</div>
       </div>`
    : '';

  // 评分阈值化：<7 推荐剧本
  const recommended = fb.recommended_scripts || [];
  const recHtml = recommended.length
    ? `<div class="feedback-section" style="border-left: 3px solid var(--c-accent)">
         <h4>🎯 推荐补强剧本（评分 ${fb.overall_score} &lt; 7）</h4>
         <div style="font-size:12.5px;color:var(--c-mute);margin-bottom:8px">基于你最弱的维度自动推荐：</div>
         <div class="character-grid" style="margin:0">
           ${recommended.map(sid => {
             const s = State.scripts.find(x => x.id === sid);
             if (!s) return '';
             return `<div class="script-row" data-rec="${sid}" style="cursor:pointer">
               <div style="flex:1">
                 <div class="ttl">${escapeHtml(s.title)}</div>
                 <div class="sub"><span class="chip ${s.difficulty}">${({intro:'入门',mid:'中级',adv:'高阶'}[s.difficulty])}</span> · ${s.id} · ${s.default_session_credits} 积分</div>
               </div>
               <span class="chip unlock">去练习 →</span>
             </div>`;
           }).join('')}
         </div>
       </div>`
    : '';

  const highlightsHtml = (fb.highlights || []).map((h, i) => `
    <div class="item" data-hi="${i}">
      <div style="display:flex;align-items:flex-start;gap:6px">
        <span style="flex:1">"${escapeHtml(h.sentence)}" <span style="color:var(--c-mute);font-size:12px">— ${escapeHtml(h.note || '')}</span></span>
        <button class="collect-btn" data-act="collect" data-s="${escapeHtml(h.sentence)}" data-n="${escapeHtml(h.note || '')}" title="收藏到话术本">☆</button>
      </div>
    </div>
  `).join('');

  const improvementsHtml = (fb.improvements || []).map(it => `
    <div class="item">
      <div><span class="original">${escapeHtml(it.original)}</span> → <span class="suggested">${escapeHtml(it.suggested)}</span></div>
      <div class="reason">第 ${it.turn} 轮 · ${escapeHtml(it.reason || '')}</div>
    </div>
  `).join('');

  const overall = fb.overall_score || 0;
  const html = `
    <h3>📊 对话结束 · AI 教练评分</h3>
    <p class="lead">基于你的 ${State.currentScript?.title || '本场'} 练习（共 ${State.messages.filter(m=>m.role==='user').length} 轮）</p>
    <div class="feedback-card">
      <div class="feedback-overall">
        <div class="num">${overall.toFixed ? overall.toFixed(1) : overall}</div>
        <div>
          <div class="lbl">综合评分</div>
          <div style="font-size:12.5px;color:var(--c-ink-soft);margin-top:2px">${
            overall >= 8 ? '表现优秀，已具备实战场合的语言能力' :
            overall >= 6 ? '基础到位，可针对薄弱维度加强练习' :
            '建议重新练习一遍，注意语法和文化敏感点'
          }</div>
        </div>
        <div class="out-of">/10</div>
      </div>
      <div class="feedback-dims">${dimsHtml}</div>
      ${highlightsHtml ? `
        <div class="feedback-section">
          <h4>⭐ 你说的好句子 · 点击收藏</h4>
          ${highlightsHtml}
        </div>` : ''}
      ${improvementsHtml ? `
        <div class="feedback-section">
          <h4>💡 具体改进建议</h4>
          ${improvementsHtml}
        </div>` : ''}
      ${modelsHtml}
      ${recHtml}
    </div>
    <div class="pay-actions" style="margin-top:18px">
      <button class="btn ghost" data-act="share" title="分享成绩到社交媒体">📤 分享</button>
      <button class="btn ghost" data-act="close">关闭</button>
      <button class="btn" data-act="phrasebook">📓 打开话术本</button>
      <button class="btn accent" data-act="writing">🎧 听力训练</button>
      <button class="btn accent" data-act="new">开始新对话</button>
    </div>
  `;
  openModal(html);
  $('[data-act="close"]').onclick = closeModal;
  $('[data-act="new"]').onclick = () => { closeModal(); setTab('scripts'); };
  $('[data-act="phrasebook"]').onclick = () => { closeModal(); renderPhrasebookModal(); };
  $('[data-act="writing"]').onclick = () => { closeModal(); openWritingPractice(); };
  $('[data-act="share"]').onclick = () => shareReport(fb);
  // 推荐剧本点击 → 直接跳剧本详情
  $$('[data-rec]', c || $('#modalCard')).forEach(row => {
    row.onclick = () => {
      closeModal();
      const sid = row.dataset.rec;
      const s = State.scripts.find(x => x.id === sid);
      if (s) openScriptDetail(sid);
    };
  });
  // 绑定收藏按钮
  $$('.collect-btn').forEach(btn => btn.onclick = async () => {
    try {
      await api.addPhrase({
        sentence: btn.dataset.s,
        note: btn.dataset.n,
        script_id: State.currentScript?.id || '',
      });
      btn.classList.add('collected');
      btn.textContent = '★';
      State.phrasebook = await api.fetchPhrasebook();
      toast('已收藏到话术本', 'success');
    } catch (e) {
      toast('收藏失败：' + e.message, 'error');
    }
  });
}

// --------- 站内消息 ---------

async function renderInboxModal() {
  try { State.inbox = await api.fetchInbox(); }
  catch (e) { toast('加载消息失败：' + e.message, 'error'); return; }
  const items = State.inbox;
  const html = `
    <h3>📬 站内消息</h3>
    <p class="lead">${items.length} 条 · ${items.filter(m => !m.read).length} 未读</p>
    ${items.length ? `
      <div class="phrasebook-list" style="max-height:60vh;overflow:auto">
        ${items.map(m => `
          <div class="phrasebook-item" data-mid="${m.id}" style="opacity:${m.read ? 0.7 : 1}">
            <div>
              <div class="sentence" style="font-size:14px">${escapeHtml(m.subject || '')}</div>
              <div class="note">${escapeHtml(m.body || '')}</div>
              <div class="meta">${escapeHtml((m.ts||'').slice(0,16).replace('T',' '))} · ${escapeHtml(m.kind||'')}</div>
            </div>
            <div class="actions">
              ${!m.read ? `<button class="iconbtn" data-act="read" title="标为已读">✓</button>` : ''}
              ${m.kind === 'weekly_report' ? `<button class="tts-btn" data-act="tts" title="刷新周报">📊</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    ` : `<div class="card" style="text-align:center; padding:40px">还没收到消息</div>`}
    <div class="pay-actions" style="margin-top:14px">
      <button class="btn ghost" data-act="push">📤 立即推送本周周报（demo）</button>
      <button class="btn ghost" data-act="close">关闭</button>
    </div>
  `;
  openModal(html);
  $('[data-act="close"]').onclick = closeModal;
  $('[data-act="push"]').onclick = async () => {
    try {
      const r = await api.fetchWeekly(true);
      toast(`已推送周报到 inbox（message_id=${r.message_id}）`, 'success');
      State.inbox = await api.fetchInbox();
      renderInboxModal();
    } catch (e) { toast('推送失败：' + e.message, 'error'); }
  };
  $$('[data-act="read"]').forEach(b => b.onclick = async () => {
    try {
      await api.markInboxRead(b.parentElement.parentElement.dataset.mid);
      State.inbox = await api.fetchInbox();
      renderInboxModal();
    } catch (e) { toast('失败：' + e.message, 'error'); }
  });
}

// --------- 听力微训练（听写模式） ---------

function openWritingPractice() {
  // 从 SC-08 剧本库里随机抽一句做 source
  const sc08 = State.scripts.filter(s => (s.id || '').startsWith('S-DY'));
  const src = sc08[Math.floor(Math.random() * sc08.length)] || State.scripts[0];
  const sampleLines = [
    "Let's touch base on the launch timeline.",
    "Could you take a look at the proposal before EOD?",
    "I think we should circle back on the budget next week.",
    "Following up on the contract — any update?",
    "I'll keep this short — we have ten minutes.",
    "Here's the status update for the marketing team.",
    "What's your take on the new positioning?",
    "I need your input on the Q3 OKR.",
    "Could you give us a ballpark figure on cost?",
    "Let's sync up after the standup tomorrow.",
  ];
  const source_text = sampleLines[Math.floor(Math.random() * sampleLines.length)];
  const html = `
    <h3>🎧 听力微训练</h3>
    <p class="lead">听 AI 朗读一句话（点「▶ 播放」），然后凭记忆把它打下来。<br/>适用 SC-08 商务英语日常 · 练听力 + 拼写。</p>
    <div class="feedback-section">
      <div class="item">
        <strong>📌 原文（先不要看）：</strong>
        <div id="srcText" style="display:none;margin-top:6px;font-family: var(--f-display); font-size: 16px; padding:8px; background:#fff; border-radius:6px; border: 1px solid var(--c-line)">${escapeHtml(source_text)}</div>
        <button class="btn accent sm" id="playBtn" style="margin-top:8px">▶ 播放原声</button>
        <button class="btn ghost sm" id="showBtn" style="margin-top:8px;margin-left:6px">👁 显示原文</button>
      </div>
    </div>
    <div style="margin: 14px 0">
      <textarea id="userText" placeholder="把你听到的打下来..." style="width:100%;min-height:80px;padding:12px;border:1px solid var(--c-line);border-radius:10px;font-family:inherit;font-size:14.5px"></textarea>
    </div>
    <div id="wpResult" style="display:none"></div>
    <div class="pay-actions">
      <button class="btn ghost" data-act="close">关闭</button>
      <button class="btn" data-act="replay">🔁 换一句</button>
      <button class="btn accent" data-act="submit">提交并评分</button>
    </div>
  `;
  openModal(html);
  const playBtn = $('#playBtn');
  const showBtn = $('#showBtn');
  if (playBtn) playBtn.onclick = () => speak(source_text);
  if (showBtn) showBtn.onclick = () => { $('#srcText').style.display = 'block'; };
  $('[data-act="close"]').onclick = closeModal;
  $('[data-act="replay"]').onclick = () => { closeModal(); openWritingPractice(); };
  $('[data-act="submit"]').onclick = async () => {
    const user_text = $('#userText').value.trim();
    if (!user_text) return toast('请先输入你听到的内容', 'warn');
    try {
      const r = await api.submitWritingPractice({
        source_text,
        user_text,
        script_id: src?.id || '',
      });
      const acc = r.accuracy;
      const color = acc >= 90 ? '#1B6E45' : acc >= 70 ? '#B07A1B' : '#B73A3A';
      $('#wpResult').style.display = 'block';
      $('#wpResult').innerHTML = `
        <div class="feedback-section" style="border-left: 3px solid ${color}">
          <h4>📊 准确率 <span style="color:${color}">${acc}%</span></h4>
          <div class="item"><strong>原文：</strong>${escapeHtml(source_text)}</div>
          <div class="item"><strong>你写的：</strong>${escapeHtml(user_text)}</div>
          <div class="item" style="font-size:12px;color:var(--c-mute)">${acc >= 90 ? '🎉 几乎完美！' : acc >= 70 ? '👍 不错，再听一遍能更好' : '💪 多练几次，听力会快速提升'}</div>
        </div>
      `;
      State.writingPractice = await api.fetchWritingPractice();
      toast(`本次准确率 ${acc}%`, acc >= 70 ? 'success' : 'warn');
    } catch (e) {
      toast('提交失败：' + e.message, 'error');
    }
  };
}

// --------- 话术本 ---------

async function renderPhrasebookModal() {
    try {
      State.phrasebook = await api.fetchPhrasebook();
  } catch (e) { toast('加载话术本失败：' + e.message, 'error'); return; }
  const items = State.phrasebook;
  const html = `
    <h3>📓 我的话术本</h3>
    <p class="lead">${items.length} 条好句子 · AI 教练评出的亮点 + 你手动收藏的句子</p>
    ${items.length ? `
      <div class="phrasebook-list">
        ${items.map(it => `
          <div class="phrasebook-item">
            <div>
              <div class="sentence">${escapeHtml(it.sentence)}</div>
              ${it.note ? `<div class="note">${escapeHtml(it.note)}</div>` : ''}
              <div class="meta">${escapeHtml(it.script_id || '—')} · ${(it.ts || '').slice(0,10)}</div>
            </div>
            <div class="actions">
              <button class="tts-btn" data-act="tts" title="朗读">🔊</button>
              <button class="iconbtn" data-act="del" data-id="${it.id}" title="删除">×</button>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div class="card" style="text-align:center; padding: 40px 20px">
        <div style="font-size: 48px">📓</div>
        <div class="card-title" style="margin: 12px 0 6px">话术本还是空的</div>
        <div class="card-sub">完成一场对话并查看评分报告后，可以收藏亮点句子</div>
      </div>
    `}
    <div class="pay-actions" style="margin-top:14px">
      <button class="btn ghost" data-act="close">关闭</button>
    </div>
  `;
  openModal(html);
  $('[data-act="close"]').onclick = closeModal;
  $$('[data-act="del"]').forEach(btn => btn.onclick = async () => {
    try {
      await api.delPhrase(btn.dataset.id);
      toast('已删除', 'success');
      renderPhrasebookModal();
    } catch (e) { toast('删除失败：' + e.message, 'error'); }
  });
  $$('[data-act="tts"]').forEach(btn => btn.onclick = () => {
    const txt = btn.parentElement.parentElement.querySelector('.sentence').textContent;
    speak(txt);
  });
}

// --------- 钱包 ---------

async function renderWallet() {
  const c = $('#content');
  if (!State.packages.length) State.packages = await api.fetchPackages();
  c.innerHTML = `
    <div class="page-h">
      <div>
        <h1>钱包</h1>
        <p>订阅 + 积分双层付费 · 1 积分 ≈ ¥0.1</p>
      </div>
    </div>

    <div class="wallet-hero">
      <div>
        <div class="lbl">积分余额</div>
        <div class="num">${fmt(State.wallet?.balance ?? 0)}</div>
        <div class="sub">订阅：${(State.wallet?.subscription_plan || 'free').toUpperCase()} · 本月剩余：${fmt(State.wallet?.monthly_credits_remaining ?? 0)}</div>
      </div>
      <div style="text-align:right">
        <button class="btn ghost sm" id="refreshWallet">↺ 刷新</button>
      </div>
    </div>

    <div class="section-h">
      <h3>充值积分</h3>
      <span class="meta">支付为占位流程，点击模拟成功回调</span>
    </div>
    <div class="topup-grid">
      ${State.packages.map(p => `
        <div class="topup-card" data-pkg="${p.id}">
          <div class="name">${escapeHtml(p.name)}</div>
          <div class="price">¥${p.price_cny}<small>元</small></div>
          <div class="total">${fmt(p.total_credits)} 积分</div>
          <div class="bonus">基础 ${p.base_credits} + 赠送 ${p.bonus_credits}</div>
          <button class="btn accent sm" style="margin-top: 8px">立即充值</button>
        </div>
      `).join('')}
    </div>

    <div class="section-h" style="margin-top: 28px;">
      <h3>📓 我的话术本</h3>
      <span class="meta">${State.phrasebook.length} 条</span>
    </div>
    <div style="padding:14px">
      <button class="btn ghost" id="openPb" style="width:100%">打开话术本</button>
    </div>

    <div class="section-h" style="margin-top: 28px;">
      <h3>最近账本</h3>
    </div>
    <div class="card" style="padding: 0; overflow: hidden">
      <table class="ledger-table">
        <thead>
          <tr><th>时间</th><th>事项</th><th style="text-align:right">积分</th><th style="text-align:right">余额</th></tr>
        </thead>
        <tbody id="ledgerBody">
          <tr><td colspan="4" style="text-align:center; color: var(--c-mute); padding: 20px">加载中…</td></tr>
        </tbody>
      </table>
    </div>
  `;

  $('#refreshWallet').onclick = async () => { await refreshGlobal(); renderWallet(); };
  $$('.topup-card', c).forEach(card => {
    card.addEventListener('click', () => openTopupPay(card.dataset.pkg));
  });
  $('#openPb').onclick = () => renderPhrasebookModal();
  loadLedger();
}

async function loadLedger() {
  const body = $('#ledgerBody');
  if (!body) return;
  try {
    const r = await api.get('/credits/ledger?limit=30');
    const entries = r.entries || [];
    if (!entries.length) {
      body.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--c-mute); padding: 20px">暂无流水</td></tr>';
      return;
    }
    body.innerHTML = entries.map(e => `
      <tr>
        <td>${new Date(e.ts).toLocaleString('zh-CN', { hour12: false })}</td>
        <td>${escapeHtml(e.reason)}</td>
        <td style="text-align:right" class="${e.delta >= 0 ? 'delta-plus' : 'delta-minus'}">${e.delta > 0 ? '+' : ''}${e.delta}</td>
        <td style="text-align:right; font-family: var(--f-mono)">${fmt(e.balance_after)}</td>
      </tr>
    `).join('');
  } catch (e) {
    body.innerHTML = `<tr><td colspan="4" style="color: var(--c-danger); padding: 12px">${escapeHtml(e.message)}</td></tr>`;
  }
}

function openTopupPay(pkgId) {
  const p = State.packages.find(x => x.id === pkgId);
  if (!p) return;
  openModal(`
    <h3>确认支付</h3>
    <p class="lead">${escapeHtml(p.name)} 档位 · ${fmt(p.total_credits)} 积分</p>
    <div class="pay-qr">
      <div class="qr-box">扫码占位</div>
      <div style="font-size: 13px; color: var(--c-mute)">微信 / 支付宝（占位）</div>
    </div>
    <div class="kv-row"><span>订单金额</span><b>¥${p.price_cny}</b></div>
    <div class="kv-row"><span>到账积分</span><b>${fmt(p.total_credits)}（含 ${p.bonus_credits} 赠送）</b></div>
    <div class="kv-row"><span>支付方式</span><b>微信 / 支付宝（mock）</b></div>
    <div class="pay-actions" style="margin-top: 12px">
      <button class="btn ghost" data-act="close">取消</button>
      <button class="btn success" data-act="mock">模拟支付成功</button>
    </div>
  `);
  $('[data-act="close"]').onclick = closeModal;
  $('[data-act="mock"]').onclick = async () => {
    try {
      const order = await api.checkout({ kind: 'topup', package_id: pkgId, amount_cny: p.price_cny, description: `充值 ${p.name}` });
      const r = await api.payMock(order.order_id);
      toast(`到账 ${r.affected.credits_added} 积分，余额 ${r.affected.new_balance}`, 'success');
      await refreshGlobal();
      closeModal();
      renderWallet();
    } catch (e) { toast('支付失败：' + e.message, 'error'); }
  };
}

// --------- 订阅 ---------

async function renderSubscribe() {
  const c = $('#content');
  if (!State.plans) State.plans = await api.fetchPlans();
  const plan = State.wallet?.subscription_plan || 'free';
  c.innerHTML = `
    <div class="page-h">
      <div>
        <h1>订阅</h1>
        <p>订阅期间内全部剧本免费 + 每月赠送积分 + 1v1 教练（Master）</p>
      </div>
    </div>

    <div class="period-toggle">
      <button data-period="monthly" class="${State.period === 'monthly' ? 'on' : ''}">月付</button>
      <button data-period="yearly"  class="${State.period === 'yearly'  ? 'on' : ''}">年付（更划算）</button>
    </div>

    <div class="plans">
      ${planCardHtml('pro', State.plans.pro)}
      ${planCardHtml('master', State.plans.master, true)}
    </div>

    <div class="section-h" style="margin-top: 32px">
      <h3>内嵌企业团购（ToB）</h3>
      <span class="meta">面向 HR / 行政，无需专门渠道</span>
    </div>
    <div class="card">
      <div class="card-title">团购规则</div>
      <ul style="list-style:none;padding:0;margin:6px 0 14px;display:flex;flex-direction:column;gap:6px;font-size:13.5px;color:var(--c-ink-soft)">
        <li>✓ 5 人 9 折 / 10 人 8 折 / 20 人 7 折</li>
        <li>✓ SC-08 商务英语日常 <strong>对全公司免费</strong></li>
        <li>✓ 一键邀请同事加入 · 自动识别企业域名</li>
      </ul>
      <div class="grid-2">
        <input id="gpDomain" placeholder="公司域名（如 acme.com）" style="padding:10px 14px;border:1px solid var(--c-line);border-radius:10px;font-size:13.5px;font-family:inherit">
        <div style="display:flex;gap:8px">
          <input id="gpCount" type="number" min="1" value="10" style="width:90px;padding:10px 14px;border:1px solid var(--c-line);border-radius:10px;font-size:13.5px;font-family:inherit">
          <button class="btn" id="gpBtn">发起团购</button>
        </div>
      </div>
      <div id="gpResult" style="margin-top:14px"></div>
    </div>
  `;

  $$('.period-toggle button', c).forEach(b => b.onclick = () => { State.period = b.dataset.period; renderSubscribe(); });
  $$('[data-act="sub"]', c).forEach(b => b.onclick = () => openSubscribePay(b.dataset.plan));
  $('#gpBtn').onclick = async () => {
    const domain = $('#gpDomain').value.trim();
    const head = Number($('#gpCount').value) || 1;
    if (!domain) return toast('请填写公司域名', 'warn');
    try {
      const r = await api.groupPurchase({ company_domain: domain, head_count: head, head_user_id: USER_ID });
      State.groupResult = r;
      $('#gpResult').innerHTML = `
        <div class="kv-row"><span>团购 ID</span><b style="font-family: var(--f-mono)">${r.group_id}</b></div>
        <div class="kv-row"><span>折扣</span><b>${Math.round(r.discount_rate * 100)}%</b></div>
        <div class="kv-row"><span>SC-08 全公司</span><b>${r.sc08_unlocked_company_wide ? '是' : '否'}</b></div>
        <div class="kv-row"><span>邀请链接</span><b style="font-size:12px;font-family:var(--f-mono);word-break:break-all">${r.invite_links.join('<br/>')}</b></div>
      `;
      toast('团购发起成功', 'success');
    } catch (e) { toast('团购失败：' + e.message, 'error'); }
  };
}

function planCardHtml(name, p, featured = false) {
  if (!p) return '';
  const period = State.period;
  const price = period === 'yearly' ? p.yearly_cny : p.monthly_cny;
  const per = period === 'yearly' ? '/ 年' : '/ 月';
  const feats = {
    pro: [
      '解锁全部 49 个剧本',
      '每月赠送 300 积分',
      '中文注解 + 英文表达 对照',
      '跨设备同步 · 无广告',
    ],
    master: [
      'Pro 全部权益',
      '每月赠送 800 积分',
      '1v1 真人+AI 混合教练：每月 2 次预约',
      '额外教练 ¥150/次 或 800 积分',
      '团购后全公司 SC-08 Free',
    ],
  };
  const isCurrent = (State.wallet?.subscription_plan || 'free') === name;
  return `
    <div class="plan-card ${featured ? 'featured' : ''}">
      ${featured ? '<div class="badge">推荐</div>' : ''}
      <div class="name">${name.toUpperCase()}</div>
      <div class="tagline">${name === 'pro' ? '职场人主力档' : '决策者 / 外贸 / 跨境 首选'}</div>
      <div class="price">¥${price}<small>${per}</small></div>
      <div style="font-size:12.5px;color:var(--c-mute)">每月赠送 ${p.monthly_credits} 积分</div>
      <ul>${feats[name].map(f => `<li>${f}</li>`).join('')}</ul>
      <button class="btn ${featured ? 'accent' : ''}" data-act="sub" data-plan="${name}">
        ${isCurrent ? '续费' : `选择 ${name.toUpperCase()}`}
      </button>
    </div>
  `;
}

function openSubscribePay(planName) {
  const p = State.plans[planName];
  const period = State.period;
  const price = period === 'yearly' ? p.yearly_cny : p.monthly_cny;
  openModal(`
    <h3>${planName.toUpperCase()} · ${period === 'yearly' ? '年付' : '月付'}</h3>
    <p class="lead">订阅期间全部剧本免费 + 每月赠送 ${p.monthly_credits} 积分</p>
    <div class="pay-qr">
      <div class="qr-box">扫码占位</div>
      <div style="font-size: 13px; color: var(--c-mute)">微信 / 支付宝（占位）</div>
    </div>
    <div class="kv-row"><span>订单金额</span><b>¥${price}</b></div>
    <div class="kv-row"><span>支付方式</span><b>微信 / 支付宝（mock）</b></div>
    <div class="pay-actions" style="margin-top:12px">
      <button class="btn ghost" data-act="close">取消</button>
      <button class="btn success" data-act="mock">模拟支付成功</button>
    </div>
  `);
  $('[data-act="close"]').onclick = closeModal;
  $('[data-act="mock"]').onclick = async () => {
    try {
      const order = await api.checkout({ kind: 'subscription', plan: planName, period, amount_cny: price, description: `${planName} ${period}` });
      const r = await api.payMock(order.order_id);
      toast(`${planName.toUpperCase()} ${period === 'yearly' ? '年付' : '月付'} 已激活 · ${r.affected.monthly_credits} 积分已发放`, 'success');
      await refreshGlobal();
      closeModal();
      renderSubscribe();
    } catch (e) { toast('支付失败：' + e.message, 'error'); }
  };
}

// --------- 1v1 教练 ---------

async function renderCoaching() {
  const c = $('#content');
  const plan = State.wallet?.subscription_plan || 'free';
  c.innerHTML = `
    <div class="page-h">
      <div>
        <h1>1v1 教练</h1>
        <p>真人 + AI 混合 · Master 会员每月 2 次预约</p>
      </div>
    </div>

    <div class="grid-3">
      <div class="coach-card">
        <div class="avatar">A</div>
        <div>
          <div class="name">Alice Wang</div>
          <div class="bio">前麦肯锡战略顾问，10 年出海品牌咨询经验</div>
          <div class="tags"><span class="chip">CMO 提案</span><span class="chip">战略沟通</span></div>
        </div>
      </div>
      <div class="coach-card">
        <div class="avatar">B</div>
        <div>
          <div class="name">Brian Liu</div>
          <div class="bio">前 Bluefocus 出海客户总监，海外媒体资源专家</div>
          <div class="tags"><span class="chip">KOL 议价</span><span class="chip">PR 危机</span></div>
        </div>
      </div>
      <div class="coach-card">
        <div class="avatar">C</div>
        <div>
          <div class="name">Cathy Zhang</div>
          <div class="bio">前阿里国际事业部，跨境电商谈判专家</div>
          <div class="tags"><span class="chip">外贸议价</span><span class="chip">CEO 汇报</span></div>
        </div>
      </div>
    </div>

    <div class="section-h" style="margin-top: 28px">
      <h3>可预约时段</h3>
      <span class="meta">${plan === 'master' ? '您本月已用 0 / 2 次' : '需要 Master 订阅'}</span>
    </div>

    ${plan !== 'master' ? `
      <div class="card" style="text-align:center;padding:40px 20px">
        <div style="font-family: var(--f-display); font-size: 48px; color: var(--c-accent)">♛</div>
        <div class="card-title" style="margin: 12px 0 6px">Master 会员专享</div>
        <div class="card-sub">升级到 Master 即可解锁 1v1 真人+AI 混合教练</div>
        <button class="btn accent" data-go="subscribe" style="margin-top: 12px">去升级</button>
      </div>
    ` : `
      <div class="card" style="padding: 0; overflow: hidden">
        <table class="slots-table" id="slotsTable">
          <thead><tr><th>日期</th><th>时间</th><th>教练</th><th>状态</th><th></th></tr></thead>
          <tbody><tr><td colspan="5" style="text-align:center;padding:20px;color:var(--c-mute)">加载时段中…</td></tr></tbody>
        </table>
      </div>
    `}
  `;
  $$('[data-go]', c).forEach(el => el.addEventListener('click', () => setTab(el.dataset.go)));
  if (plan === 'master') loadCoachSlots();
}

async function loadCoachSlots() {
  const tbody = $('#slotsTable tbody');
  if (!tbody) return;
  try {
    const slots = await api.coachSlots(2);
    State.coachSlots = slots;
    const byDay = {};
    slots.forEach(s => {
      const d = new Date(s.starts_at);
      const k = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
      (byDay[k] ||= []).push({ ...s, _d: d });
    });
    let html = '';
    Object.entries(byDay).forEach(([day, list]) => {
      html += `<tr class="day-row"><td colspan="5">${day}</td></tr>`;
      list.forEach(s => {
        const t = s._d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
        html += `
          <tr>
            <td></td>
            <td style="font-family: var(--f-mono)">${t}</td>
            <td>${escapeHtml(s.teacher_name)}</td>
            <td><span class="chip unlock">可预约</span></td>
            <td style="text-align:right"><button class="btn accent sm" data-slot="${s.slot_id}">预约</button></td>
          </tr>
        `;
      });
    });
    tbody.innerHTML = html;
    $$('button[data-slot]', tbody).forEach(b => b.onclick = () => bookSlot(b.dataset.slot));
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="color: var(--c-danger); padding: 12px">${escapeHtml(e.message)}</td></tr>`;
  }
}

async function bookSlot(slotId) {
  try {
    const r = await api.bookCoaching(slotId);
    if (r.fallback_to_ai) {
      toast(`预约 ${r.status} · 真人教练时段紧张，已自动降级为 AI 教练 + 异步 Coach Review`, 'warn');
    } else if (r.payment_required) {
      toast(`预约已提交 · 需额外支付 ${r.payment_amount} ${r.payment_currency}`, 'success');
    } else {
      toast(`预约已确认 (ID: ${r.booking_id})`, 'success');
    }
  } catch (e) { toast('预约失败：' + e.message, 'error'); }
}

// --------- 能力雷达图（Canvas） ---------

async function renderProgress() {
  const c = $('#content');
  try {
    State.history = await api.fetchHistory();
  } catch (e) {
    c.innerHTML = `<div class="card">加载历史失败：${escapeHtml(e.message)}</div>`;
    return;
  }
  const agg = State.history?.aggregate || { avg_dims: {}, avg_overall: 0, count: 0 };
  const dims = agg.avg_dims || {};
  const items = State.history?.items || [];

  c.innerHTML = `
    <div class="page-h">
      <div>
        <h1>能力雷达图 · 学习进度</h1>
        <p>${agg.count} 场对话 · 综合均分 ${agg.avg_overall}/10</p>
      </div>
    </div>

    <div class="radar-wrap">
      <canvas id="radarCanvas" width="320" height="320"></canvas>
      <div>
        <div class="card" style="margin-bottom:14px">
          <div class="card-title">5 维度均值</div>
          <div class="dim-tags" style="margin-top: 10px">
            ${DIM_ORDER.map(k => `
              <span class="chip">${DIM_LABELS[k]} · ${dims[k] || 0}/10</span>
            `).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-title">建议</div>
          <div style="font-size: 13.5px; color: var(--c-ink-soft); line-height: 1.7">
            ${suggestText(dims)}
          </div>
        </div>
      </div>
    </div>

    <div class="section-h" style="margin-top: 28px">
      <h3>最近对话</h3>
    </div>
    ${items.length ? `
      <div class="card" style="padding:0; overflow:hidden">
        <table class="slots-table">
          <thead><tr><th>时间</th><th>剧本</th><th style="text-align:right">均分</th><th>维度</th></tr></thead>
          <tbody>
            ${items.slice().reverse().slice(0, 10).map(it => `
              <tr>
                <td style="font-family: var(--f-mono); font-size: 12.5px">${(it.ts||'').slice(0,16).replace('T',' ')}</td>
                <td>${escapeHtml(it.script_id)}</td>
                <td style="text-align:right; font-family: var(--f-mono); font-weight:600; color: var(--c-accent)">${(it.overall_score||0).toFixed(1)}</td>
                <td style="font-size:12px; color:var(--c-mute)">
                  G:${it.dims?.grammar?.score||0} V:${it.dims?.vocabulary?.score||0} B:${it.dims?.business?.score||0} C:${it.dims?.cross_cultural?.score||0}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `
      <div class="card" style="text-align:center; padding: 40px 20px">
        <div style="font-size: 40px">📈</div>
        <div class="card-title" style="margin: 12px 0 6px">还没有对话记录</div>
        <div class="card-sub">完成一场对话后，这里会显示你的能力雷达和历史曲线</div>
        <div style="margin-top:14px"><button class="btn accent" data-go="scripts">开始第一场对话 →</button></div>
      </div>
    `}
  `;
  $$('[data-go]', c).forEach(el => el.addEventListener('click', () => setTab(el.dataset.go)));
  drawRadar(dims);
}

function suggestText(dims) {
  if (!dims || Object.values(dims).every(v => !v)) return '完成更多对话后，这里会基于你的薄弱维度给出针对性建议。';
  const weak = Object.entries(dims).filter(([_, v]) => v && v < 7).map(([k]) => DIM_LABELS[k]);
  const strong = Object.entries(dims).filter(([_, v]) => v && v >= 8).map(([k]) => DIM_LABELS[k]);
  const lines = [];
  if (strong.length) lines.push(`✅ 你的 <b>${strong.join('、')}</b> 已经达到 8 分以上，可以挑战更高难度的剧本。`);
  if (weak.length) lines.push(`📌 建议重点练习：<b>${weak.join('、')}</b>（&lt;7 分），从 SC-08 中相关剧本入手。`);
  if (!lines.length) lines.push('👍 四个维度都在中等水平，保持每周 3-5 场对话即可稳步提升。');
  return lines.join('<br/>');
}

function drawRadar(dims, canvasId) {
  const cv = $(canvasId ? `#${canvasId}` : '#radarCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) * 0.42;
  const keys = DIM_ORDER;
  const labels = keys.map(k => DIM_LABELS[k]);
  const values = keys.map(k => (dims[k] || 0));
  const N = keys.length;

  // 网格
  ctx.strokeStyle = '#E7E9EE';
  ctx.lineWidth = 1;
  for (let r = 1; r <= 5; r++) {
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const ang = (Math.PI * 2 * i / N) - Math.PI / 2;
      const x = cx + Math.cos(ang) * R * r / 5;
      const y = cy + Math.sin(ang) * R * r / 5;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  // 轴线
  ctx.strokeStyle = '#F0F2F6';
  for (let i = 0; i < N; i++) {
    const ang = (Math.PI * 2 * i / N) - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    ctx.stroke();
  }
  // 数据多边形
  ctx.fillStyle = 'rgba(231,106,44,0.20)';
  ctx.strokeStyle = '#E76A2C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const ang = (Math.PI * 2 * i / N) - Math.PI / 2;
    const v = Math.max(0, Math.min(10, values[i])) / 10;
    const x = cx + Math.cos(ang) * R * v;
    const y = cy + Math.sin(ang) * R * v;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 标签
  ctx.fillStyle = '#0E1729';
  ctx.font = '600 13px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < N; i++) {
    const ang = (Math.PI * 2 * i / N) - Math.PI / 2;
    const x = cx + Math.cos(ang) * (R + 18);
    const y = cy + Math.sin(ang) * (R + 18) + 4;
    ctx.fillText(labels[i], x, y);
    // 分数
    ctx.fillStyle = '#E76A2C';
    ctx.font = '700 12px JetBrains Mono, monospace';
    ctx.fillText(`${values[i].toFixed(1)}`, x, y + 16);
    ctx.fillStyle = '#0E1729';
    ctx.font = '600 13px Inter, sans-serif';
  }
}

// --------- Onboarding 用户画像 ---------

const ROLES = [
  { id: '出海品牌总监', label: '出海品牌总监' },
  { id: '海外营销经理', label: '海外营销经理' },
  { id: '媒介采购/PR', label: '媒介采购 / PR' },
  { id: '4A 广告 AE', label: '4A 广告 AE' },
  { id: '外贸销售经理', label: '外贸销售经理' },
  { id: 'B2B CEO/决策者', label: 'B2B CEO / 决策者' },
  { id: '求职面试者', label: '求职面试者' },
  { id: '通用职场人', label: '通用职场人' },
];
const MARKETS = [
  { id: '北美', label: '🇺🇸 北美' },
  { id: '欧洲', label: '🇪🇺 欧洲' },
  { id: '日本', label: '🇯🇵 日本' },
  { id: '东南亚', label: '🇸🇬 东南亚' },
  { id: '中东', label: '🇦🇪 中东' },
  { id: '全球通用', label: '🌍 全球通用' },
];
const LEVELS = [
  { id: 'beginner', label: '初中级', desc: '能写简单邮件，会议听懂 60%' },
  { id: 'intermediate', label: '中级', desc: '能开会，但表达不够商务' },
  { id: 'advanced', label: '高级', desc: '流利商务沟通，需要打磨细节' },
];

function openOnboarding() {
  const profile = State.profile || {};
  let step = 0;
  const answers = {
    role: profile.role || null,
    target_market: profile.target_market || null,
    english_level: profile.english_level || null,
  };
  const stepMeta = [
    { key: 'role',         title: '你的岗位是什么？', subtitle: '我们会按岗位推荐剧本和场景', opts: ROLES },
    { key: 'target_market',title: '目标市场是哪？',   subtitle: '不同市场的客户沟通风格差异很大', opts: MARKETS },
    { key: 'english_level',title: '你的英语水平？',   subtitle: '决定注解 / 朗读 / 评分粒度', opts: LEVELS },
  ];

  const render = () => {
    const m = stepMeta[step];
    const opts = m.opts;
    openModal(`
      <div class="onboarding-overlay" id="onbOverlay">
        <div class="onboarding-card">
          <div class="step-label">Step ${step + 1} / 3</div>
          <h3>${m.title}</h3>
          <div style="color:var(--c-mute); font-size: 13.5px; margin-bottom: 6px">${m.subtitle}</div>
          <div class="option-grid" id="optGrid">
            ${opts.map(o => `
              <div class="option-card ${answers[m.key] === o.id ? 'selected' : ''}" data-opt="${o.id}">
                <div>${o.label}</div>
                ${o.desc ? `<div style="font-size:11px;color:var(--c-mute);margin-top:4px">${o.desc}</div>` : ''}
              </div>
            `).join('')}
          </div>
          <div class="onboarding-actions">
            ${step > 0 ? '<button class="btn ghost" id="onbBack">← 上一步</button>' : '<button class="btn ghost" id="onbSkip">跳过</button>'}
            <button class="btn accent" id="onbNext" ${answers[m.key] ? '' : 'disabled'}>${step < 2 ? '下一步 →' : '完成 ✓'}</button>
          </div>
        </div>
      </div>
    `);
    $$('.option-card').forEach(card => card.onclick = () => {
      $$('.option-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      answers[m.key] = card.dataset.opt;
      $('#onbNext').disabled = false;
    });
    const back = $('#onbBack'); if (back) back.onclick = () => { step--; render(); };
    const skip = $('#onbSkip'); if (skip) skip.onclick = () => closeModal();
    $('#onbNext').onclick = async () => {
      if (step < 2) { step++; render(); return; }
      // 提交
      try {
        await api.saveProfile(answers);
        State.profile = await api.fetchProfile();
        toast('画像设置完成，为你推荐首个剧本', 'success');
        closeModal();
        // P0: Onboarding → 首次对话桥接：自动推荐 + 一键开始
        try {
          const reco = await api.fetchRecommendedToday();
          if (reco && reco.items && reco.items.length) {
            const first = reco.items[0];
            renderOnboardingFirstScript(first.script_id, first.reason);
            return;
          }
        } catch {}
        setTab('home');
      } catch (e) {
        toast('保存失败：' + e.message, 'error');
      }
    };
  };
  render();
}

// --------- P0: Onboarding → 首次对话桥接 ---------

async function renderOnboardingFirstScript(scriptId, reason) {
  const s = State.scripts.find(x => x.id === scriptId);
  if (!s) { setTab('home'); return; }
  // 拉取该剧本可选角色
  let characters = [];
  try { characters = await api.fetchCharactersFor(scriptId); } catch {}
  const roleLabel = State.profile?.role ? ROLES.find(r => r.id === State.profile.role)?.label || State.profile.role : '';
  const marketLabel = State.profile?.target_market ? MARKETS.find(m => m.id === State.profile.target_market)?.label || State.profile.target_market : '';
  openModal(`
    <div style="text-align:center; padding: 8px 0">
      <div style="font-size:56px; line-height:1; margin-bottom:12px">🎉</div>
      <h3 style="margin-bottom:4px">画像设置完成！</h3>
      <p class="lead" style="margin-bottom:18px">
        ${roleLabel ? `为你定制了<span style="color:var(--c-accent);font-weight:600">${escapeHtml(roleLabel)}</span>` : ''}
        ${marketLabel ? `×<span style="color:var(--c-accent);font-weight:600">${escapeHtml(marketLabel)}</span>` : ''}
        的训练路径
      </p>
      <div class="card" style="text-align:left; margin-bottom:18px; border:1.5px solid var(--c-accent)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span style="background:var(--c-accent);color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">推荐首发</span>
          <span style="font-size:15px;font-weight:600">${escapeHtml(s.title)}</span>
          <span style="font-size:11px;color:var(--c-mute)">${s.difficulty === 'adv' ? '高级' : s.difficulty === 'mid' ? '中级' : '入门'}</span>
        </div>
        <div style="font-size:13px;color:var(--c-mute);line-height:1.5">${escapeHtml(s.scenario || '')}</div>
        ${reason ? `<div style="margin-top:10px;font-size:12.5px;color:var(--c-accent);background:rgba(74,137,222,0.08);padding:8px 10px;border-radius:6px">💡 ${escapeHtml(reason)}</div>` : ''}
      </div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn ghost" id="onbLater">稍后再说</button>
        <button class="btn accent" id="onbStart">🚀 开始首次对话</button>
      </div>
    </div>
  `);
  $('#onbLater').onclick = () => { closeModal(); setTab('home'); };
  $('#onbStart').onclick = () => {
    closeModal();
    openCharacterPicker(s, characters);
  };
}

// --------- 启动 ---------

async function init() {
  $('#announceClose').onclick = () => $('#announce').remove();
  $$('.navlink').forEach(a => a.addEventListener('click', (e) => {
    e.preventDefault();
    setTab(a.dataset.tab);
  }));
  $('#btnReset').onclick = async () => {
    if (!confirm('确定重置 demo 状态？将清空积分、订阅、解锁、话术本、历史记录。')) return;
    try { await api.reset(); toast('已重置', 'success'); } catch {}
    await refreshGlobal();
    setTab('home');
  };
  const switcher = $('#userSwitch');
  if (switcher) switcher.onclick = () => {
    const next = IS_ADMIN ? 'demo_user_001' : 'demo_admin_001';
    api.setUser(next);
    location.search = '?user=' + encodeURIComponent(next);
  };
  $('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  // i18n 语言切换
  const langRow = $('#langRow');
  if (langRow) langRow.onclick = () => {
    const next = LANG === 'zh-CN' ? 'en-US' : 'zh-CN';
    setLang(next);
  };

  await refreshGlobal();
  // 应用 i18n
  setLang(LANG);
  // 拉一次话术本 / 历史，避免每次都懒加载
  try { State.phrasebook = await api.fetchPhrasebook(); } catch {}
  try { State.history = await api.fetchHistory(); } catch {}
  // v2.1
  try { State.streak = await api.fetchStreak(); } catch {}
  try { State.weekly = await api.fetchWeekly(false); } catch {}
  try { State.inbox = await api.fetchInbox(); } catch {}
  try { State.recommendedToday = await api.fetchRecommendedToday(); } catch {}
  try { State.writingPractice = await api.fetchWritingPractice(); } catch {}
  // v4.0 SRS + AI 生成
  try { State.srs = await api.fetchSRSReviews(); } catch(e) { console.warn('SRS fetch fail', e); }
  try { State.generatedScripts = await api.fetchGeneratedScripts(); } catch(e) { console.warn('generated fetch fail', e); }
  // v4.0 定级测评结果
  try { State.placementResult = JSON.parse(localStorage.getItem('bc_placement') || 'null'); } catch(e) {}
  // v4.0 错题库统计
  await refreshMistakeStats();
  // 更新 SRS badge
  try {
    const br = $('#badgeReviews');
    if (br && State.srs?.today?.length !== undefined) br.textContent = State.srs.today.length;
  } catch(e) {}
  try {
    const tv = await api.fetchTtsVoices();
    State.ttsVoices = tv.voices || [];
    if (!State.ttsVoice && State.ttsVoices.length) {
      State.ttsVoice = State.ttsVoices[0].id;
      localStorage.setItem(TTS_KEY, State.ttsVoice);
    }
  } catch {}
  // 徽章解锁提示
  if (State.streak && State.streak.badges && State.streak.badges.length) {
    const seen = JSON.parse(localStorage.getItem(STORAGE_BADGES) || '[]');
    const newOnes = State.streak.badges.filter(b => !seen.includes(b));
    if (newOnes.length) {
      setTimeout(() => {
        const labels = newOnes.map(b => ({
          'first-step': '🎯 完成第一次对话',
          '7day-warrior': '🔥 连续 7 天练习',
          '14day-grinder': '⚡ 连续 14 天练习',
          '30day-master': '👑 连续 30 天练习',
          '100-takes': '💯 累计 100 场对话',
        }[b] || b));
        toast(`🏅 解锁徽章：${labels.join(' / ')}`, 'success');
        localStorage.setItem(STORAGE_BADGES, JSON.stringify([...seen, ...newOnes]));
      }, 1200);
    }
  }

  // Onboarding：首次进入未设置画像则提示（非 admin）
  if (!IS_ADMIN && !State.profile?.role) {
    setTimeout(() => openOnboarding(), 600);
  }

  const initial = (location.hash || '#home').slice(1);
  setTab(Tabs.includes(initial) ? initial : 'home');
}

// 注册 PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      console.log('PWA: Service Worker registered', reg.scope);
    }).catch((err) => {
      console.warn('PWA: Service Worker registration failed', err);
    });
  });
}

init();