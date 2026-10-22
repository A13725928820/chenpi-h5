// API 封装
const API_BASE = ''; // 同源部署，直接相对路径

function getToken() { return localStorage.getItem('token'); }
function setToken(t) { localStorage.setItem('token', t); }
function setUser(u) { localStorage.setItem('user', JSON.stringify(u)); }
function getUser() { try { return JSON.parse(localStorage.getItem('user')); } catch { return null; } }
function clearAuth() { localStorage.removeItem('token'); localStorage.removeItem('user'); }

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status === 401) { clearAuth(); location.hash = '#/login'; }
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

const api = {
  // Public
  config() { return request('/api/config'); },
  // Auth
  wechatLogin({ code, phone, inviterId, agree }) { return request('/api/auth/wechat', { method: 'POST', body: JSON.stringify({ code, phone, inviterId, agree }) }); },
  phoneLogin({ phone, password, inviterId, agree }) { return request('/api/auth/phone', { method: 'POST', body: JSON.stringify({ phone, password, inviterId, agree }) }); },
  me() { return request('/api/auth/me'); },
  // User
  updateProfile(d) { return request('/api/users/me', { method: 'PATCH', body: JSON.stringify(d) }); },
  verify(realName, idCard) { return request('/api/users/verify', { method: 'POST', body: JSON.stringify({ realName, idCard }) }); },
  profile(id) { return request('/api/users/profile/' + id); },
  // Posts
  list(filter = {}) {
    return request('/api/posts/search', { method: 'POST', body: JSON.stringify(filter) });
  },
  mine() { return request('/api/posts/mine'); },
  favorites() { return request('/api/posts/favorites'); },
  get(id) { return request('/api/posts/' + id); },
  create(d) { return request('/api/posts', { method: 'POST', body: JSON.stringify(d) }); },
  update(id, d) { return request('/api/posts/' + id, { method: 'PATCH', body: JSON.stringify(d) }); },
  del(id) { return request('/api/posts/' + id, { method: 'DELETE' }); },
  top(id, d) { return request('/api/posts/' + id + '/top', { method: 'POST', body: JSON.stringify(d) }); },
  favorite(id) { return request('/api/posts/' + id + '/favorite', { method: 'POST', body: JSON.stringify({}) }); },
  reportPost(id, reason) { return request('/api/posts/' + id + '/report', { method: 'POST', body: JSON.stringify({ reason }) }); },
  // Upload
  async uploadImages(files) {
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    const res = await fetch(API_BASE + '/api/images/upload', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');
    return data.urls;
  },
  // Conversations
  createConv(otherUserId) { return request('/api/conversations', { method: 'POST', body: JSON.stringify({ otherUserId }) }); },
  listConvs() { return request('/api/conversations'); },
  listMessages(convId) { return request('/api/conversations/' + convId + '/messages'); },
  // Coupons
  coupons() { return request('/api/coupons'); },
  couponHistory() { return request('/api/coupons/history'); },
  // Packages / Orders
  packages() { return request('/api/packages'); },
  orders() { return request('/api/orders'); },
  createOrder(packageId) { return request('/api/orders', { method: 'POST', body: JSON.stringify({ packageId }) }); },
  uploadOrderProof(orderId, file) {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(API_BASE + '/api/orders/' + orderId + '/proof', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + getToken() }, body: fd,
    }).then(r => r.json());
  },
  // Inspection
  createTicket(d) { return request('/api/inspections', { method: 'POST', body: JSON.stringify(d) }); },
  tickets() { return request('/api/inspections'); },
  // Invite
  inviteLink() { return request('/api/invite/link'); },
  inviteRecords() { return request('/api/invite/records'); },
  // Admin
  adminDashboard() { return request('/api/admin/dashboard'); },
  adminPosts(filter = {}) {
    const q = new URLSearchParams(filter).toString();
    return request('/api/admin/posts' + (q ? '?' + q : ''));
  },
  adminUpdatePost(id, d) { return request('/api/admin/posts/' + id, { method: 'PATCH', body: JSON.stringify(d) }); },
  adminTopAudit(id, action) { return request('/api/admin/posts/' + id + '/top-audit', { method: 'POST', body: JSON.stringify({ action }) }); },
  adminUsers(q = '') { return request('/api/admin/users' + (q ? '?q=' + encodeURIComponent(q) : '')); },
  adminUpdateUser(id, d) { return request('/api/admin/users/' + id, { method: 'PATCH', body: JSON.stringify(d) }); },
  adminGrantCoupon(id, days) { return request('/api/admin/users/' + id + '/coupons', { method: 'POST', body: JSON.stringify({ days }) }); },
  adminTickets(status) { return request('/api/admin/tickets' + (status ? '?status=' + status : '')); },
  adminUpdateTicket(id, d) { return request('/api/admin/tickets/' + id, { method: 'PATCH', body: JSON.stringify(d) }); },
  adminInvites() { return request('/api/admin/invites'); },
  adminCoupons(filter = {}) {
    const q = new URLSearchParams(filter).toString();
    return request('/api/admin/coupons' + (q ? '?' + q : ''));
  },
  adminUpdateCoupon(id, d) { return request('/api/admin/coupons/' + id, { method: 'PATCH', body: JSON.stringify(d) }); },
  adminPackages() { return request('/api/admin/packages'); },
  adminCreatePackage(d) { return request('/api/admin/packages', { method: 'POST', body: JSON.stringify(d) }); },
  adminUpdatePackage(id, d) { return request('/api/admin/packages/' + id, { method: 'PATCH', body: JSON.stringify(d) }); },
  adminDeletePackage(id) { return request('/api/admin/packages/' + id, { method: 'DELETE' }); },
  adminOrders(status) { return request('/api/admin/orders' + (status ? '?status=' + status : '')); },
  adminUpdateOrder(id, d) { return request('/api/admin/orders/' + id, { method: 'PATCH', body: JSON.stringify(d) }); },
  adminReports() { return request('/api/admin/reports'); },
  adminConfigs() { return request('/api/admin/configs'); },
  adminUpdateConfigs(d) { return request('/api/admin/configs', { method: 'PATCH', body: JSON.stringify(d) }); },
  adminSensitive() { return request('/api/admin/sensitive'); },
  adminAddSensitive(word) { return request('/api/admin/sensitive', { method: 'POST', body: JSON.stringify({ word }) }); },
  adminRemoveSensitive(word) { return request('/api/admin/sensitive/' + encodeURIComponent(word), { method: 'DELETE' }); },
};
