// ============ 银洲汇合信息供需平台 H5 · 主入口 ============
let currentRoute = '';
let state = {
  posts: [], convs: [], currentConv: null, currentMessages: [],
  currentPost: null, tab: 'home', currentUser: null,
  postsFilter: { type: 'all', location: '', q: '' },
  appConfig: {},
  publishType: 'supply', publishImages: [],
  riskWarned: localStorage.getItem('riskWarned') === '1',
};

// ---------- 路由 ----------
function hashRoute() {
  const h = location.hash.slice(1) || '/home';
  if (h === currentRoute) return;
  currentRoute = h;
  const token = getToken();
  const firstSeg = '/' + h.split('/')[1];
  const authRequired = ['/publish', '/messages', '/profile', '/chat', '/mine-posts', '/favorites', '/coupons', '/invite', '/inspection', '/packages', '/orders', '/admin'];
  if (!token && authRequired.includes(firstSeg)) { location.hash = '#/login'; return; }
  if (token && h === '/login') { location.hash = '#/home'; return; }
  renderPage(h);
}

window.addEventListener('hashchange', hashRoute);

// ---------- 页面渲染 ----------
function renderPage(hash) {
  const app = document.getElementById('app');
  const parts = hash.split('/').filter(Boolean);
  if (!parts.length) { renderHome(); return; }

  if (parts[0] === 'chat' && parts[1]) { renderChat(parts[1]); return; }
  if (parts[0] === 'post' && parts[1]) { renderDetail(parts[1]); return; }

  state.tab = parts[0];
  const pages = {
    home: renderHome,
    messages: renderMessages,
    publish: renderPublish,
    profile: renderProfile,
    login: renderLogin,
    'mine-posts': renderMinePosts,
    favorites: renderFavorites,
    coupons: renderCoupons,
    invite: renderInvite,
    inspection: renderInspection,
    packages: renderPackages,
    orders: renderOrders,
    admin: renderAdmin,
  };
  (pages[parts[0]] || renderHome)();
}

// ---------- 顶部栏 ----------
function topBar(title, opts = {}) {
  const back = opts.back ? `<div class="back" onclick="history.back()">←</div>` : '';
  const sub = opts.sub ? `<div class="sub">${opts.sub}</div>` : '';
  return `
    <div class="top-bar">
      ${back}
      ${opts.logo !== false ? '<img class="logo" src="/logo.svg" alt="logo" />' : ''}
      <div style="flex:1">
        <div class="title">${title}</div>
        ${sub}
      </div>
      ${opts.right || ''}
    </div>
  `;
}

// ---------- 底部 TabBar ----------
function tabbar() {
  const token = getToken();
  return `
    <div class="tabbar">
      <div class="item ${state.tab === 'home' ? 'active' : ''}" onclick="location.hash='#/home'">
        <span class="ic">🏠</span><span>供需广场</span>
      </div>
      <div class="item ${state.tab === 'messages' ? 'active' : ''}" onclick="${token ? "location.hash='#/messages'" : "location.hash='#/login'"}">
        <span class="ic">💬</span><span>消息</span>
      </div>
      <div class="item ${state.tab === 'publish' ? 'active' : ''} publish" onclick="${token ? "location.hash='#/publish'" : "location.hash='#/login'"}">
        <div class="fab">＋</div><span class="ic" style="visibility:hidden">＋</span><span>发布</span>
      </div>
      <div class="item ${state.tab === 'profile' ? 'active' : ''}" onclick="${token ? "location.hash='#/profile'" : "location.hash='#/login'"}">
        <span class="ic">👤</span><span>我的</span>
      </div>
    </div>
  `;
}

function floatingCs() {
  return `<div class="fab-cs" onclick="openCsChat()">💬</div>`;
}

// ---------- 协议弹窗 ----------
async function showAgreementIfNeeded() {
  if (localStorage.getItem('agreed') === '1') return true;
  const cfg = state.appConfig;
  const ok = await modal({
    title: '用户协议与隐私政策',
    html: `
      <div style="max-height:45vh;overflow:auto;text-align:left;line-height:1.7;font-size:14px;background:#fafafa;padding:12px;border-radius:10px;">
        <p><b>用户协议</b></p>
        <p>${esc(cfg.userAgreement || '请遵守法律法规，发布真实信息。')}</p>
        <p><b>隐私政策</b></p>
        <p>${esc(cfg.privacyPolicy || '我们仅收集必要的登录信息。')}</p>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-top:10px;">点击同意即表示您已阅读并同意上述协议和政策。</p>
    `,
    okText: '同意',
    cancelText: '不同意',
  });
  if (ok) {
    localStorage.setItem('agreed', '1');
    const cb = document.getElementById('loginAgree');
    if (cb) cb.checked = true;
    return true;
  }
  return false;
}

// ---------- 首页 ----------
async function renderHome() {
  const app = document.getElementById('app');
  app.innerHTML = topBar('银洲汇合信息供需平台', { sub: '只做信息对接，不碰交易' }) + `
    <div class="page">
      <div class="search-bar">
        <input id="searchInput" placeholder="搜索货源、求购信息" />
        <button onclick="doSearch()" class="btn btn-ghost" style="padding:6px 14px;margin-left:-4px;">🔍</button>
      </div>
      <div class="tabs">
        <div class="tab ${state.postsFilter.type==='all'?'active':''}" onclick="setType('all')">全部</div>
        <div class="tab ${state.postsFilter.type==='supply'?'active':''}" onclick="setType('supply')">供应</div>
        <div class="tab ${state.postsFilter.type==='demand'?'active':''}" onclick="setType('demand')">求购</div>
        <div class="tab ${state.postsFilter.location==='新会'?'active':''}" onclick="setLocation('新会')">新会</div>
      </div>
      <div id="postList"></div>
    </div>
  ` + tabbar() + floatingCs();
  const searchInput = document.getElementById('searchInput');
  searchInput.value = state.postsFilter.q || '';
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  await loadAndRenderPosts();
}

async function loadAndRenderPosts() {
  const list = await api.list(state.postsFilter);
  const el = document.getElementById('postList');
  if (!el) return;
  if (!list.length) { el.innerHTML = `<div class="empty"><div class="ic">📭</div>暂无帖子</div>`; return; }
  el.innerHTML = `<div class="post-list">` + list.map(p => {
    const icon = p.type === 'supply' ? '📦' : '🛒';
    const topBadge = p.isTop ? '<span class="top-badge">置顶</span>' : '';
    const realBadge = p.publisherRealMerchant ? '<span class="real-badge">真实商家</span>' : '';
    return `
      <div class="post-card" onclick="location.hash='#/post/${p.id}'">
        <div class="thumb">${p.images?.[0] ? `<img src="${p.images[0]}" />` : icon}</div>
        <div class="info">
          <div class="pt">${topBadge}${esc(p.title)}</div>
          <div class="tags">
            <span class="tag ${p.type}">${p.type === 'supply' ? '供应' : '求购'}</span>
            <span class="tag cat">${esc(p.category || '其他')}</span>
            ${realBadge}
          </div>
          <div class="meta">
            <span>📍 ${esc(p.location)}</span>
            <span>${timeAgo(p.createdAt)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('') + `</div>`;
}

window.setType = (t) => { state.postsFilter.type = t; renderHome(); };
window.setLocation = (l) => { state.postsFilter.location = state.postsFilter.location === l ? '' : l; renderHome(); };
window.doSearch = () => {
  state.postsFilter.q = document.getElementById('searchInput').value.trim();
  loadAndRenderPosts();
};

// ---------- 详情页 ----------
async function renderDetail(id) {
  const app = document.getElementById('app');
  app.innerHTML = topBar('详情', { back: true }) + `<div class="page"><div class="empty">加载中...</div></div>`;
  const post = await api.get(id).catch(e => { toast(e.message); return null; });
  if (!post) return;
  state.currentPost = post;
  const user = getUser();
  const icon = post.type === 'supply' ? '📦' : '🛒';
  const isOwner = user && post.userId === user.id;
  const canTop = isOwner && post.status === 'approved';

  app.innerHTML = topBar('详情', { back: true }) + `
    <div class="page" style="padding-bottom:80px;">
      <div class="detail-top">
        <div class="gallery">
          ${post.images?.length ? `<img src="${post.images[0]}" />` : icon}
        </div>
        ${post.isTop ? '<div class="top-float">置顶中</div>' : ''}
      </div>
      <div class="detail-content">
        <div class="title">${esc(post.title)}</div>
        <div class="meta-row">
          <span class="tag ${post.type}">${post.type === 'supply' ? '供应' : '求购'}</span>
          <span style="color:var(--muted);font-size:13px">📍 ${esc(post.location)}</span>
          <span style="color:var(--muted);font-size:13px">🕐 ${formatTime(post.createdAt)}</span>
        </div>
        <div class="desc">${esc(post.description)}</div>
      </div>
      <div class="publisher-card">
        <div class="avatar">${esc((post.publisher?.nickname || post.contactName || '?').charAt(0))}</div>
        <div style="flex:1">
          <div style="font-weight:600;display:flex;align-items:center">
            ${esc(post.publisher?.nickname || post.contactName)}
            ${post.publisherVerified ? '<span class="verified-badge">认证商家</span>' : ''}
            ${post.publisher?.isRealMerchant ? '<span class="real-badge small">真实商家</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--muted)">发布者 · 浏览 ${post.views}</div>
        </div>
      </div>
    </div>
    <div class="fixed-bottom">
      <button class="btn btn-ghost" onclick="toggleFav('${post.id}', this)" style="flex:0 0 auto;">${post.favorited ? '⭐' : '☆'}</button>
      <button class="btn btn-ghost" onclick="reportPost('${post.id}')">举报</button>
      ${isOwner ? `<button class="btn btn-ghost" onclick="openTopModal('${post.id}')">置顶</button>` : ''}
      <button class="btn btn-primary" onclick="startChat()">发私信</button>
    </div>
  ` + floatingCs();
}

window.toggleFav = async (id, btn) => {
  if (!getToken()) { location.hash = '#/login'; return; }
  const r = await api.favorite(id);
  btn.textContent = r.favorited ? '⭐' : '☆';
  toast(r.favorited ? '已收藏' : '已取消');
};

window.reportPost = async (id) => {
  if (!getToken()) { location.hash = '#/login'; return; }
  const reason = prompt('请输入举报原因：');
  if (!reason) return;
  await api.reportPost(id, reason);
  toast('已提交举报');
};

window.startChat = async () => {
  if (!getToken()) { location.hash = '#/login'; return; }
  const post = state.currentPost;
  const user = getUser();
  if (!post?.userId) { toast('无法发送私信'); return; }
  if (post.userId === user?.id) { toast('这是你自己发的帖子'); return; }
  if (!state.riskWarned) {
    const ok = await modal({
      title: '交易风险提示',
      html: `
        <div style="text-align:left;line-height:1.7;font-size:14px;">
          <p>本平台仅提供信息展示与沟通工具，不介入任何资金交易。</p>
          <p>线下交易前请核实对方身份、查验货物，警惕预付定金、虚假链接等诈骗行为。</p>
        </div>
      `,
      okText: '我已知晓',
      cancelText: '取消',
    });
    if (!ok) return;
    state.riskWarned = true;
    localStorage.setItem('riskWarned', '1');
  }
  const conv = await api.createConv(post.userId);
  location.hash = '#/chat/' + conv.id;
};

window.openCsChat = async () => {
  if (!getToken()) { location.hash = '#/login'; return; }
  const csUid = state.appConfig.csUid || 'u_cs';
  if (!state.riskWarned) {
    const ok = await modal({
      title: '交易风险提示',
      html: `<div style="text-align:left;line-height:1.7;font-size:14px;"><p>本平台仅做信息对接，不担保交易安全。请警惕诈骗。</p></div>`,
      okText: '我已知晓',
      cancelText: '取消',
    });
    if (!ok) return;
    state.riskWarned = true;
    localStorage.setItem('riskWarned', '1');
  }
  const conv = await api.createConv(csUid);
  location.hash = '#/chat/' + conv.id;
};

// ---------- 置顶弹窗 ----------
window.openTopModal = async (postId) => {
  const [coupons, user] = await Promise.all([api.coupons().catch(() => []), api.me().catch(() => getUser())]);
  const now = Date.now();
  const validCoupons = coupons.filter(c => !c.expireAt || c.expireAt > now);
  const hasMerchant = user?.isRealMerchant;
  const usedToday = user?.dailyFreeTopUsedAt && dayStart(user.dailyFreeTopUsedAt) === dayStart(now);

  const couponOptions = validCoupons.map((c, i) =>
    `<div class="top-option" onclick="chooseTop('${postId}', 'coupon', '${c.id}')">
      <div class="opt-title">B：使用置顶券置顶7天</div>
      <div class="opt-desc">券 ${i + 1} · 7天 · ${c.expireAt ? '有效期至 ' + formatTime(c.expireAt) : '无期限'}</div>
    </div>`
  ).join('');

  const merchantOption = hasMerchant && !usedToday ? `
    <div class="top-option" onclick="chooseTop('${postId}', 'merchant')">
      <div class="opt-title">C：真实商家每日免费置顶</div>
      <div class="opt-desc">今日剩余 1 次 · 0点重置</div>
    </div>
  ` : '';

  await modal({
    title: '选择置顶方式',
    html: `
      <div class="top-options">
        <div class="top-option" onclick="chooseTop('${postId}', 'normal')">
          <div class="opt-title">A：不置顶，普通发布</div>
          <div class="opt-desc">已上架展示，无需审核</div>
        </div>
        ${couponOptions}
        ${merchantOption}
      </div>
    `,
    noOk: true,
  });
};

window.chooseTop = async (postId, mode, couponId) => {
  closeModal();
  try {
    await api.top(postId, { mode, couponId });
    toast(mode === 'normal' ? '已设置为普通展示' : '置顶操作成功');
    location.hash = '#/mine-posts';
  } catch (e) {
    closeModal();
    toast(e.message);
  }
};

// ---------- 发布页 ----------
function renderPublish() {
  const app = document.getElementById('app');
  app.innerHTML = topBar('发布信息', { sub: '提交后自动敏感词校验' }) + `
    <div class="page">
      <div class="publish-body">
        <div class="switch-row">
          <div class="switch-item active" onclick="switchType(this,'supply')">供应</div>
          <div class="switch-item" onclick="switchType(this,'demand')">求购</div>
        </div>
        <div class="form-card">
          <div class="form-label">标题 <span style="color:#EF4444">*</span></div>
          <input class="form-input" id="pTitle" maxlength="80" placeholder="优质现货供应 / 求购信息发布" />
        </div>
        <div class="form-card">
          <div class="form-label">详细描述 <span style="color:#EF4444">*</span></div>
          <textarea class="form-input form-textarea" id="pDesc" maxlength="2000" placeholder="干仓储存，陈香明显，具体规格可私信沟通。"></textarea>
        </div>
        <div class="form-card">
          <div class="form-label">图片（最多4张）</div>
          <div class="img-grid" id="imgGrid">
            <div class="img-item add" onclick="document.getElementById('pImages').click()">＋</div>
          </div>
          <input type="file" id="pImages" multiple accept="image/*" style="display:none" onchange="handleImageUpload(this)" />
        </div>
        <div class="form-card">
          <div class="form-label">地区</div>
          <input class="form-input" id="pLoc" maxlength="20" placeholder="如：新会 / 江门" />
        </div>
        <div class="form-card">
          <div class="form-label">分类 / 价格（选填）</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <input class="form-input" id="pCat" placeholder="分类：大红皮 / 二红皮…" />
            <input class="form-input" id="pPrice" placeholder="价格：如 1280/斤" />
          </div>
        </div>
        <div class="btn btn-primary" onclick="submitPost()" style="margin-top:20px;padding:14px;font-size:16px">提交发布</div>
      </div>
    </div>
  ` + tabbar();
  state.publishType = 'supply';
  state.publishImages = [];
}

window.switchType = (el, t) => {
  document.querySelectorAll('.switch-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  state.publishType = t;
};

window.handleImageUpload = async (input) => {
  const files = Array.from(input.files);
  if (!files.length) return;
  toast('上传中...');
  try {
    const urls = await api.uploadImages(files);
    state.publishImages = [...(state.publishImages || []), ...urls].slice(0, 4);
    renderImgGrid();
    toast('上传成功');
  } catch (e) { toast(e.message); }
  input.value = '';
};

function renderImgGrid() {
  const grid = document.getElementById('imgGrid');
  if (!grid) return;
  grid.innerHTML = (state.publishImages || []).map((u, i) => `
    <div class="img-item"><img src="${u}" /><div class="del" onclick="removeImg(${i})">×</div></div>
  `).join('') + `<div class="img-item add" onclick="document.getElementById('pImages').click()">＋</div>`;
}

window.removeImg = (i) => { state.publishImages.splice(i, 1); renderImgGrid(); };

window.submitPost = async () => {
  const title = document.getElementById('pTitle').value.trim();
  const desc = document.getElementById('pDesc').value.trim();
  if (!title || !desc) { toast('标题和描述必填'); return; }
  try {
    const post = await api.create({
      type: state.publishType, title, description: desc,
      images: state.publishImages || [],
      category: document.getElementById('pCat').value.trim(),
      location: document.getElementById('pLoc').value.trim(),
      price: document.getElementById('pPrice').value.trim(),
    });
    toast('发布成功');
    // 发布后弹出置顶选择
    setTimeout(() => openTopModal(post.id), 300);
  } catch (e) {
    closeModal();
    toast(e.message);
  }
};

// ---------- 消息列表 ----------
async function renderMessages() {
  const app = document.getElementById('app');
  app.innerHTML = topBar('消息') + `<div class="page"><div class="empty">加载中...</div></div>` + tabbar();
  const convs = await api.listConvs().catch(e => { toast(e.message); return []; });
  state.convs = convs;
  if (!convs.length) {
    document.getElementById('app').innerHTML = topBar('消息') + `<div class="page"><div class="empty"><div class="ic">💬</div>暂无消息</div></div>` + tabbar();
    return;
  }
  const listHtml = convs.map(c => {
    const otherName = c.otherUser?.nickname || '用户';
    const otherAvatar = (otherName.charAt(0)).toUpperCase();
    return `
      <div class="msg-item" onclick="location.hash='#/chat/${c.id}'">
        <div class="avatar" style="width:48px;height:48px;font-size:18px">${otherAvatar}</div>
        <div class="info">
          <div class="row1">
            <span class="name">${esc(otherName)}</span>
            <span class="time">${timeAgo(c.lastMessageAt)}</span>
          </div>
          <div class="preview">${esc(c.lastMessage || '开始对话吧～')}</div>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('app').innerHTML = topBar('消息') + `<div class="page"><div class="msg-list">${listHtml}</div></div>` + tabbar();
}

// ---------- 聊天页 ----------
async function renderChat(convId) {
  const conv = await api.listConvs().then(list => list.find(c => c.id === convId)).catch(() => null);
  if (!conv) { location.hash = '#/messages'; return; }
  state.currentConv = conv;
  const otherName = conv.otherUser?.nickname || '对方';
  const app = document.getElementById('app');
  app.innerHTML = topBar(otherName, { back: true, logo: false }) + `
    <div class="chat-body" id="chatBody"></div>
    <div class="chat-input">
      <input id="chatInput" placeholder="输入消息..." />
      <button onclick="sendChatMsg()">发送</button>
    </div>
  `;
  const history = await api.listMessages(convId);
  renderChatMessages(history);
  joinConv(convId);
  onChat(convId, onIncomingMsg);
  document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMsg(); });
}

function renderChatMessages(list) {
  const body = document.getElementById('chatBody');
  if (!body) return;
  const uid = getUser()?.id;
  body.innerHTML = list.map(m => {
    const self = m.senderId === uid;
    return `<div class="chat-msg ${self ? 'self' : 'other'}">${self ? '' : `<div class="sn">对方</div>`}${esc(m.content)}</div>`;
  }).join('');
  body.scrollTop = body.scrollHeight;
}

function onIncomingMsg(msg) {
  if (msg.conversationId !== state.currentConv?.id) return;
  const body = document.getElementById('chatBody');
  if (!body) return;
  const uid = getUser()?.id;
  const self = msg.senderId === uid;
  body.insertAdjacentHTML('beforeend', `<div class="chat-msg ${self ? 'self' : 'other'}">${self ? '' : '<div class="sn">对方</div>'}${esc(msg.content)}</div>`);
  body.scrollTop = body.scrollHeight;
}

window.sendChatMsg = () => {
  const input = document.getElementById('chatInput');
  const content = input.value.trim();
  if (!content) return;
  sendChat(state.currentConv.id, content);
  input.value = '';
};

// ---------- 我的页面 ----------
async function renderProfile() {
  const user = await api.me().catch(e => { clearAuth(); location.hash = '#/login'; return null; });
  if (!user) return;
  setUser(user);
  state.currentUser = user;

  let myPosts = [], myFavs = [];
  try { myPosts = await api.mine(); } catch {}
  try { myFavs = await api.favorites(); } catch {}

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="profile-header">
      <div class="top-row">
        <div class="avatar-lg">${esc(user.nickname?.charAt(0) || 'U')}</div>
        <div>
          <div class="nick">${esc(user.nickname)}${user.verifyStatus === 'approved' ? '<span class="verified-badge">实名认证</span>' : ''}${user.isRealMerchant ? '<span class="real-badge">真实商家</span>' : ''}</div>
          <div style="font-size:12px;opacity:.85">${user.phone ? user.phone.slice(0, 3) + '****' + user.phone.slice(-4) : '微信用户'}</div>
        </div>
      </div>
      <div class="stats">
        <div><b>${myPosts.length}</b> 发布</div>
        <div><b>${state.convs.length}</b> 私信</div>
        <div><b>${myFavs.length}</b> 收藏</div>
      </div>
    </div>
    <div class="page" style="padding-top:10px">
      <div class="menu-card">
        <div class="menu-item" onclick="location.hash='#/mine-posts'"><span class="ic">📝</span>我的发布<span class="arrow">›</span></div>
        <div class="menu-item" onclick="location.hash='#/messages'"><span class="ic">💬</span>我的私信<span class="arrow">›</span></div>
        <div class="menu-item" onclick="location.hash='#/favorites'"><span class="ic">⭐</span>我的收藏<span class="arrow">›</span></div>
        <div class="menu-item" onclick="location.hash='#/coupons'"><span class="ic">🎟️</span>我的置顶券<span class="arrow">›</span></div>
        <div class="menu-item" onclick="location.hash='#/invite'"><span class="ic">🔗</span>我的推广链接<span class="arrow">›</span></div>
      </div>
      <div class="menu-card">
        <div class="menu-item" onclick="location.hash='#/inspection'"><span class="ic">🏅</span>申请真实商家标签<span class="arrow">›</span></div>
        <div class="menu-item" onclick="location.hash='#/packages'"><span class="ic">💎</span>增值服务<span class="arrow">›</span></div>
        <div class="menu-item" onclick="location.hash='#/orders'"><span class="ic">📋</span>我的订单<span class="arrow">›</span></div>
        ${user.isAdmin ? '<div class="menu-item" onclick="location.hash=\'#/admin\'"><span class="ic">⚙️</span>管理后台<span class="arrow">›</span></div>' : ''}
      </div>
      <div class="menu-card">
        <div class="menu-item" onclick="showAgreement()"><span class="ic">📋</span>用户协议<span class="arrow">›</span></div>
        <div class="menu-item" onclick="showPrivacy()"><span class="ic">🔒</span>隐私政策<span class="arrow">›</span></div>
        <div class="menu-item" onclick="installPWA()"><span class="ic">📱</span>添加到桌面<span class="arrow">›</span></div>
      </div>
      <div style="padding:20px;text-align:center;color:var(--muted);font-size:12px;">${esc(state.appConfig.icp || '银洲汇合信息供需平台 · v1.0')}</div>
      <button onclick="logout()" class="btn btn-ghost" style="display:block;width:calc(100% - 32px);margin:0 16px 20px;padding:12px;color:#EF4444">退出登录</button>
    </div>
  ` + tabbar();
  state.tab = 'profile';
}

window.logout = () => { clearAuth(); disconnectSocket(); location.hash = '#/login'; };
window.showAgreement = async () => {
  await modal({ title: '用户协议', html: `<div style="text-align:left;line-height:1.7;">${esc(state.appConfig.userAgreement || '')}</div>` });
};
window.showPrivacy = async () => {
  await modal({ title: '隐私政策', html: `<div style="text-align:left;line-height:1.7;">${esc(state.appConfig.privacyPolicy || '')}</div>` });
};

// ---------- 我的发布 ----------
async function renderMinePosts() {
  const list = await api.mine().catch(() => []);
  const app = document.getElementById('app');
  app.innerHTML = topBar('我的发布', { back: true }) + `<div class="page"><div id="mineList"></div></div>`;
  const el = document.getElementById('mineList');
  if (!list.length) { el.innerHTML = `<div class="empty"><div class="ic">📝</div>暂无发布</div>`; return; }
  el.innerHTML = `<div class="post-list">` + list.map(p => `
    <div class="post-card" onclick="location.hash='#/post/${p.id}'">
      <div class="thumb">${p.type === 'supply' ? '📦' : '🛒'}</div>
      <div class="info">
        <div class="pt">${p.isTop ? '<span class="top-badge">置顶</span>' : ''}${esc(p.title)}</div>
        <div class="tags"><span class="tag ${p.type}">${p.type === 'supply' ? '供应' : '求购'}</span></div>
        <div class="meta"><span>📍 ${esc(p.location)}</span><span>${timeAgo(p.createdAt)}</span></div>
      </div>
    </div>
    <div style="padding:0 12px 10px;display:flex;gap:8px;">
      <button class="btn btn-ghost" onclick="event.stopPropagation();api.del('${p.id}').then(()=>hashRoute())">删除</button>
      ${p.status === 'approved' ? `<button class="btn btn-primary" onclick="event.stopPropagation();openTopModal('${p.id}')">置顶设置</button>` : ''}
    </div>
  `).join('') + `</div>`;
}

// ---------- 我的收藏 ----------
async function renderFavorites() {
  const favs = await api.favorites().catch(() => []);
  const app = document.getElementById('app');
  app.innerHTML = topBar('我的收藏', { back: true }) + `<div class="page"><div class="post-list">${favs.map(p => `
    <div class="post-card" onclick="location.hash='#/post/${p.id}'">
      <div class="thumb">${p.type === 'supply' ? '📦' : '🛒'}</div>
      <div class="info">
        <div class="pt">${esc(p.title)}</div>
        <div class="tags"><span class="tag ${p.type}">${p.type === 'supply' ? '供应' : '求购'}</span></div>
        <div class="meta"><span>📍 ${esc(p.location)}</span><span>${timeAgo(p.createdAt)}</span></div>
      </div>
    </div>
  `).join('') || `<div class="empty"><div class="ic">⭐</div>暂无收藏</div>`}</div></div>`;
}

// ---------- 置顶券 ----------
async function renderCoupons() {
  const list = await api.coupons().catch(() => []);
  const app = document.getElementById('app');
  app.innerHTML = topBar('我的置顶券', { back: true }) + `<div class="page">
    ${list.length ? `<div class="coupon-list">` + list.map(c => `
      <div class="coupon-card">
        <div class="c-left">
          <div class="c-days">${c.days}天</div>
          <div class="c-source">来源：${c.source === 'invite' ? '邀请奖励' : c.source === 'purchase' ? '付费购买' : '系统赠送'}</div>
        </div>
        <div class="c-right">
          <div class="c-status ${c.status}">${c.status === 'unused' ? '未使用' : '已使用'}</div>
          <div class="c-exp">${c.expireAt ? '有效期至 ' + formatTime(c.expireAt) : '无期限'}</div>
        </div>
      </div>
    `).join('') + `</div>` : `<div class="empty"><div class="ic">🎟️</div>暂无可用置顶券</div>`}
  </div>`;
}

// ---------- 邀请推广 ----------
async function renderInvite() {
  const { link, uid } = await api.inviteLink().catch(() => ({ link: '', uid: '' }));
  const records = await api.inviteRecords().catch(() => ({ list: [], couponCount: 0 }));
  const app = document.getElementById('app');
  app.innerHTML = topBar('我的推广链接', { back: true }) + `
    <div class="page" style="padding:16px">
      <div class="invite-card">
        <div class="invite-title">专属邀请链接</div>
        <div class="invite-link" id="inviteLink">${esc(link)}</div>
        <div class="invite-hint">新用户通过链接注册，每日最多可获 ${state.appConfig.inviteDailyCap || 5} 张 7天置顶券</div>
        <button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="copyInvite()">复制链接</button>
      </div>
      <div style="margin-top:16px;font-size:14px;color:var(--muted)">已成功邀请 ${records.list.length} 人，累计获得 ${records.couponCount} 张券</div>
    </div>
  `;
}
window.copyInvite = () => {
  const text = document.getElementById('inviteLink').textContent;
  navigator.clipboard.writeText(text).then(() => toast('已复制'), () => toast('复制失败'));
};

// ---------- 商家申请 ----------
function renderInspection() {
  const app = document.getElementById('app');
  app.innerHTML = topBar('申请真实商家', { back: true }) + `
    <div class="page" style="padding:16px">
      <div class="form-card">
        <div class="form-label">联系人 <span style="color:#EF4444">*</span></div>
        <input class="form-input" id="iName" placeholder="姓名" />
      </div>
      <div class="form-card">
        <div class="form-label">联系电话 <span style="color:#EF4444">*</span></div>
        <input class="form-input" id="iPhone" placeholder="手机号" />
      </div>
      <div class="form-card">
        <div class="form-label">地址 <span style="color:#EF4444">*</span></div>
        <input class="form-input" id="iAddr" placeholder="详细地址" />
      </div>
      <div class="form-card">
        <div class="form-label">主营品类</div>
        <input class="form-input" id="iCat" placeholder="如：大红皮、二红皮" />
      </div>
      <div class="form-card">
        <div class="form-label">备注</div>
        <textarea class="form-input form-textarea" id="iRemark" placeholder="其他说明"></textarea>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:10px;padding:14px" onclick="submitInspection()">提交申请</button>
      <div style="margin-top:20px;font-size:13px;color:var(--muted);line-height:1.6;">
        权益说明：<br/>
        · 审核通过后获得「真实商家」标签<br/>
        · 帖子卡片展示真实商家标识<br/>
        · 每日免费置顶 1 次，0点重置
      </div>
    </div>
  `;
}
window.submitInspection = async () => {
  const d = {
    contactName: document.getElementById('iName').value.trim(),
    phone: document.getElementById('iPhone').value.trim(),
    address: document.getElementById('iAddr').value.trim(),
    category: document.getElementById('iCat').value.trim(),
    remark: document.getElementById('iRemark').value.trim(),
  };
  if (!d.contactName || !d.phone || !d.address) { toast('请填写必填项'); return; }
  await api.createTicket(d);
  toast('申请已提交，等待审核');
  history.back();
};

// ---------- 增值服务 ----------
async function renderPackages() {
  const list = await api.packages().catch(() => []);
  const app = document.getElementById('app');
  app.innerHTML = topBar('增值服务', { back: true }) + `<div class="page" style="padding:16px">
    ${list.map(p => `
      <div class="package-card">
        <div style="flex:1">
          <div class="pkg-name">${esc(p.name)}</div>
          <div class="pkg-desc">${esc(p.description || '')}</div>
        </div>
        <div class="pkg-price">¥${p.price}</div>
        <button class="btn btn-primary" style="margin-left:10px;${p.price ? '' : 'opacity:.5'}" onclick="${p.price ? `buyPackage('${p.id}')` : ''}">${p.price ? '购买' : '暂不可购'}</button>
      </div>
    `).join('') || '<div class="empty">暂无套餐</div>'}
  </div>`;
}
window.buyPackage = async (id) => {
  const { order } = await api.createOrder(id);
  location.hash = '#/orders';
  toast('订单已生成，请上传付款凭证');
};

// ---------- 我的订单 ----------
async function renderOrders() {
  const list = await api.orders().catch(() => []);
  const app = document.getElementById('app');
  app.innerHTML = topBar('我的订单', { back: true }) + `<div class="page" style="padding:16px">
    ${list.map(o => `
      <div class="order-card">
        <div class="order-head">
          <span>${esc(o.packageName)}</span>
          <span class="order-status ${o.status}">${o.status === 'pending' ? '待审核' : o.status === 'approved' ? '已通过' : '已驳回'}</span>
        </div>
        <div class="order-price">¥${o.packagePrice}</div>
        ${o.status === 'pending' ? `
          <div class="order-proof">
            <input type="file" accept="image/*" onchange="uploadProof('${o.id}', this)" />
            <div style="font-size:12px;color:var(--muted)">上传微信/支付宝转账截图</div>
          </div>
        ` : ''}
        ${o.paymentProof ? `<img src="${o.paymentProof}" class="proof-img" onclick="previewImage('${o.paymentProof}')" />` : ''}
      </div>
    `).join('') || '<div class="empty">暂无订单</div>'}
  </div>`;
}
window.uploadProof = async (orderId, input) => {
  const file = input.files[0];
  if (!file) return;
  toast('上传中...');
  const res = await api.uploadOrderProof(orderId, file);
  if (res.ok) { toast('上传成功'); hashRoute(); }
  else toast(res.error || '上传失败');
};
window.previewImage = (url) => {
  modal({ title: '查看凭证', html: `<img src="${url}" style="width:100%;border-radius:10px;" />`, okText: '关闭' });
};

// ---------- 登录页 ----------
function renderLogin() {
  const app = document.getElementById('app');
  const inviter = new URLSearchParams(location.search).get('inviter') || '';
  if (inviter) localStorage.setItem('inviter', inviter);
  app.innerHTML = `
    <div class="login-wrap">
      <div class="login-logo">
        <img class="login-logo-img" src="/logo.svg" alt="logo" />
        <div class="t">银洲汇合信息供需平台</div>
        <div style="font-size:13px;color:var(--muted);margin-top:6px">登录后发布供需信息</div>
      </div>
      <input id="loginPhone" placeholder="手机号" maxlength="11" />
      <input id="loginPwd" type="password" placeholder="密码（任意即可）" maxlength="20" />
      <label class="agree-row">
        <input type="checkbox" id="loginAgree" />
        <span>我已阅读并同意 <a onclick="showAgreement()">用户协议</a> 和 <a onclick="showPrivacy()">隐私政策</a></span>
      </label>
      <button onclick="doLogin()">登录 / 自动注册</button>
      <button class="btn-wechat" onclick="doWechatLogin()">🟢 微信一键登录（演示）</button>
      <div class="hint">演示账号：13800000000 / 任意密码</div>
    </div>
  `;
  document.getElementById('loginPwd').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

window.doWechatLogin = async () => {
  const agree = document.getElementById('loginAgree').checked;
  const inviter = localStorage.getItem('inviter') || '';
  if (!agree) { toast('请先同意用户协议和隐私政策'); return; }
  try {
    // 演示模式：模拟微信 code，后端未配置真实微信参数时返回 mock openid
    const mockCode = 'mock_demo_' + Date.now();
    const { token, user } = await api.wechatLogin({ code: mockCode, inviterId: inviter, agree: true });
    setToken(token); setUser(user);
    localStorage.removeItem('inviter');
    toast('微信登录成功');
    connectSocket();
    setTimeout(() => location.hash = '#/home', 300);
  } catch (e) { toast(e.message); }
};

window.doLogin = async () => {
  const phone = document.getElementById('loginPhone').value.trim();
  const pwd = document.getElementById('loginPwd').value.trim() || '123456';
  const agree = document.getElementById('loginAgree').checked;
  const inviter = localStorage.getItem('inviter') || '';
  if (!agree) { toast('请先同意用户协议和隐私政策'); return; }
  if (!phone || phone.length < 11) { toast('请输入11位手机号'); return; }
  try {
    const { token, user } = await api.phoneLogin({ phone, password: pwd, inviter, agree });
    setToken(token); setUser(user);
    localStorage.removeItem('inviter');
    toast('登录成功');
    connectSocket();
    setTimeout(() => location.hash = '#/home', 300);
  } catch (e) { toast(e.message); }
};

// ---------- PWA ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
window.installPWA = async () => {
  if (!deferredPrompt) {
    if (/MicroMessenger/i.test(navigator.userAgent)) {
      modal({ title: '添加到桌面', html: '<p>请点击右上角「···」→「在浏览器打开」，再从浏览器菜单添加到桌面。</p>' });
    } else {
      modal({ title: '添加到桌面', html: '<p>请在浏览器菜单中选择「添加到主屏幕」。</p>' });
    }
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
};

// ---------- 管理后台 ----------
async function renderAdmin() {
  const user = getUser();
  if (!user?.isAdmin) { location.hash = '#/profile'; return; }
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="admin-layout">
      <div class="admin-sidebar">
        <div class="admin-logo"><img src="/logo.svg" alt="logo" /> 管理后台</div>
        <div class="admin-menu">
          <div class="admin-item active" data-m="dashboard">📊 概览</div>
          <div class="admin-item" data-m="posts">📝 帖子管理</div>
          <div class="admin-item" data-m="users">👤 用户管理</div>
          <div class="admin-item" data-m="tickets">🏅 考察工单</div>
          <div class="admin-item" data-m="invites">🔗 邀请流水</div>
          <div class="admin-item" data-m="coupons">🎟️ 置顶券台账</div>
          <div class="admin-item" data-m="packages">💎 增值套餐</div>
          <div class="admin-item" data-m="orders">📋 付费订单</div>
          <div class="admin-item" data-m="reports">🛡️ 举报管理</div>
          <div class="admin-item" data-m="config">⚙️ 平台配置</div>
        </div>
      </div>
      <div class="admin-main" id="adminMain">
        <div class="admin-topbar"><span onclick="location.hash='#/profile'">← 返回</span></div>
        <div id="adminContent"></div>
      </div>
    </div>
  `;
  document.querySelectorAll('.admin-item').forEach(el => {
    el.onclick = () => {
      document.querySelectorAll('.admin-item').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      adminLoadModule(el.dataset.m);
    };
  });
  adminLoadModule('dashboard');
}

async function adminLoadModule(m) {
  const c = document.getElementById('adminContent');
  c.innerHTML = '<div class="empty">加载中...</div>';
  try {
    if (m === 'dashboard') await adminDashboard(c);
    if (m === 'posts') await adminPosts(c);
    if (m === 'users') await adminUsers(c);
    if (m === 'tickets') await adminTickets(c);
    if (m === 'invites') await adminInvites(c);
    if (m === 'coupons') await adminCoupons(c);
    if (m === 'packages') await adminPackages(c);
    if (m === 'orders') await adminOrders(c);
    if (m === 'reports') await adminReports(c);
    if (m === 'config') await adminConfig(c);
  } catch (e) { c.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`; }
}

async function adminDashboard(c) {
  const d = await api.adminDashboard();
  c.innerHTML = `
    <h2>数据概览</h2>
    <div class="admin-cards">
      <div class="admin-card"><div class="num">${d.counts.users}</div><div>用户</div></div>
      <div class="admin-card"><div class="num">${d.counts.posts}</div><div>帖子</div></div>
      <div class="admin-card"><div class="num">${d.counts.pendingPosts}</div><div>待审帖子</div></div>
      <div class="admin-card"><div class="num">${d.counts.orders}</div><div>订单</div></div>
      <div class="admin-card"><div class="num">${d.counts.pendingOrders}</div><div>待审订单</div></div>
      <div class="admin-card"><div class="num">${d.counts.tickets}</div><div>工单</div></div>
      <div class="admin-card"><div class="num">${d.counts.pendingTickets}</div><div>待审工单</div></div>
      <div class="admin-card"><div class="num">${d.counts.reports}</div><div>举报</div></div>
    </div>
  `;
}

async function adminPosts(c) {
  const list = await api.adminPosts();
  c.innerHTML = `
    <h2>帖子管理</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <tr><th>标题</th><th>类型</th><th>状态</th><th>置顶</th><th>操作</th></tr>
        ${list.map(p => `
          <tr>
            <td>${esc(p.title)}</td>
            <td>${p.type === 'supply' ? '供应' : '求购'}</td>
            <td>${p.status === 'approved' ? '已通过' : p.status === 'rejected' ? '已驳回' : '待审'}</td>
            <td>${p.isTop ? '是' : '否'}</td>
            <td>
              <button onclick="adminSetPostStatus('${p.id}', '${p.status === 'approved' ? 'rejected' : 'approved'}')">${p.status === 'approved' ? '下架' : '通过'}</button>
              ${p.topAuditStatus === 'pending' ? `<button onclick="adminTopAudit('${p.id}', 'approve')">审置顶</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
}
window.adminSetPostStatus = async (id, status) => {
  await api.adminUpdatePost(id, { status });
  adminLoadModule('posts');
};
window.adminTopAudit = async (id, action) => {
  await api.adminTopAudit(id, action);
  adminLoadModule('posts');
};

async function adminUsers(c) {
  const list = await api.adminUsers();
  c.innerHTML = `
    <h2>用户管理</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <tr><th>昵称</th><th>手机号</th><th>商家</th><th>管理员</th><th>操作</th></tr>
        ${list.map(u => `
          <tr>
            <td>${esc(u.nickname)}</td>
            <td>${u.phone || '-'}</td>
            <td>${u.isRealMerchant ? '是' : '否'}</td>
            <td>${u.isAdmin ? '是' : '否'}</td>
            <td>
              <button onclick="adminToggleMerchant('${u.id}', ${!u.isRealMerchant})">${u.isRealMerchant ? '撤销商家' : '授商家'}</button>
              <button onclick="adminGrantCoupon('${u.id}', 7)">发券</button>
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
}
window.adminToggleMerchant = async (id, v) => { await api.adminUpdateUser(id, { isRealMerchant: v }); adminLoadModule('users'); };
window.adminGrantCoupon = async (id, days) => { await api.adminGrantCoupon(id, days); toast('已发券'); };

async function adminTickets(c) {
  const list = await api.adminTickets('pending');
  c.innerHTML = `
    <h2>考察工单</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <tr><th>申请人</th><th>联系人</th><th>电话</th><th>地址</th><th>操作</th></tr>
        ${list.map(t => `
          <tr>
            <td>${esc(t.applicant?.nickname || '')}</td>
            <td>${esc(t.contactName)}</td>
            <td>${esc(t.phone)}</td>
            <td>${esc(t.address)}</td>
            <td>
              <button onclick="adminTicket('${t.id}', 'approved')">通过</button>
              <button onclick="adminTicketReject('${t.id}')">驳回</button>
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
}
window.adminTicket = async (id, status) => { await api.adminUpdateTicket(id, { status }); adminLoadModule('tickets'); };
window.adminTicketReject = async (id) => {
  const reason = prompt('驳回理由：'); if (!reason) return;
  await api.adminUpdateTicket(id, { status: 'rejected', rejectReason: reason });
  adminLoadModule('tickets');
};

async function adminInvites(c) {
  const list = await api.adminInvites();
  c.innerHTML = `
    <h2>邀请流水</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <tr><th>邀请人</th><th>被邀请人</th><th>时间</th><th>是否发券</th></tr>
        ${list.map(r => `
          <tr><td>${esc(r.inviter?.nickname || '')}</td><td>${esc(r.invitee?.nickname || '')}</td><td>${formatTime(r.createdAt)}</td><td>${r.couponIssued ? '是' : '否'}</td></tr>
        `).join('')}
      </table>
    </div>
  `;
}

async function adminCoupons(c) {
  const list = await api.adminCoupons();
  c.innerHTML = `
    <h2>置顶券台账</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <tr><th>持有者</th><th>来源</th><th>状态</th><th>天数</th><th>操作</th></tr>
        ${list.map(cp => `
          <tr>
            <td>${esc(cp.owner?.nickname || '')}</td>
            <td>${cp.source}</td>
            <td>${cp.status}</td>
            <td>${cp.days}</td>
            <td><button onclick="adminVoidCoupon('${cp.id}')">作废</button></td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
}
window.adminVoidCoupon = async (id) => { await api.adminUpdateCoupon(id, { status: 'void' }); adminLoadModule('coupons'); };

async function adminPackages(c) {
  const list = await api.adminPackages();
  c.innerHTML = `
    <h2>增值套餐</h2>
    <div style="margin-bottom:12px;">
      <input id="pkgName" placeholder="名称" class="form-input" style="margin-bottom:6px" />
      <input id="pkgDesc" placeholder="描述" class="form-input" style="margin-bottom:6px" />
      <input id="pkgPrice" placeholder="价格" type="number" class="form-input" style="margin-bottom:6px" />
      <input id="pkgDays" placeholder="券天数" type="number" class="form-input" style="margin-bottom:6px" />
      <button class="btn btn-primary" onclick="adminAddPackage()">新增套餐</button>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <tr><th>名称</th><th>价格</th><th>券天数</th><th>操作</th></tr>
        ${list.map(p => `
          <tr><td>${esc(p.name)}</td><td>¥${p.price}</td><td>${p.couponDays}</td>
          <td><button onclick="adminDelPackage('${p.id}')">删除</button></td></tr>
        `).join('')}
      </table>
    </div>
  `;
}
window.adminAddPackage = async () => {
  await api.adminCreatePackage({
    name: document.getElementById('pkgName').value,
    description: document.getElementById('pkgDesc').value,
    price: document.getElementById('pkgPrice').value,
    couponDays: document.getElementById('pkgDays').value,
  });
  adminLoadModule('packages');
};
window.adminDelPackage = async (id) => { await api.adminDeletePackage(id); adminLoadModule('packages'); };

async function adminOrders(c) {
  const list = await api.adminOrders('pending');
  c.innerHTML = `
    <h2>付费订单</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <tr><th>买家</th><th>套餐</th><th>金额</th><th>凭证</th><th>操作</th></tr>
        ${list.map(o => `
          <tr>
            <td>${esc(o.buyer?.nickname || '')}</td>
            <td>${esc(o.packageName)}</td>
            <td>¥${o.packagePrice}</td>
            <td>${o.paymentProof ? `<a href="${o.paymentProof}" target="_blank">查看</a>` : '未上传'}</td>
            <td>
              <button onclick="adminOrder('${o.id}', 'approved')">通过</button>
              <button onclick="adminOrder('${o.id}', 'rejected')">驳回</button>
            </td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
}
window.adminOrder = async (id, status) => { await api.adminUpdateOrder(id, { status }); adminLoadModule('orders'); };

async function adminReports(c) {
  const list = await api.adminReports();
  c.innerHTML = `
    <h2>举报管理</h2>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <tr><th>举报人</th><th>目标</th><th>原因</th><th>时间</th></tr>
        ${list.map(r => `
          <tr><td>${esc(r.reporter?.nickname || '')}</td><td>${r.targetType} ${esc(r.target?.title || '')}</td><td>${esc(r.reason)}</td><td>${formatTime(r.createdAt)}</td></tr>
        `).join('')}
      </table>
    </div>
  `;
}

async function adminConfig(c) {
  const cfg = await api.adminConfigs();
  c.innerHTML = `
    <h2>平台配置</h2>
    <div class="admin-form">
      <label>客服UID</label><input id="cfgCsUid" class="form-input" value="${esc(cfg.csUid || '')}" />
      <label>ICP备案</label><input id="cfgIcp" class="form-input" value="${esc(cfg.icp || '')}" />
      <label>置顶券免审</label>
      <select id="cfgAutoCoupon" class="form-input">
        <option value="true" ${cfg.autoApproveTopCoupon !== false ? 'selected' : ''}>开启</option>
        <option value="false" ${cfg.autoApproveTopCoupon === false ? 'selected' : ''}>关闭</option>
      </select>
      <label>商家置顶免审</label>
      <select id="cfgAutoMerchant" class="form-input">
        <option value="true" ${cfg.autoApproveTopMerchant !== false ? 'selected' : ''}>开启</option>
        <option value="false" ${cfg.autoApproveTopMerchant === false ? 'selected' : ''}>关闭</option>
      </select>
      <label>每日邀请上限</label><input id="cfgCap" class="form-input" value="${cfg.inviteDailyCap || 5}" />
      <label>券有效期（天）</label><input id="cfgExpire" class="form-input" value="${cfg.couponExpireDays || 30}" />
      <label>敏感词（一行一个）</label>
      <div style="margin-bottom:8px;">
        ${(await api.adminSensitive()).map(w => `<span class="word-tag">${esc(w)} <span onclick="adminDelWord('${w}')">×</span></span>`).join('')}
      </div>
      <input id="newWord" class="form-input" placeholder="新增敏感词" />
      <button class="btn btn-ghost" onclick="adminAddWord()">添加敏感词</button>
      <button class="btn btn-primary" style="margin-top:12px" onclick="adminSaveConfig()">保存配置</button>
    </div>
  `;
}
window.adminSaveConfig = async () => {
  await api.adminUpdateConfigs({
    csUid: document.getElementById('cfgCsUid').value,
    icp: document.getElementById('cfgIcp').value,
    autoApproveTopCoupon: document.getElementById('cfgAutoCoupon').value === 'true',
    autoApproveTopMerchant: document.getElementById('cfgAutoMerchant').value === 'true',
    inviteDailyCap: Number(document.getElementById('cfgCap').value),
    couponExpireDays: Number(document.getElementById('cfgExpire').value),
  });
  toast('配置已保存');
};
window.adminAddWord = async () => {
  const w = document.getElementById('newWord').value.trim(); if (!w) return;
  await api.adminAddSensitive(w); adminLoadModule('config');
};
window.adminDelWord = async (w) => { await api.adminRemoveSensitive(w); adminLoadModule('config'); };

// ---------- 弹窗组件 ----------
function modal({ title, html, okText = '确定', cancelText = '', noOk = false }) {
  return new Promise(resolve => {
    let mask = document.getElementById('_modalMask');
    if (mask) mask.remove();
    mask = document.createElement('div');
    mask.id = '_modalMask';
    mask.className = 'modal-mask';
    mask.innerHTML = `
      <div class="modal-box">
        <div class="modal-title">${esc(title)}</div>
        <div class="modal-body">${html}</div>
        <div class="modal-btns">
          ${cancelText ? `<button class="btn btn-ghost" id="modalCancel">${esc(cancelText)}</button>` : ''}
          ${noOk ? '' : `<button class="btn btn-primary" id="modalOk">${esc(okText)}</button>`}
        </div>
      </div>
    `;
    document.body.appendChild(mask);
    const close = (v) => { mask.remove(); resolve(v); };
    document.getElementById('modalOk')?.addEventListener('click', () => close(true));
    document.getElementById('modalCancel')?.addEventListener('click', () => close(false));
  });
}
window.closeModal = () => { const m = document.getElementById('_modalMask'); if (m) m.remove(); };

// ---------- 工具 ----------
function esc(s) { return (s ?? '').toString().replace(/[<>&"']/g, c => ({'<':'<','>':'>','&':'&','"':'"',"'":'&#39;'}[c])); }
function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(Number(ts)); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function timeAgo(ts) {
  if (!ts) return '-';
  const diff = Date.now() - Number(ts);
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + '分钟前';
  if (h < 24) return h + '小时前';
  if (d < 7) return d + '天前';
  return formatTime(ts);
}
function pad(n) { return String(n).padStart(2, '0'); }
function dayStart(ts = Date.now()) {
  const d = new Date(Number(ts)); d.setHours(0, 0, 0, 0); return d.getTime();
}
function toast(msg) {
  let t = document.getElementById('_toast');
  if (!t) { t = document.createElement('div'); t.id = '_toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- 启动 ----------
(async () => {
  state.appConfig = await api.config().catch(() => ({}));
  const ok = await showAgreementIfNeeded();
  if (!ok) {
    document.getElementById('app').innerHTML = '<div class="empty" style="padding-top:40vh"><img src="/logo.svg" style="width:64px;height:64px;margin-bottom:12px;" /><div>请同意用户协议后继续使用</div></div>';
    return;
  }
  connectSocket();
  hashRoute();
})();
