// ============ 银洲汇合信息供需平台 - 后端入口 ============
// 技术栈：Node.js + Express + Socket.IO
// 存储：MongoDB（MONGODB_URI）优先，无则内存兜底
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { Server } = require('socket.io');

const JWT_SECRET = process.env.JWT_SECRET || 'cd-board-dev-secret-change-me';
const PORT = process.env.PORT || 3000;
const WX_APPID = process.env.WX_APPID || '';
const WX_SECRET = process.env.WX_SECRET || '';
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, '..', 'mobile')));

// ---------- Multer 图片上传 ----------
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('仅支持图片'));
  },
});

// ---------- 工具函数 ----------
const signToken = (userId) => jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: '30d' });
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const genId = (p = '') => p + Math.random().toString(36).slice(2, 10);
const dayStart = (ts = Date.now()) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function publicUser(u) {
  const { pwd, idCard, ...rest } = u;
  return { ...rest, id: u.id };
}

// ---------- 存储初始化 ----------
let store;
async function initStore() {
  if (process.env.MONGODB_URI) {
    try {
      store = await createMongoStore(process.env.MONGODB_URI);
      console.log('✅ 存储模式: MongoDB');
      await ensureDemoData();
      return;
    } catch (e) { console.error('MongoDB 连接失败，回退内存:', e.message); }
  }
  store = createMemoryStore();
  console.log('📦 存储模式: 内存（重启清空）');
  await ensureDemoData();
}

// ---------- 内存存储 ----------
function createMemoryStore() {
  const users = [];
  const posts = [];
  const conversations = [];
  const messages = {};
  const favorites = [];
  const reports = [];
  const coupons = [];
  const packages = [];
  const orders = [];
  const tickets = [];
  const configs = {};
  const sensitiveWords = [];
  const inviteRecords = [];

  const findById = (arr, id) => arr.find(x => x.id === id);

  return {
    mode: 'memory',
    // User
    async createUser(data) { const u = { id: genId('u_'), ...data, createdAt: Date.now() }; users.push(u); return u; },
    async findUserByPhone(phone) { return users.find(u => u.phone === phone); },
    async findUserById(id) { return findById(users, id); },
    async findUserByOpenid(openid) { return users.find(u => u.openid === openid); },
    async updateUser(id, patch) { Object.assign(findById(users, id) || {}, patch); return findById(users, id); },
    async listUsers(filter = {}) {
      let list = [...users].sort((a, b) => b.createdAt - a.createdAt);
      if (filter.q) list = list.filter(u => u.phone.includes(filter.q) || (u.nickname || '').includes(filter.q));
      return list;
    },
    // Post
    async listPosts({ type, location, q, status = 'approved', userId }) {
      let list = posts.filter(p => p.status === status).sort((a, b) => b.createdAt - a.createdAt);
      if (type && type !== 'all') list = list.filter(p => p.type === type);
      if (location) list = list.filter(p => p.location.includes(location));
      if (userId) list = list.filter(p => p.userId === userId);
      if (q) {
        const kw = q.toLowerCase();
        list = list.filter(p => p.title.toLowerCase().includes(kw) || p.description.toLowerCase().includes(kw));
      }
      return list;
    },
    async getPost(id) { const p = findById(posts, id); if (p) p.views++; return p; },
    async getPostRaw(id) { return findById(posts, id); },
    async createPost(data) { const p = { id: genId('p_'), ...data, status: 'approved', views: 0, createdAt: Date.now() }; posts.unshift(p); return p; },
    async updatePost(id, patch) { Object.assign(findById(posts, id) || {}, patch); return findById(posts, id); },
    async deletePost(id) { const idx = posts.findIndex(p => p.id === id); if (idx >= 0) posts.splice(idx, 1); },
    async listUserPosts(userId) { return posts.filter(p => p.userId === userId).sort((a, b) => b.createdAt - a.createdAt); },
    async listAllPosts(filter = {}) {
      let list = [...posts].sort((a, b) => b.createdAt - a.createdAt);
      if (filter.status) list = list.filter(p => p.status === filter.status);
      if (filter.q) {
        const kw = filter.q.toLowerCase();
        list = list.filter(p => p.title.toLowerCase().includes(kw) || p.description.toLowerCase().includes(kw));
      }
      return list;
    },
    // Conversation / Message
    async getOrCreateConv(ids) {
      const sorted = [...ids].sort();
      let c = conversations.find(x => JSON.stringify(x.participants.slice().sort()) === JSON.stringify(sorted));
      if (!c) { c = { id: genId('c_'), participants: ids, lastMessage: '', lastMessageAt: Date.now(), createdAt: Date.now() }; conversations.push(c); messages[c.id] = []; }
      return c;
    },
    async listUserConvs(userId) {
      return conversations.filter(c => c.participants.includes(userId)).sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    },
    async getConv(id) { return findById(conversations, id); },
    async addMessage(convId, msg) {
      messages[convId] = messages[convId] || [];
      messages[convId].push(msg);
      const c = findById(conversations, convId);
      if (c) { c.lastMessage = msg.content; c.lastMessageAt = msg.timestamp; }
      return msg;
    },
    async listMessages(convId) { return messages[convId] || []; },
    // Favorite
    async toggleFavorite(userId, postId) {
      const idx = favorites.findIndex(f => f.userId === userId && f.postId === postId);
      if (idx >= 0) { favorites.splice(idx, 1); return { favorited: false }; }
      favorites.push({ id: genId('f_'), userId, postId }); return { favorited: true };
    },
    async isFavorited(userId, postId) { return favorites.some(f => f.userId === userId && f.postId === postId); },
    async listUserFavorites(userId) {
      return favorites.filter(f => f.userId === userId).map(f => findById(posts, f.postId)).filter(Boolean);
    },
    // Report
    async createReport(data) { const r = { id: genId('r_'), ...data, createdAt: Date.now() }; reports.push(r); return r; },
    async listReports() { return [...reports].sort((a, b) => b.createdAt - a.createdAt); },
    // Coupon
    async createCoupon(data) { const c = { id: genId('cp_'), ...data, status: 'unused', createdAt: Date.now() }; coupons.push(c); return c; },
    async listUserCoupons(userId, filter = {}) {
      let list = coupons.filter(c => c.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
      if (filter.status) list = list.filter(c => c.status === filter.status);
      if (filter.source) list = list.filter(c => c.source === filter.source);
      return list;
    },
    async getCoupon(id) { return findById(coupons, id); },
    async updateCoupon(id, patch) { Object.assign(findById(coupons, id) || {}, patch); return findById(coupons, id); },
    async listCoupons(filter = {}) {
      let list = [...coupons].sort((a, b) => b.createdAt - a.createdAt);
      if (filter.userId) list = list.filter(c => c.userId === filter.userId);
      if (filter.status) list = list.filter(c => c.status === filter.status);
      return list;
    },
    // Package
    async createPackage(data) { const p = { id: genId('pkg_'), ...data, enabled: true, createdAt: Date.now() }; packages.push(p); return p; },
    async listPackages(filter = {}) {
      let list = [...packages].sort((a, b) => (a.sort || 0) - (b.sort || 0));
      if (filter.enabled != null) list = list.filter(p => p.enabled === filter.enabled);
      return list;
    },
    async getPackage(id) { return findById(packages, id); },
    async updatePackage(id, patch) { Object.assign(findById(packages, id) || {}, patch); return findById(packages, id); },
    async deletePackage(id) { const idx = packages.findIndex(p => p.id === id); if (idx >= 0) packages.splice(idx, 1); },
    // Order
    async createOrder(data) { const o = { id: genId('o_'), ...data, status: 'pending', createdAt: Date.now() }; orders.unshift(o); return o; },
    async listUserOrders(userId) { return orders.filter(o => o.userId === userId).sort((a, b) => b.createdAt - a.createdAt); },
    async getOrder(id) { return findById(orders, id); },
    async updateOrder(id, patch) { Object.assign(findById(orders, id) || {}, patch); return findById(orders, id); },
    async listOrders(filter = {}) {
      let list = [...orders].sort((a, b) => b.createdAt - a.createdAt);
      if (filter.status) list = list.filter(o => o.status === filter.status);
      return list;
    },
    // Inspection ticket
    async createTicket(data) { const t = { id: genId('t_'), ...data, status: 'pending', createdAt: Date.now() }; tickets.push(t); return t; },
    async listUserTickets(userId) { return tickets.filter(t => t.userId === userId).sort((a, b) => b.createdAt - a.createdAt); },
    async getTicket(id) { return findById(tickets, id); },
    async updateTicket(id, patch) { Object.assign(findById(tickets, id) || {}, patch); return findById(tickets, id); },
    async listTickets(filter = {}) {
      let list = [...tickets].sort((a, b) => b.createdAt - a.createdAt);
      if (filter.status) list = list.filter(t => t.status === filter.status);
      return list;
    },
    // Config
    async setConfig(key, value) { configs[key] = { key, value, updatedAt: Date.now() }; },
    async getConfig(key) { return configs[key]?.value; },
    async getConfigs() { return Object.fromEntries(Object.entries(configs).map(([k, v]) => [k, v.value])); },
    // Sensitive words
    async addSensitiveWord(word) { if (!sensitiveWords.includes(word)) sensitiveWords.push(word); },
    async removeSensitiveWord(word) { const idx = sensitiveWords.indexOf(word); if (idx >= 0) sensitiveWords.splice(idx, 1); },
    async listSensitiveWords() { return [...sensitiveWords]; },
    async checkSensitive(text) {
      if (!text) return null;
      const t = String(text).toLowerCase();
      return sensitiveWords.find(w => t.includes(w.toLowerCase())) || null;
    },
    // Invite
    async createInviteRecord(data) { const r = { id: genId('ir_'), ...data, createdAt: Date.now() }; inviteRecords.push(r); return r; },
    async listInviteRecords(filter = {}) {
      let list = [...inviteRecords].sort((a, b) => b.createdAt - a.createdAt);
      if (filter.inviterId) list = list.filter(r => r.inviterId === filter.inviterId);
      if (filter.date) list = list.filter(r => r.date === filter.date);
      return list;
    },
    async countInvitesToday(inviterId) {
      const ds = dayStart();
      return inviteRecords.filter(r => r.inviterId === inviterId && r.createdAt >= ds).length;
    },
    async findInviteRecord(filter) {
      return inviteRecords.find(r => {
        for (const k of Object.keys(filter)) if (r[k] !== filter[k]) return false;
        return true;
      });
    },
  };
}

// ---------- MongoDB 存储 ----------
async function createMongoStore(uri) {
  const mongoose = require('mongoose');
  await mongoose.connect(uri);

  const UserSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    phone: { type: String, unique: true, sparse: true },
    openid: { type: String, unique: true, sparse: true },
    pwd: String, nickname: String, avatar: String,
    verifyStatus: { type: String, enum: ['unverified', 'pending', 'approved', 'rejected'], default: 'unverified' },
    realName: String, idCard: String,
    isAdmin: { type: Boolean, default: false },
    isRealMerchant: { type: Boolean, default: false },
    dailyFreeTopUsedAt: { type: Number, default: 0 },
    agreedAt: { type: Number, default: 0 },
    parentId: String,
    createdAt: { type: Number, default: Date.now },
  });
  const PostSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    userId: String, type: String, title: String, description: String,
    images: [String], category: String, location: String, price: String, unit: String,
    contactName: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectReason: String, views: { type: Number, default: 0 },
    isTop: { type: Boolean, default: false },
    topExpireAt: { type: Number, default: 0 },
    topSource: { type: String, enum: ['normal', 'coupon', 'merchant', ''], default: '' },
    topAuditStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
    createdAt: { type: Number, default: Date.now },
  });
  const ConvSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    participants: [String], lastMessage: String,
    lastMessageAt: { type: Number, default: Date.now },
    createdAt: { type: Number, default: Date.now },
  });
  const MsgSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    conversationId: String, senderId: String, content: String, images: [String],
    timestamp: { type: Number, default: Date.now },
  });
  const FavSchema = new mongoose.Schema({ userId: String, postId: String, createdAt: { type: Number, default: Date.now } });
  const ReportSchema = new mongoose.Schema({ userId: String, targetType: String, targetId: String, reason: String, createdAt: { type: Number, default: Date.now } });
  const CouponSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    userId: String, source: String, status: { type: String, enum: ['unused', 'used', 'expired', 'void'], default: 'unused' },
    days: { type: Number, default: 7 },
    expireAt: { type: Number, default: 0 },
    relatedPostId: String,
    createdAt: { type: Number, default: Date.now },
  });
  const PackageSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    name: String, description: String, price: { type: Number, default: 0 },
    couponDays: { type: Number, default: 7 }, enabled: { type: Boolean, default: true },
    sort: { type: Number, default: 0 }, createdAt: { type: Number, default: Date.now },
  });
  const OrderSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    userId: String, packageId: String, packageName: String, packagePrice: Number,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    paymentProof: String,
    reviewedAt: { type: Number, default: 0 },
    createdAt: { type: Number, default: Date.now },
  });
  const TicketSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    userId: String, contactName: String, phone: String, address: String,
    category: String, remark: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectReason: String,
    createdAt: { type: Number, default: Date.now },
  });
  const ConfigSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed, updatedAt: { type: Number, default: Date.now } });
  const SensitiveSchema = new mongoose.Schema({ word: { type: String, unique: true } });
  const InviteRecordSchema = new mongoose.Schema({
    id: { type: String, unique: true, index: true },
    inviterId: String, inviteeId: String, openid: String, date: String,
    couponIssued: { type: Boolean, default: false }, createdAt: { type: Number, default: Date.now },
  });

  const User = mongoose.model('User', UserSchema);
  const Post = mongoose.model('Post', PostSchema);
  const Conv = mongoose.model('Conv', ConvSchema);
  const Msg = mongoose.model('Msg', MsgSchema);
  const Fav = mongoose.model('Fav', FavSchema);
  const Report = mongoose.model('Report', ReportSchema);
  const Coupon = mongoose.model('Coupon', CouponSchema);
  const Package = mongoose.model('Package', PackageSchema);
  const Order = mongoose.model('Order', OrderSchema);
  const Ticket = mongoose.model('Ticket', TicketSchema);
  const Config = mongoose.model('Config', ConfigSchema);
  const Sensitive = mongoose.model('Sensitive', SensitiveSchema);
  const InviteRecord = mongoose.model('InviteRecord', InviteRecordSchema);

  const leanDoc = (doc) => {
    if (!doc) return null;
    const { _id, __v, ...r } = doc;
    return r;
  };
  const leanList = (list) => list.map(leanDoc);

  return {
    mode: 'mongo',
    async createUser(d) { const u = new User({ ...d, id: d.id || genId('u_') }); await u.save(); return leanDoc(u.toObject()); },
    async findUserByPhone(phone) { return leanDoc(await User.findOne({ phone }).lean()); },
    async findUserById(id) { return leanDoc(await User.findOne({ id }).lean()); },
    async findUserByOpenid(openid) { return leanDoc(await User.findOne({ openid }).lean()); },
    async updateUser(id, patch) { return leanDoc(await User.findOneAndUpdate({ id }, patch, { new: true }).lean()); },
    async listUsers(filter = {}) {
      const q = {};
      if (filter.q) q.$or = [{ phone: new RegExp(filter.q, 'i') }, { nickname: new RegExp(filter.q, 'i') }];
      return leanList(await User.find(q).sort({ createdAt: -1 }).lean());
    },
    async listPosts({ type, location, q, status = 'approved', userId }) {
      const filter = { status };
      if (type && type !== 'all') filter.type = type;
      if (location) filter.location = new RegExp(location, 'i');
      if (userId) filter.userId = userId;
      if (q) filter.$or = [{ title: new RegExp(q, 'i') }, { description: new RegExp(q, 'i') }];
      return leanList(await Post.find(filter).sort({ createdAt: -1 }).lean());
    },
    async getPost(id) { const p = await Post.findOneAndUpdate({ id }, { $inc: { views: 1 } }, { new: true }).lean(); return leanDoc(p); },
    async getPostRaw(id) { return leanDoc(await Post.findOne({ id }).lean()); },
    async createPost(d) { const p = new Post({ ...d, id: d.id || genId('p_'), status: 'approved' }); await p.save(); return leanDoc(p.toObject()); },
    async updatePost(id, patch) { return leanDoc(await Post.findOneAndUpdate({ id }, patch, { new: true }).lean()); },
    async deletePost(id) { await Post.deleteOne({ id }); },
    async listUserPosts(userId) { return leanList(await Post.find({ userId }).sort({ createdAt: -1 }).lean()); },
    async listAllPosts(filter = {}) {
      const q = {};
      if (filter.status) q.status = filter.status;
      if (filter.q) q.$or = [{ title: new RegExp(filter.q, 'i') }, { description: new RegExp(filter.q, 'i') }];
      return leanList(await Post.find(q).sort({ createdAt: -1 }).lean());
    },
    async getOrCreateConv(ids) {
      const sorted = [...ids].sort();
      let c = await Conv.findOne({ participants: sorted }).lean();
      if (!c) { c = new Conv({ id: genId('c_'), participants: ids }); await c.save(); c = c.toObject(); }
      return leanDoc(c);
    },
    async listUserConvs(userId) { return leanList(await Conv.find({ participants: userId }).sort({ lastMessageAt: -1 }).lean()); },
    async getConv(id) { return leanDoc(await Conv.findOne({ id }).lean()); },
    async addMessage(convId, msg) { const m = new Msg({ ...msg, id: msg.id || genId('m_') }); await m.save(); await Conv.findOneAndUpdate({ id: convId }, { lastMessage: msg.content, lastMessageAt: msg.timestamp }); return leanDoc(m.toObject()); },
    async listMessages(convId) { return leanList(await Msg.find({ conversationId: convId }).sort({ timestamp: 1 }).lean()); },
    async toggleFavorite(userId, postId) {
      const d = await Fav.findOne({ userId, postId });
      if (d) { await Fav.deleteOne({ _id: d._id }); return { favorited: false }; }
      await Fav.create({ userId, postId }); return { favorited: true };
    },
    async isFavorited(userId, postId) { return (await Fav.findOne({ userId, postId })) != null; },
    async listUserFavorites(userId) {
      const favs = await Fav.find({ userId }).lean();
      const ids = favs.map(f => f.postId);
      return leanList(await Post.find({ id: { $in: ids } }).lean());
    },
    async createReport(d) { const r = await Report.create(d); return { id: r._id.toString() }; },
    async listReports() { return leanList(await Report.find().sort({ createdAt: -1 }).lean()); },
    async createCoupon(d) { const c = await Coupon.create({ ...d, id: d.id || genId('cp_') }); return leanDoc(c.toObject()); },
    async listUserCoupons(userId, filter = {}) {
      const q = { userId };
      if (filter.status) q.status = filter.status;
      if (filter.source) q.source = filter.source;
      return leanList(await Coupon.find(q).sort({ createdAt: -1 }).lean());
    },
    async getCoupon(id) { return leanDoc(await Coupon.findOne({ id }).lean()); },
    async updateCoupon(id, patch) { return leanDoc(await Coupon.findOneAndUpdate({ id }, patch, { new: true }).lean()); },
    async listCoupons(filter = {}) {
      const q = {};
      if (filter.userId) q.userId = filter.userId;
      if (filter.status) q.status = filter.status;
      return leanList(await Coupon.find(q).sort({ createdAt: -1 }).lean());
    },
    async createPackage(d) { const p = await Package.create({ ...d, id: d.id || genId('pkg_') }); return leanDoc(p.toObject()); },
    async listPackages(filter = {}) {
      const q = {};
      if (filter.enabled != null) q.enabled = filter.enabled;
      return leanList(await Package.find(q).sort({ sort: 1 }).lean());
    },
    async getPackage(id) { return leanDoc(await Package.findOne({ id }).lean()); },
    async updatePackage(id, patch) { return leanDoc(await Package.findOneAndUpdate({ id }, patch, { new: true }).lean()); },
    async deletePackage(id) { await Package.deleteOne({ id }); },
    async createOrder(d) { const o = await Order.create({ ...d, id: d.id || genId('o_') }); return leanDoc(o.toObject()); },
    async listUserOrders(userId) { return leanList(await Order.find({ userId }).sort({ createdAt: -1 }).lean()); },
    async getOrder(id) { return leanDoc(await Order.findOne({ id }).lean()); },
    async updateOrder(id, patch) { return leanDoc(await Order.findOneAndUpdate({ id }, patch, { new: true }).lean()); },
    async listOrders(filter = {}) {
      const q = {};
      if (filter.status) q.status = filter.status;
      return leanList(await Order.find(q).sort({ createdAt: -1 }).lean());
    },
    async createTicket(d) { const t = await Ticket.create({ ...d, id: d.id || genId('t_') }); return leanDoc(t.toObject()); },
    async listUserTickets(userId) { return leanList(await Ticket.find({ userId }).sort({ createdAt: -1 }).lean()); },
    async getTicket(id) { return leanDoc(await Ticket.findOne({ id }).lean()); },
    async updateTicket(id, patch) { return leanDoc(await Ticket.findOneAndUpdate({ id }, patch, { new: true }).lean()); },
    async listTickets(filter = {}) {
      const q = {};
      if (filter.status) q.status = filter.status;
      return leanList(await Ticket.find(q).sort({ createdAt: -1 }).lean());
    },
    async setConfig(key, value) { await Config.findOneAndUpdate({ key }, { key, value, updatedAt: Date.now() }, { upsert: true }); },
    async getConfig(key) { const c = await Config.findOne({ key }).lean(); return c ? c.value : undefined; },
    async getConfigs() { return Object.fromEntries((await Config.find().lean()).map(c => [c.key, c.value])); },
    async addSensitiveWord(word) { await Sensitive.updateOne({ word }, { word }, { upsert: true }); },
    async removeSensitiveWord(word) { await Sensitive.deleteOne({ word }); },
    async listSensitiveWords() { return (await Sensitive.find().lean()).map(s => s.word); },
    async checkSensitive(text) {
      if (!text) return null;
      const words = await this.listSensitiveWords();
      const t = String(text).toLowerCase();
      return words.find(w => t.includes(w.toLowerCase())) || null;
    },
    async createInviteRecord(d) { const r = await InviteRecord.create({ ...d, id: d.id || genId('ir_') }); return leanDoc(r.toObject()); },
    async listInviteRecords(filter = {}) {
      const q = {};
      if (filter.inviterId) q.inviterId = filter.inviterId;
      if (filter.date) q.date = filter.date;
      return leanList(await InviteRecord.find(q).sort({ createdAt: -1 }).lean());
    },
    async countInvitesToday(inviterId) {
      const ds = dayStart();
      return await InviteRecord.countDocuments({ inviterId, createdAt: { $gte: ds } });
    },
    async findInviteRecord(filter) { return leanDoc(await InviteRecord.findOne(filter).lean()); },
  };
}

// ---------- 演示数据 & 默认配置 ----------
async function ensureDemoData() {
  // 默认敏感词
  const defaults = ['赌博', '毒品', '色情', '翻墙', '代孕', '发票', '枪支', '假币'];
  for (const w of defaults) await store.addSensitiveWord(w);

  // 默认配置
  const cfg = {
    csUid: 'u_cs',
    icp: '粤ICP备XXXXXXXX号',
    userAgreement: '《用户协议》内容：请遵守法律法规，发布真实信息。',
    privacyPolicy: '《隐私政策》内容：我们仅收集必要的手机号与微信openid用于登录。',
    autoApproveTopCoupon: true,
    autoApproveTopMerchant: true,
    inviteDailyCap: 5,
    couponExpireDays: 30,
  };
  for (const [k, v] of Object.entries(cfg)) {
    const cur = await store.getConfig(k);
    if (cur === undefined) await store.setConfig(k, v);
  }

  // 客服账号
  let cs = await store.findUserById('u_cs');
  if (!cs) {
    cs = await store.createUser({ id: 'u_cs', phone: '19999999999', nickname: '平台客服', openid: '', avatar: '', verifyStatus: 'approved', isAdmin: true, createdAt: Date.now() });
  }

  // 管理员账号
  let admin = await store.findUserByPhone('13800000000');
  if (!admin) {
    admin = await store.createUser({ id: 'u_admin', phone: '13800000000', nickname: '管理员', pwd: md5('123456'), isAdmin: true, verifyStatus: 'approved', createdAt: Date.now() });
  } else if (!admin.isAdmin) {
    await store.updateUser(admin.id, { isAdmin: true });
  }

  // 演示普通用户
  let demo = await store.findUserByPhone('13900000000');
  if (!demo) {
    demo = await store.createUser({ id: 'u_demo', phone: '13900000000', nickname: '商家阿明', pwd: md5('123456'), verifyStatus: 'approved', createdAt: Date.now() });
  }

  // 演示置顶券
  const coupons = await store.listUserCoupons(demo.id, { status: 'unused' });
  if (!coupons.length) {
    await store.createCoupon({ userId: demo.id, source: 'manual', days: 7, expireAt: Date.now() + 30 * 86400_000 });
  }

  // 演示套餐
  const pkgs = await store.listPackages();
  if (!pkgs.length) {
    await store.createPackage({ id: 'pkg_1', name: '7天置顶券×3张', description: '购买后获得3张7天置顶券', price: 99, couponDays: 7, sort: 1 });
    await store.createPackage({ id: 'pkg_2', name: '7天置顶券×10张', description: '购买后获得10张7天置顶券', price: 299, couponDays: 7, sort: 2 });
  }

  // 演示帖子
  const posts = await store.listAllPosts({});
  if (!posts.length) {
    await store.createPost({
      id: 'p1', userId: demo.id, type: 'supply',
      title: '优质大红皮 陈香浓郁 现货供应',
      description: '现有一批大红皮现货，干仓储存，香气醇厚，适合收藏与贸易。欢迎联系看货。',
      images: [], category: '大红皮', location: '新会', price: '1280', unit: '斤',
      contactName: '商家阿明', status: 'approved', views: 156,
      isTop: true, topExpireAt: Date.now() + 7 * 86400_000, topSource: 'coupon', topAuditStatus: 'approved',
    });
    await store.createPost({
      id: 'p2', userId: demo.id, type: 'demand',
      title: '求购三江产区一批货',
      description: '长期采购三江产区一批货，年份不限，量大批优先。',
      images: [], category: '求购', location: '江门', price: '面议', unit: '',
      contactName: '新会老李', status: 'approved', views: 88,
    });
  }
}

// ---------- 中间件 ----------
async function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    const { uid } = jwt.verify(token, JWT_SECRET);
    const u = await store.findUserById(uid);
    if (!u) return res.status(401).json({ error: '用户不存在' });
    req.user = u;
    next();
  } catch (e) { res.status(401).json({ error: 'token 无效' }); }
}

async function adminMiddleware(req, res, next) {
  await authMiddleware(req, res, () => {
    if (!req.user.isAdmin) return res.status(403).json({ error: '无权限' });
    next();
  });
}

// ---------- 微信登录工具 ----------
async function wxCode2Session(code) {
  if (!WX_APPID || !WX_SECRET) {
    // 未配置真实微信参数，使用 mock openid
    return { openid: 'mock_' + md5(code || 'empty').slice(0, 16), session_key: '' };
  }
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=${WX_SECRET}&js_code=${code}&grant_type=authorization_code`;
  const fetch = (await import('node-fetch')).default;
  const r = await fetch(url);
  const data = await r.json();
  if (data.errcode) throw new Error(data.errmsg || '微信授权失败');
  return { openid: data.openid, session_key: data.session_key };
}

async function issueInviteCoupon(inviterId, inviteeId, openid) {
  if (!inviterId) return;
  // 同一 openid 只计一次
  const existed = await store.findInviteRecord({ openid });
  if (existed) return;
  const cap = Number(await store.getConfig('inviteDailyCap') || 5);
  const todayCount = await store.countInvitesToday(inviterId);
  if (todayCount >= cap) return;
  const couponDays = 7;
  const expireDays = Number(await store.getConfig('couponExpireDays') || 30);
  const now = Date.now();
  await store.createCoupon({ userId: inviterId, source: 'invite', days: couponDays, expireAt: now + expireDays * 86400_000 });
  await store.createInviteRecord({ inviterId, inviteeId, openid, date: new Date(now).toISOString().slice(0, 10), couponIssued: true });
}

// ---------- 过期置顶清理 ----------
async function expireTopPosts() {
  const now = Date.now();
  const all = await store.listAllPosts({});
  for (const p of all) {
    if (p.isTop && p.topExpireAt && p.topExpireAt < now) {
      await store.updatePost(p.id, { isTop: false, topExpireAt: 0, topSource: '', topAuditStatus: 'none' });
    }
  }
}

// ---------- 公开配置 ----------
app.get('/api/config', async (req, res) => {
  const cfg = await store.getConfigs();
  res.json({
    csUid: cfg.csUid || 'u_cs',
    icp: cfg.icp || '',
    userAgreement: cfg.userAgreement || '',
    privacyPolicy: cfg.privacyPolicy || '',
  });
});

// ---------- 认证 ----------
app.post('/api/auth/wechat', async (req, res) => {
  const { code, phone, inviterId, agree } = req.body || {};
  if (!agree) return res.status(400).json({ error: '请先同意用户协议和隐私政策' });
  try {
    const wx = await wxCode2Session(code);
    let user = await store.findUserByOpenid(wx.openid);
    if (!user) {
      const uid = genId('u_');
      user = await store.createUser({
        id: uid, openid: wx.openid,
        phone: phone || '',
        nickname: `微信用户${uid.slice(-4)}`,
        avatar: '', verifyStatus: 'unverified', agreedAt: Date.now(),
        parentId: inviterId || '',
      });
      if (inviterId) await issueInviteCoupon(inviterId, user.id, wx.openid);
    }
    if (!user.agreedAt) await store.updateUser(user.id, { agreedAt: Date.now() });
    res.json({ token: signToken(user.id), user: publicUser(user) });
  } catch (e) { res.status(400).json({ error: e.message || '微信登录失败' }); }
});

app.post('/api/auth/phone', async (req, res) => {
  const { phone, password, inviterId, agree } = req.body || {};
  if (!agree) return res.status(400).json({ error: '请先同意用户协议和隐私政策' });
  if (!phone) return res.status(400).json({ error: '手机号必填' });
  let user = await store.findUserByPhone(phone);
  if (!user) {
    const uid = genId('u_');
    user = await store.createUser({
      id: uid, phone,
      nickname: `用户${phone.slice(-4)}`,
      pwd: password ? md5(password) : md5('123456'),
      verifyStatus: 'unverified', agreedAt: Date.now(),
      parentId: inviterId || '',
    });
    if (inviterId) await issueInviteCoupon(inviterId, user.id, 'phone_' + phone);
  } else if (password && user.pwd !== md5(password)) {
    return res.status(401).json({ error: '密码错误' });
  }
  if (!user.agreedAt) await store.updateUser(user.id, { agreedAt: Date.now() });
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

app.get('/api/auth/me', authMiddleware, (req, res) => res.json(publicUser(req.user)));

// ---------- 用户 ----------
app.patch('/api/users/me', authMiddleware, async (req, res) => {
  const { nickname, avatar } = req.body || {};
  const u = await store.updateUser(req.user.id, { nickname: nickname?.slice(0, 20), avatar });
  res.json(publicUser(u));
});

app.post('/api/users/verify', authMiddleware, async (req, res) => {
  const { realName, idCard } = req.body || {};
  if (!realName || !idCard) return res.status(400).json({ error: '姓名和身份证必填' });
  const u = await store.updateUser(req.user.id, { realName, idCard, verifyStatus: 'approved' });
  res.json(publicUser(u));
});

app.get('/api/users/profile/:id', authMiddleware, async (req, res) => {
  const u = await store.findUserById(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  res.json(publicUser(u));
});

// ---------- 图片上传 ----------
app.post('/api/images/upload', authMiddleware, upload.array('files', 4), (req, res) => {
  const urls = (req.files || []).map(f => `/uploads/${f.filename}`);
  res.json({ urls });
});

// ---------- 帖子 ----------
async function buildPostList(filter) {
  await expireTopPosts();
  const list = await store.listPosts({ ...filter, status: 'approved' });
  // 置顶优先，再按时间
  const sorted = list.sort((a, b) => {
    if (a.isTop !== b.isTop) return (b.isTop ? 1 : 0) - (a.isTop ? 1 : 0);
    return b.createdAt - a.createdAt;
  });
  const enriched = await Promise.all(sorted.map(async p => {
    const u = await store.findUserById(p.userId);
    return { ...p, publisherNickname: u?.nickname || '匿名', publisherVerified: u?.verifyStatus === 'approved', publisherRealMerchant: u?.isRealMerchant || false };
  }));
  return enriched;
}

app.get('/api/posts', async (req, res) => {
  const { type, location, q } = req.query;
  res.json(await buildPostList({ type, location, q }));
});

app.post('/api/posts/search', async (req, res) => {
  const { type, location, q } = req.body || {};
  res.json(await buildPostList({ type, location, q }));
});

app.get('/api/posts/mine', authMiddleware, async (req, res) => {
  const list = await store.listUserPosts(req.user.id);
  res.json(list);
});

app.get('/api/posts/favorites', authMiddleware, async (req, res) => {
  const list = await store.listUserFavorites(req.user.id);
  res.json(list);
});

app.get('/api/posts/:id', async (req, res) => {
  const p = await store.getPost(req.params.id);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  const u = await store.findUserById(p.userId);
  let favorited = false;
  try { favorited = req.headers.authorization ? (await store.isFavorited(jwt.verify(req.headers.authorization.slice(7), JWT_SECRET).uid, p.id)) : false; } catch {}
  res.json({ ...p, publisher: u ? publicUser(u) : null, favorited });
});

app.post('/api/posts', authMiddleware, async (req, res) => {
  const { type, title, description, images, category, location, price, unit } = req.body || {};
  if (!type || !title || !description) return res.status(400).json({ error: '类型、标题、描述必填' });
  const text = `${title} ${description}`;
  const hit = await store.checkSensitive(text);
  if (hit) return res.status(400).json({ error: `内容包含敏感词「${hit}」，请修改后重试` });
  const contactName = req.user.nickname;
  const p = await store.createPost({
    userId: req.user.id, type: type === 'demand' ? 'demand' : 'supply',
    title: String(title).slice(0, 80), description: String(description).slice(0, 2000),
    images: (images || []).slice(0, 4), category: category || '其他', location: location || '不限',
    price: price || '面议', unit: unit || '', contactName,
  });
  res.status(201).json(p);
});

app.patch('/api/posts/:id', authMiddleware, async (req, res) => {
  const p = await store.getPostRaw(req.params.id);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  if (p.userId !== req.user.id) return res.status(403).json({ error: '无权编辑' });
  const { title, description, images, category, location, price, unit } = req.body || {};
  const hit = await store.checkSensitive(`${title || ''} ${description || ''}`);
  if (hit) return res.status(400).json({ error: `内容包含敏感词「${hit}」，请修改后重试` });
  const updated = await store.updatePost(req.params.id, { title, description, images, category, location, price, unit });
  res.json(updated);
});

app.delete('/api/posts/:id', authMiddleware, async (req, res) => {
  const p = await store.getPostRaw(req.params.id);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  if (p.userId !== req.user.id && !req.user.isAdmin) return res.status(403).json({ error: '无权删除' });
  await store.deletePost(req.params.id);
  res.json({ ok: true });
});

app.post('/api/posts/:id/top', authMiddleware, async (req, res) => {
  const { mode, couponId } = req.body || {};
  const p = await store.getPostRaw(req.params.id);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  if (p.userId !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (p.status !== 'approved') return res.status(400).json({ error: '帖子未通过审核' });

  const now = Date.now();
  const oneDay = 86400_000;
  const sevenDays = 7 * oneDay;

  if (mode === 'coupon') {
    const coupon = await store.getCoupon(couponId);
    if (!coupon || coupon.userId !== req.user.id || coupon.status !== 'unused') return res.status(400).json({ error: '无效的置顶券' });
    if (coupon.expireAt && coupon.expireAt < now) return res.status(400).json({ error: '置顶券已过期' });
    const autoApprove = (await store.getConfig('autoApproveTopCoupon')) !== false;
    const update = {
      isTop: autoApprove, topExpireAt: autoApprove ? now + sevenDays : 0,
      topSource: 'coupon', topAuditStatus: autoApprove ? 'approved' : 'pending',
    };
    await store.updatePost(p.id, update);
    await store.updateCoupon(coupon.id, { status: 'used', relatedPostId: p.id });
    return res.json({ ok: true, status: autoApprove ? 'approved' : 'pending' });
  }

  if (mode === 'merchant') {
    if (!req.user.isRealMerchant) return res.status(403).json({ error: '仅真实商家可用' });
    const lastUseDay = dayStart(req.user.dailyFreeTopUsedAt || 0);
    if (lastUseDay === dayStart(now)) return res.status(400).json({ error: '今日免费置顶次数已用完，0点重置' });
    const autoApprove = (await store.getConfig('autoApproveTopMerchant')) !== false;
    await store.updateUser(req.user.id, { dailyFreeTopUsedAt: now });
    const update = {
      isTop: autoApprove, topExpireAt: autoApprove ? now + sevenDays : 0,
      topSource: 'merchant', topAuditStatus: autoApprove ? 'approved' : 'pending',
    };
    await store.updatePost(p.id, update);
    return res.json({ ok: true, status: autoApprove ? 'approved' : 'pending' });
  }

  // mode === 'normal' 或缺省：取消置顶
  await store.updatePost(p.id, { isTop: false, topExpireAt: 0, topSource: '', topAuditStatus: 'none' });
  res.json({ ok: true });
});

app.post('/api/posts/:id/favorite', authMiddleware, async (req, res) => {
  const r = await store.toggleFavorite(req.user.id, req.params.id);
  res.json(r);
});

app.post('/api/posts/:id/report', authMiddleware, async (req, res) => {
  const { reason } = req.body || {};
  if (!reason) return res.status(400).json({ error: '举报原因必填' });
  await store.createReport({ userId: req.user.id, targetType: 'post', targetId: req.params.id, reason: String(reason).slice(0, 200) });
  res.json({ ok: true });
});

// ---------- 会话 + 消息 ----------
app.post('/api/conversations', authMiddleware, async (req, res) => {
  const { otherUserId } = req.body || {};
  if (!otherUserId || otherUserId === req.user.id) return res.status(400).json({ error: '无效用户' });
  const conv = await store.getOrCreateConv([req.user.id, otherUserId]);
  res.json(conv);
});

app.get('/api/conversations', authMiddleware, async (req, res) => {
  const convs = await store.listUserConvs(req.user.id);
  const enriched = await Promise.all(convs.map(async c => {
    const otherId = c.participants.find(x => x !== req.user.id);
    const u = await store.findUserById(otherId);
    return { ...c, otherId, otherUser: u ? publicUser(u) : null };
  }));
  res.json(enriched);
});

app.get('/api/conversations/:id/messages', authMiddleware, async (req, res) => {
  const msgs = await store.listMessages(req.params.id);
  res.json(msgs);
});

// ---------- 置顶券 ----------
app.get('/api/coupons', authMiddleware, async (req, res) => {
  const list = await store.listUserCoupons(req.user.id, { status: 'unused' });
  const now = Date.now();
  const valid = list.filter(c => !c.expireAt || c.expireAt > now);
  res.json(valid);
});

app.get('/api/coupons/history', authMiddleware, async (req, res) => {
  const list = await store.listUserCoupons(req.user.id);
  res.json(list);
});

// ---------- 套餐 & 订单 ----------
app.get('/api/packages', authMiddleware, async (req, res) => {
  const list = await store.listPackages({ enabled: true });
  res.json(list);
});

app.post('/api/orders', authMiddleware, async (req, res) => {
  const { packageId } = req.body || {};
  const pkg = await store.getPackage(packageId);
  if (!pkg || !pkg.enabled) return res.status(404).json({ error: '套餐不存在' });
  if (!pkg.price) return res.status(400).json({ error: '该套餐暂不可购买' });
  const order = await store.createOrder({
    userId: req.user.id, packageId: pkg.id, packageName: pkg.name, packagePrice: pkg.price,
  });
  res.json({ order });
});

app.get('/api/orders', authMiddleware, async (req, res) => {
  const list = await store.listUserOrders(req.user.id);
  res.json(list);
});

app.post('/api/orders/:id/proof', authMiddleware, upload.single('file'), async (req, res) => {
  const order = await store.getOrder(req.params.id);
  if (!order || order.userId !== req.user.id) return res.status(404).json({ error: '订单不存在' });
  if (order.status !== 'pending') return res.status(400).json({ error: '订单状态不可上传' });
  const proof = req.file ? `/uploads/${req.file.filename}` : '';
  await store.updateOrder(order.id, { paymentProof: proof });
  res.json({ ok: true });
});

// ---------- 真实商家申请 ----------
app.post('/api/inspections', authMiddleware, async (req, res) => {
  const { contactName, phone, address, category, remark } = req.body || {};
  if (!contactName || !phone || !address) return res.status(400).json({ error: '联系人、电话、地址必填' });
  const t = await store.createTicket({
    userId: req.user.id, contactName, phone, address,
    category: category || '', remark: remark || '',
  });
  res.json({ ticket: t });
});

app.get('/api/inspections', authMiddleware, async (req, res) => {
  const list = await store.listUserTickets(req.user.id);
  res.json(list);
});

// ---------- 邀请 ----------
app.get('/api/invite/link', authMiddleware, async (req, res) => {
  // 返回带 inviterId 的 H5 链接
  const link = `${req.protocol}://${req.get('host')}/?inviter=${req.user.id}`;
  res.json({ link, uid: req.user.id });
});

app.get('/api/invite/records', authMiddleware, async (req, res) => {
  const list = await store.listInviteRecords({ inviterId: req.user.id });
  const count = list.filter(r => r.couponIssued).length;
  res.json({ list, couponCount: count });
});

// ---------- 管理后台 ----------
app.get('/api/admin/dashboard', adminMiddleware, async (req, res) => {
  const [users, posts, orders, tickets, reports, coupons] = await Promise.all([
    store.listUsers(), store.listAllPosts(), store.listOrders(), store.listTickets(), store.listReports(), store.listCoupons(),
  ]);
  res.json({
    counts: {
      users: users.length, posts: posts.length, pendingPosts: posts.filter(p => p.status === 'pending').length,
      orders: orders.length, pendingOrders: orders.filter(o => o.status === 'pending').length,
      tickets: tickets.length, pendingTickets: tickets.filter(t => t.status === 'pending').length,
      reports: reports.length, coupons: coupons.length,
    },
  });
});

// 后台：帖子管理
app.get('/api/admin/posts', adminMiddleware, async (req, res) => {
  const list = await store.listAllPosts({ status: req.query.status, q: req.query.q });
  const enriched = await Promise.all(list.map(async p => {
    const u = await store.findUserById(p.userId);
    return { ...p, publisher: u ? publicUser(u) : null };
  }));
  res.json(enriched);
});

app.patch('/api/admin/posts/:id', adminMiddleware, async (req, res) => {
  const patch = req.body || {};
  const p = await store.updatePost(req.params.id, patch);
  res.json(p);
});

app.post('/api/admin/posts/:id/top-audit', adminMiddleware, async (req, res) => {
  const { action } = req.body || {}; // approve / reject
  const p = await store.getPostRaw(req.params.id);
  if (!p) return res.status(404).json({ error: '帖子不存在' });
  if (action === 'approve') {
    await store.updatePost(p.id, { isTop: true, topExpireAt: Date.now() + 7 * 86400_000, topAuditStatus: 'approved' });
  } else {
    await store.updatePost(p.id, { isTop: false, topExpireAt: 0, topSource: '', topAuditStatus: 'rejected' });
  }
  res.json({ ok: true });
});

// 后台：用户管理
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
  const list = await store.listUsers({ q: req.query.q });
  res.json(list.map(publicUser));
});

app.patch('/api/admin/users/:id', adminMiddleware, async (req, res) => {
  const { isRealMerchant, isAdmin, banned } = req.body || {};
  const u = await store.updateUser(req.params.id, { isRealMerchant, isAdmin, banned });
  res.json(publicUser(u));
});

app.post('/api/admin/users/:id/coupons', adminMiddleware, async (req, res) => {
  const { days } = req.body || {};
  const u = await store.findUserById(req.params.id);
  if (!u) return res.status(404).json({ error: '用户不存在' });
  const expireDays = Number(await store.getConfig('couponExpireDays') || 30);
  const c = await store.createCoupon({
    userId: u.id, source: 'manual', days: days || 7,
    expireAt: Date.now() + expireDays * 86400_000,
  });
  res.json(c);
});

// 后台：考察工单
app.get('/api/admin/tickets', adminMiddleware, async (req, res) => {
  const list = await store.listTickets({ status: req.query.status });
  const enriched = await Promise.all(list.map(async t => {
    const u = await store.findUserById(t.userId);
    return { ...t, applicant: u ? publicUser(u) : null };
  }));
  res.json(enriched);
});

app.patch('/api/admin/tickets/:id', adminMiddleware, async (req, res) => {
  const { status, rejectReason } = req.body || {};
  const t = await store.updateTicket(req.params.id, { status, rejectReason: rejectReason || '' });
  if (status === 'approved') {
    await store.updateUser(t.userId, { isRealMerchant: true });
  }
  res.json(t);
});

// 后台：邀请流水
app.get('/api/admin/invites', adminMiddleware, async (req, res) => {
  const list = await store.listInviteRecords();
  const enriched = await Promise.all(list.map(async r => {
    const inviter = await store.findUserById(r.inviterId);
    const invitee = await store.findUserById(r.inviteeId);
    return { ...r, inviter: inviter ? publicUser(inviter) : null, invitee: invitee ? publicUser(invitee) : null };
  }));
  res.json(enriched);
});

// 后台：置顶券台账
app.get('/api/admin/coupons', adminMiddleware, async (req, res) => {
  const list = await store.listCoupons({ userId: req.query.userId, status: req.query.status });
  const enriched = await Promise.all(list.map(async c => {
    const u = await store.findUserById(c.userId);
    return { ...c, owner: u ? publicUser(u) : null };
  }));
  res.json(enriched);
});

app.patch('/api/admin/coupons/:id', adminMiddleware, async (req, res) => {
  const patch = req.body || {};
  const c = await store.updateCoupon(req.params.id, patch);
  res.json(c);
});

// 后台：套餐管理
app.get('/api/admin/packages', adminMiddleware, async (req, res) => {
  const list = await store.listPackages();
  res.json(list);
});

app.post('/api/admin/packages', adminMiddleware, async (req, res) => {
  const { name, description, price, couponDays, sort } = req.body || {};
  if (!name) return res.status(400).json({ error: '名称必填' });
  const p = await store.createPackage({ name, description: description || '', price: Number(price) || 0, couponDays: Number(couponDays) || 7, sort: Number(sort) || 0 });
  res.json(p);
});

app.patch('/api/admin/packages/:id', adminMiddleware, async (req, res) => {
  const patch = req.body || {};
  const p = await store.updatePackage(req.params.id, patch);
  res.json(p);
});

app.delete('/api/admin/packages/:id', adminMiddleware, async (req, res) => {
  await store.deletePackage(req.params.id);
  res.json({ ok: true });
});

// 后台：订单管理
app.get('/api/admin/orders', adminMiddleware, async (req, res) => {
  const list = await store.listOrders({ status: req.query.status });
  const enriched = await Promise.all(list.map(async o => {
    const u = await store.findUserById(o.userId);
    return { ...o, buyer: u ? publicUser(u) : null };
  }));
  res.json(enriched);
});

app.patch('/api/admin/orders/:id', adminMiddleware, async (req, res) => {
  const { status } = req.body || {};
  const order = await store.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  const pkg = await store.getPackage(order.packageId);
  if (status === 'approved' && pkg) {
    const expireDays = Number(await store.getConfig('couponExpireDays') || 30);
    for (let i = 0; i < (pkg.couponDays ? 1 : 0); i++) {
      await store.createCoupon({
        userId: order.userId, source: 'purchase', days: pkg.couponDays,
        expireAt: Date.now() + expireDays * 86400_000,
      });
    }
  }
  await store.updateOrder(order.id, { status, reviewedAt: Date.now() });
  res.json({ ok: true });
});

// 后台：举报管理
app.get('/api/admin/reports', adminMiddleware, async (req, res) => {
  const list = await store.listReports();
  const enriched = await Promise.all(list.map(async r => {
    const u = await store.findUserById(r.userId);
    let target = null;
    if (r.targetType === 'post') target = await store.getPostRaw(r.targetId);
    return { ...r, reporter: u ? publicUser(u) : null, target };
  }));
  res.json(enriched);
});

// 后台：配置
app.get('/api/admin/configs', adminMiddleware, async (req, res) => {
  const cfg = await store.getConfigs();
  res.json(cfg);
});

app.patch('/api/admin/configs', adminMiddleware, async (req, res) => {
  const patch = req.body || {};
  for (const [k, v] of Object.entries(patch)) await store.setConfig(k, v);
  res.json(await store.getConfigs());
});

// 后台：敏感词
app.get('/api/admin/sensitive', adminMiddleware, async (req, res) => {
  res.json(await store.listSensitiveWords());
});

app.post('/api/admin/sensitive', adminMiddleware, async (req, res) => {
  const { word } = req.body || {};
  if (!word) return res.status(400).json({ error: '词不能为空' });
  await store.addSensitiveWord(String(word).trim());
  res.json({ ok: true });
});

app.delete('/api/admin/sensitive/:word', adminMiddleware, async (req, res) => {
  await store.removeSensitiveWord(req.params.word);
  res.json({ ok: true });
});

// ---------- Socket.IO 实时聊天 ----------
const onlineUsers = new Map();
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('unauthorized'));
  try {
    const { uid } = jwt.verify(token, JWT_SECRET);
    socket.userId = uid;
    onlineUsers.set(socket.id, uid);
    next();
  } catch (e) { next(new Error('unauthorized')); }
});

io.on('connection', (socket) => {
  socket.on('conv:join', ({ convId }) => socket.join(convId));
  socket.on('conv:leave', ({ convId }) => socket.leave(convId));
  socket.on('chat:send', async ({ convId, content, images = [] }) => {
    if (!content || !String(content).trim()) return;
    const conv = await store.getConv(convId);
    if (!conv || !conv.participants.includes(socket.userId)) return;
    const msg = {
      id: genId('m_'),
      conversationId: convId, senderId: socket.userId,
      content: String(content).slice(0, 500),
      images: (images || []).slice(0, 4),
      timestamp: Date.now(),
    };
    await store.addMessage(convId, msg);
    io.to(convId).emit('chat:message', msg);
  });
  socket.on('disconnect', () => onlineUsers.delete(socket.id));
});

// ---------- 启动 ----------
(async () => {
  await initStore();
  server.listen(PORT, () => {
    console.log(`🐾 银洲汇合信息供需平台: http://localhost:${PORT}`);
    console.log(`演示账号: 13800000000 / 123456（管理员）`);
  });
})();
