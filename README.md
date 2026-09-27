# 🎵 音乐盒子 · 多音源聚合播放器

一个**多音源聚合**的网页版音乐播放器。基于 `music.itzo.cn` 的公开 API 聚合网易云、QQ、酷狗、酷我等源，通过自建代理解决 CDN CORS 限制，浏览器直接播放。

## 🚀 本地运行（30 秒）

```bash
cd music-web
python3 server.py
```

浏览器打开：**http://localhost:8765**

**只依赖 Python 3.6+ 标准库**，零外部依赖，不用 pip install。

## 🌐 部署到 Cloudflare Pages（公开发布）

想要一个**公开的免费 URL 让所有人听**？5 分钟搞定。

### 步骤

1. **建 GitHub 仓库**
   ```bash
   # 把 music-web 目录推到 GitHub
   cd music-web
   git init
   git add .
   git commit -m "init"
   git branch -M main
   # 到 github.com 建空仓库 music-web，然后：
   git remote add origin git@github.com:你的账号/music-web.git
   git push -u origin main
   ```

2. **登录 Cloudflare**
   - 去 [dash.cloudflare.com](https://dash.cloudflare.com) 用 GitHub 账号登录
   - 免费档：100 万请求/月，100GB 流量/月，够个人和小群体用

3. **创建 Pages 项目**
   - Cloudflare 控制台 → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
   - 选你的 `music-web` 仓库
   - 配置：
     - **Framework preset**: `None`
     - **Build command**: 留空（无构建步骤，纯静态）
     - **Build output directory**: `public`
     - **Functions directory**: `functions`
   - 点 **Deploy site**

4. **拿到你的 URL**
   - 部署完成后 Cloudflare 会给一个 `https://<项目名>.pages.dev` 的地址
   - 分享给任何人打开就能听

### 成本

- ✅ **Cloudflare Pages 免费档**：每月 100 万请求 + 100GB 流量，个人项目绰绰有余
- ✅ **不消耗你任何配额**：不需要你的服务器、不需要域名（用 pages.dev 免费子域）

## 🎨 功能

- 🔍 **多源聚合搜索**：网易云、QQ、酷狗、咪咕等（部分源可能失效，见下方说明）
- ▶️ **完整播放控制**：播放/暂停、上一首、下一首、进度拖动
- 🎤 **同步歌词**：LRC 格式实时高亮，点击跳转
- 🎚️ **音量控制**
- ⌨️ **快捷键**：空格 播放/暂停 · ↑↓ 切歌 · ←→ 快退/快进
- 📱 **响应式**：手机/平板/电脑全适配
- 🌗 **毛玻璃 UI**：暗色主题 + 封面旋转

## 📡 音源说明

实测（2026-09）以下源的实际状态：

| 源 | 状态 | 说明 |
|---|---|---|
| **网易云** | ✅ 可用 | 大部分主流歌曲能返回 URL |
| QQ 音乐 | ⚠️ 可能失效 | 平台接口改动频繁 |
| 酷狗 | ⚠️ 可能失效 | 同上 |
| 酷我 | ❌ 已失效 | 返回空数据 |
| 咪咕 | ⚠️ 可能失效 | 部分歌可用 |
| 虾米 | ❌ 平台已关 | |
| 百度 | ⚠️ 可能失效 | |
| 一听 | ⚠️ 可能失效 | |

**核心是网易云**，其他源作为补充。源失效是常态，因为音乐平台会不定期加固接口。

## ⚠️ 关于播放成功率

即使搜索到歌曲，也可能**无法播放**，原因：
1. **VIP 专属歌曲**：平台需要登录才能拿播放地址（返回 404）
2. **付费专辑**：需单独购买
3. **地区限制**：某些歌曲海外 CDN 拒绝访问
4. **CDN 变动**：网易云的 CDN 有时对 Referer 有严格要求

**遇到某首歌播不了 → 切换音源试试**，不同源的版权策略不同。

## 🔧 项目结构

```
music-web/
├── public/
│   └── index.html      # 前端播放器（单文件 HTML）
├── functions/          # Cloudflare Pages Functions
│   └── _api/
│       ├── search.js   # 搜索代理
│       └── audio.js    # 音频流代理
├── server.py           # 本地 Python 服务器（等价于上面的 Functions）
└── README.md
```

## 🛠️ 常见问题

**Q: 搜索不到歌？**
A: 试试换音源，或换关键词（比如"歌手名 歌名"）。

**Q: 播不了怎么办？**
A: 99% 是该歌曲需要 VIP。切换音源、或搜索相同歌名的其他版本。

**Q: 加载很慢？**
A: 网易云的 CDN 在境外访问较慢。如果部署在 Cloudflare Pages（境外服务器），国内用户访问可能慢——可以绑定国内备案域名提速。

**Q: 可以自定义音源吗？**
A: 修改 `index.html` 顶部的 `SOURCES` 数组，需要 API 有对应的接口。

## 📄 License

MIT
