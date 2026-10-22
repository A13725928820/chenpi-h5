# 银洲汇合信息供需平台 · 完全免费部署指南

> 开源技术栈：Node.js + Express + Socket.IO + (可选) MongoDB
> 免费云平台：Render（Web 服务）+ MongoDB Atlas（可选持久化）

## 方案对比

| 方案 | 成本 | 数据持久化 | 休眠 | 适合场景 |
|------|------|-----------|------|---------|
| **A. Render 纯内存** | ¥0 | ❌ 重启/休眠清空 | 15min 无请求休眠 | 快速演示、原型 |
| **B. Render + MongoDB Atlas** | ¥0 | ✅ 持久化 | 同上 | 正式使用、长期运行 |

两个方案都完全免费。推荐方案 B（数据不丢）。

---

## 前置准备

1. 一个 **GitHub** 账号（免费）
2. 一个 **Render** 账号（免费，可用 GitHub 登录）：https://render.com
3. （方案 B）一个 **MongoDB Atlas** 账号（免费）：https://www.mongodb.com/cloud/atlas

---

## 第一步：把代码推到 GitHub

```bash
cd /workspace
git init
git add .
git commit -m "init: 银洲汇合信息供需平台"
git branch -M main
# 在 GitHub 新建一个空仓库，然后：
git remote add origin https://github.com/<你的用户名>/yinzhouhuihe-supply-demand.git
git push -u origin main
```

---

## 第二步：部署到 Render

### 方式一：用 render.yaml 一键部署（推荐）

1. 登录 Render → 右上角 **New +** → **Blueprint**
2. 选择你刚推送的 GitHub 仓库
3. Render 会自动读取 `render.yaml`，点击 **Apply**
4. 等待 1-2 分钟构建完成，Render 会给你一个 `https://xxx.onrender.com` 域名
5. 直接访问即可使用（此时为内存模式，重启数据清空）

### 方式二：手动新建 Web Service

1. Render → **New +** → **Web Service**
2. 连接 GitHub 仓库
3. 配置：
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node backend/server.js`
   - **Instance Type**: Free
4. 点击 **Create Web Service**

> ⚠️ Render 免费层特性：
> - 15 分钟无入站请求会自动休眠，下次访问需 30-50 秒冷启动
> - 每月 750 小时免费额度（单实例足够）
> - 自带 HTTPS 和 `*.onrender.com` 子域名

---

## 第三步（方案 B）：接入 MongoDB Atlas 免费持久化

### 1. 创建免费集群

1. 登录 MongoDB Atlas → **Build a Database**
2. 选择 **M0 Free**（512MB，永久免费）
3. 选一个离你近的区域（如 Singapore）
4. 点击 **Create Deployment**

### 2. 配置网络访问

1. 左侧 **Network Access** → **Add IP Address**
2. 选择 **Allow access from anywhere**（`0.0.0.0/0`）→ Confirm
   > Render 出口 IP 不固定，必须允许任意 IP

### 3. 创建数据库用户

1. 左侧 **Database Access** → **Add New Database User**
2. 用户名随便填（如 `boarduser`），密码用 **Autogenerate**，保存好密码
3. 角色选 **Read and write to any database**

### 4. 获取连接串

1. 回到 **Database** 页面 → 集群点 **Connect** → **Drivers**
2. 复制连接串，形如：
   ```
   mongodb+srv://boarduser:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
3. 把 `<password>` 替换为刚才的密码，并在末尾数据库名改为 `supply_board`：
   ```
   mongodb+srv://boarduser:你的密码@cluster0.xxxxx.mongodb.net/supply_board?retryWrites=true&w=majority
   ```

### 5. 在 Render 配置环境变量

1. Render 控制台 → 你的服务 → **Environment**
2. 点击 **Add Environment Variable**：
   - Key: `MONGODB_URI`
   - Value: 上面那串连接串
3. **Save Changes**，Render 会自动重新部署
4. 部署日志中看到 `✅ 已连接 MongoDB` 即成功

---

## 验证部署

1. 访问 `https://xxx.onrender.com`
2. 能看到预置帖子 → 前端正常
3. 点进帖子 → 聊天框发消息 → 消息实时出现 → WebSocket 正常
4. （方案 B）发新帖后刷新页面，帖子仍在 → 持久化正常

---

## 本地开发

```bash
npm install
node backend/server.js          # 内存模式
MONGODB_URI=你的连接串 node backend/server.js   # MongoDB 模式
```

访问 http://localhost:3000

---

## 环境变量说明

| 变量 | 必填 | 说明 |
|------|------|------|
| `MONGODB_URI` | 否 | MongoDB Atlas 连接串，不配则内存模式（重启清空） |
| `WECHAT_APPID` | 否 | 微信公众号/小程序 AppID，不配则走演示 mock 登录 |
| `WECHAT_SECRET` | 否 | 微信 App Secret |
| `JWT_SECRET` | 否 | JWT 签名密钥，不配则使用内置随机密钥 |
| `PORT` | 否 | 服务端口，默认 3000 |

## 成本总结

| 项目 | 费用 |
|------|------|
| 代码托管 (GitHub) | 免费 |
| Web 服务 (Render Free) | 免费 |
| 数据库 (MongoDB Atlas M0) | 免费 |
| 域名 (xxx.onrender.com) | 免费 |
| HTTPS 证书 | 免费（自动） |
| **合计** | **¥0 / 月** |

---

## 备选免费平台

如果 Render 不够用，以下平台也有免费额度，配置类似：

- **Railway**：每月 $5 免费额度，不休眠，额度用完才停
- **Koyeb**：1 个免费实例，支持 WebSocket
- **Fly.io**：3 台 256MB 免费实例，需绑定信用卡（不扣费）
