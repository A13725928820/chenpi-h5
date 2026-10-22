// 纯供需信息展示平台 - 后端
// 平台不碰交易、不担保、不托管资金，仅提供信息发布 + 站内沟通
// 免费部署：Render 免费层 + 可选 MongoDB Atlas 免费层持久化
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const genId = () => 'p' + Math.random().toString(36).slice(2, 10);

// ---------- 数据存储层（MongoDB 优先，内存兜底） ----------
const SAMPLE_POSTS = [
  {
    id: 'p1', type: 'supply',
    title: '出 95新 MacBook Pro 14寸 M3',
    description: '自用一年，电池循环 80 次，原装充电器，箱说全。无拆无修，可面交验机。',
    category: '数码', contactName: '数码老王', price: '12000', location: '北京·海淀',
    createdAt: Date.now() - 3600_000,
  },
  {
    id: 'p2', type: 'demand',
    title: '求一台二手公路车，预算 3000-5000',
    description: '通勤+周末骑游，身高 175，希望车架 54 码，品牌优先捷安特/美利达/闪电。',
    category: '运动', contactName: '骑行小白', price: '3000-5000', location: '上海·浦东',
    createdAt: Date.now() - 7200_000,
  },
  {
    id: 'p3', type: 'supply',
    title: '提供 UI 设计外包服务',
    description: '5 年大厂设计经验，承接 APP/Web/小程序 UI 设计、图标、插画。价格合理，改到满意为止。',
    category: '服务', contactName: '设计师A酱', price: '面议', location: '远程',
    createdAt: Date.now() - 1800_000,
  },
  {
    id: 'p4', type: 'demand',
    title: '求租 1 室 1 厅，望京/酒仙桥附近',
    description: '预算 5000 以内，长租，不养宠物，作息规律。中介勿扰。',
    category: '房产', contactName: '北漂小张', price: '<5000/月', location: '北京·朝阳',
    createdAt: Date.now() - 900_000,
  },
];

let store;

// 内存存储
function createMemoryStore() {
  const posts = [...SAMPLE_POSTS];
  const messages = {};
  return {
    mode: 'memory',
    async listPosts({ type, q }) {
      let list = [...posts].sort((a, b) => b.createdAt - a.createdAt);
      if (type && type !== 'all') list = list.filter(p => p.type === type);
      if (q) {
        const kw = q.toLowerCase();
        list = list.filter(p =>
          p.title.toLowerCase().includes(kw) ||
          p.description.toLowerCase().includes(kw) ||
          p.category.toLowerCase().includes(kw)
        );
      }
      return list;
    },
    async getPost(id) { return posts.find(p => p.id === id) || null; },
    async createPost(data) {
      const post = { id: genId(), createdAt: Date.now(), ...data };
      posts.unshift(post);
      messages[post.id] = [];
      return post;
    },
    async getMessages(postId) { return messages[postId] || []; },
    async addMessage(postId, msg) {
      if (!messages[postId]) messages[postId] = [];
      messages[postId].push(msg);
      return msg;
    },
  };
}

// MongoDB 存储（mongoose）
async function createMongoStore(uri) {
  const mongoose = require('mongoose');
  await mongoose.connect(uri);
  console.log('✅ 已连接 MongoDB');

  const PostSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['supply', 'demand'], required: true },
    title: String, description: String, category: String,
    contactName: String, price: String, location: String,
    createdAt: { type: Number, default: Date.now },
  });
  const MessageSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, index: true },
    postId: { type: String, required: true, index: true },
    sender: String, content: String,
    timestamp: { type: Number, default: Date.now },
  });

  const Post = mongoose.model('Post', PostSchema);
  const Message = mongoose.model('Message', MessageSchema);

  // 首次启动若集合为空，灌入示例数据
  const count = await Post.countDocuments();
  if (count === 0) {
    await Post.insertMany(SAMPLE_POSTS);
    console.log('已灌入示例帖子');
  }

  const toObj = (doc) => doc ? doc.toObject({ versionKey: false, _id: false }) : null;

  return {
    mode: 'mongo',
    async listPosts({ type, q }) {
      const filter = {};
      if (type && type !== 'all') filter.type = type;
      if (q) {
        const kw = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { title: { $regex: kw, $options: 'i' } },
          { description: { $regex: kw, $options: 'i' } },
          { category: { $regex: kw, $options: 'i' } },
        ];
      }
      const docs = await Post.find(filter).sort({ createdAt: -1 }).lean();
      return docs.map(d => { const { __v, _id, ...r } = d; return r; });
    },
    async getPost(id) {
      const doc = await Post.findOne({ id }).lean();
      if (!doc) return null;
      const { __v, _id, ...r } = doc; return r;
    },
    async createPost(data) {
      const post = { id: genId(), createdAt: Date.now(), ...data };
      await Post.create(post);
      return post;
    },
    async getMessages(postId) {
      const docs = await Message.find({ postId }).sort({ timestamp: 1 }).lean();
      return docs.map(d => { const { __v, _id, ...r } = d; return r; });
    },
    async addMessage(postId, msg) {
      await Message.create(msg);
      return msg;
    },
  };
}

async function initStore() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      store = await createMongoStore(uri);
      return;
    } catch (e) {
      console.error('MongoDB 连接失败，回退到内存存储：', e.message);
    }
  }
  store = createMemoryStore();
}

// ---------- REST API ----------
app.get('/api/posts', async (req, res) => {
  const { type, q } = req.query;
  try {
    const list = await store.listPosts({ type, q });
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/posts/:id', async (req, res) => {
  const post = await store.getPost(req.params.id);
  if (!post) return res.status(404).json({ error: '帖子不存在' });
  res.json(post);
});

app.post('/api/posts', async (req, res) => {
  const { type, title, description, category, contactName, price, location } = req.body || {};
  if (!type || !title || !description || !contactName) {
    return res.status(400).json({ error: '类型、标题、描述、称呼必填' });
  }
  const data = {
    type: type === 'demand' ? 'demand' : 'supply',
    title: String(title).slice(0, 80),
    description: String(description).slice(0, 2000),
    category: category || '其他',
    contactName: String(contactName).slice(0, 20),
    price: price || '面议',
    location: location || '不限',
  };
  try {
    const post = await store.createPost(data);
    io.emit('post:new', post);
    res.status(201).json(post);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/posts/:id/messages', async (req, res) => {
  const list = await store.getMessages(req.params.id);
  res.json(list);
});

// ---------- WebSocket 聊天 ----------
io.on('connection', (socket) => {
  socket.on('chat:join', async ({ postId }) => {
    socket.join(postId);
    const history = await store.getMessages(postId);
    socket.emit('chat:history', history);
  });

  socket.on('chat:leave', ({ postId }) => socket.leave(postId));

  socket.on('chat:send', async ({ postId, sender, content }) => {
    if (!content || !String(content).trim()) return;
    const post = await store.getPost(postId);
    if (!post) return;
    const msg = {
      id: 'm' + Math.random().toString(36).slice(2, 10),
      postId,
      sender: String(sender).slice(0, 20) || '匿名',
      content: String(content).slice(0, 500),
      timestamp: Date.now(),
    };
    await store.addMessage(postId, msg);
    io.to(postId).emit('chat:message', msg);
  });
});

// ---------- 启动 ----------
const PORT = process.env.PORT || 3000;

(async () => {
  await initStore();
  console.log(`数据存储模式: ${store.mode}`);
  server.listen(PORT, () => {
    console.log(`供需告示墙已启动: http://localhost:${PORT}`);
  });
})();
