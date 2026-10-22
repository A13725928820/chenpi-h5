// 供需告示墙 - 前端逻辑
const socket = io();

let currentType = 'all';
let currentPostId = null;
let myNickname = localStorage.getItem('nickname') || '';

// 初始化昵称
const nicknameInput = document.getElementById('nicknameInput');
nicknameInput.value = myNickname;
nicknameInput.addEventListener('change', () => {
  myNickname = nicknameInput.value.trim();
  localStorage.setItem('nickname', myNickname);
});

// 标签切换
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentType = tab.dataset.type;
    loadPosts();
  });
});

// 回车搜索
document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') loadPosts();
});

// 回车发送聊天
document.getElementById('chatInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendMessage();
});

// ---------- 列表 ----------
async function loadPosts() {
  const q = document.getElementById('searchInput').value.trim();
  const params = new URLSearchParams();
  params.set('type', currentType);
  if (q) params.set('q', q);
  try {
    const res = await fetch('/api/posts?' + params.toString());
    const list = await res.json();
    renderPosts(list);
  } catch (e) { console.error(e); }
}

function renderPosts(list) {
  const grid = document.getElementById('postList');
  const empty = document.getElementById('emptyTip');
  if (!list.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  grid.innerHTML = list.map(p => `
    <div class="post-card" onclick="openDetail('${p.id}')">
      <span class="post-badge ${p.type}">${p.type === 'supply' ? '供' : '需'}</span>
      <div class="post-title">${escapeHtml(p.title)}</div>
      <div class="post-desc">${escapeHtml(p.description)}</div>
      <div class="post-meta">
        <span class="post-price">¥${escapeHtml(p.price)}</span>
        <span class="post-cat">${escapeHtml(p.category)}</span>
      </div>
      <div class="post-meta" style="margin-top:8px;">
        <span>👤 ${escapeHtml(p.contactName)}</span>
        <span>📍 ${escapeHtml(p.location)}</span>
      </div>
    </div>
  `).join('');
}

// ---------- 详情 ----------
async function openDetail(id) {
  currentPostId = id;
  try {
    const res = await fetch('/api/posts/' + id);
    const post = await res.json();
    renderDetail(post);
  } catch (e) { console.error(e); return; }

  document.getElementById('listView').style.display = 'none';
  document.getElementById('detailView').style.display = 'block';
  window.scrollTo(0, 0);

  // 加入聊天房间
  socket.emit('chat:join', { postId: id });
  // 清空并加载历史
  const msgs = await fetch('/api/posts/' + id + '/messages').then(r => r.json());
  renderMessages(msgs);
}

function renderDetail(p) {
  document.getElementById('postDetailContent').innerHTML = `
    <span class="post-badge ${p.type}">${p.type === 'supply' ? '供应' : '需求'}</span>
    <div class="detail-title">${escapeHtml(p.title)}</div>
    <div class="detail-info">
      <span>💰 <strong>¥${escapeHtml(p.price)}</strong></span>
      <span>🏷️ ${escapeHtml(p.category)}</span>
      <span>📍 ${escapeHtml(p.location)}</span>
      <span>🕐 ${formatTime(p.createdAt)}</span>
    </div>
    <div class="detail-desc">${escapeHtml(p.description)}</div>
    <div class="poster-bar">
      <div class="avatar">${escapeHtml(p.contactName.charAt(0))}</div>
      <div>
        <div style="font-weight:600;">${escapeHtml(p.contactName)}</div>
        <div style="font-size:12px;color:var(--muted);">发布者</div>
      </div>
    </div>
  `;
}

function goList() {
  if (currentPostId) socket.emit('chat:leave', { postId: currentPostId });
  currentPostId = null;
  document.getElementById('detailView').style.display = 'none';
  document.getElementById('listView').style.display = 'block';
}

// ---------- 聊天 ----------
function renderMessages(list) {
  const box = document.getElementById('chatMessages');
  if (!list.length) {
    box.innerHTML = '<div class="chat-empty">还没有消息，主动打个招呼吧～</div>';
    return;
  }
  box.innerHTML = list.map(m => renderMsg(m)).join('');
  box.scrollTop = box.scrollHeight;
}

function renderMsg(m) {
  const isSelf = m.sender === myNickname;
  return `
    <div class="msg ${isSelf ? 'self' : 'other'}">
      ${!isSelf ? `<div class="sender">${escapeHtml(m.sender)}</div>` : ''}
      <div>${escapeHtml(m.content)}</div>
      <div class="msg-time">${formatTime(m.timestamp, true)}</div>
    </div>
  `;
}

socket.on('chat:message', (m) => {
  if (m.postId !== currentPostId) return;
  const box = document.getElementById('chatMessages');
  if (box.querySelector('.chat-empty')) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', renderMsg(m));
  box.scrollTop = box.scrollHeight;
});

socket.on('chat:history', (list) => {
  if (currentPostId) renderMessages(list);
});

function sendMessage() {
  const input = document.getElementById('chatInput');
  const content = input.value.trim();
  if (!content) return;
  if (!myNickname) { toast('请先在右上角填写你的称呼'); nicknameInput.focus(); return; }
  socket.emit('chat:send', { postId: currentPostId, sender: myNickname, content });
  input.value = '';
}

// 新帖广播
socket.on('post:new', () => {
  if (document.getElementById('listView').style.display !== 'none') loadPosts();
});

// ---------- 发帖 ----------
function openCreate() {
  document.getElementById('fContact').value = myNickname;
  document.getElementById('createModal').style.display = 'flex';
}
function closeCreate() {
  document.getElementById('createModal').style.display = 'none';
}

async function submitPost() {
  const type = document.querySelector('input[name="postType"]:checked').value;
  const title = document.getElementById('fTitle').value.trim();
  const description = document.getElementById('fDesc').value.trim();
  const category = document.getElementById('fCategory').value.trim();
  const price = document.getElementById('fPrice').value.trim();
  const contactName = document.getElementById('fContact').value.trim();
  const location = document.getElementById('fLocation').value.trim();

  if (!title || !description || !contactName) { toast('请填写必填项'); return; }
  if (!myNickname) { myNickname = contactName; localStorage.setItem('nickname', myNickname); nicknameInput.value = myNickname; }

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, description, category, price, contactName, location }),
    });
    const post = await res.json();
    if (res.ok) {
      toast('发布成功');
      closeCreate();
      // 清空表单
      document.getElementById('fTitle').value = '';
      document.getElementById('fDesc').value = '';
      document.getElementById('fCategory').value = '';
      document.getElementById('fPrice').value = '';
      document.getElementById('fLocation').value = '';
      loadPosts();
    } else {
      toast(post.error || '发布失败');
    }
  } catch (e) { toast('网络错误'); }
}

// ---------- 工具 ----------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}
function formatTime(ts, short) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  if (short) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// 启动
loadPosts();
