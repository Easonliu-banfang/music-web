// 音乐盒子 · API 代理 Worker
// 作用：替浏览器去 itzo.cn 搜歌 + 代理音频流（解决 CORS / HTTPS 混合内容 / Range 拖动）
// 部署：在 worker/ 目录执行 `wrangler deploy`（已通过 wrangler login 拿到 OAuth 凭据）
//
// 前端（GitHub Pages 静态站）通过以下两个端点调用本 Worker：
//   GET /_api/search?input=...&filter=name|id&type=netease|1ting&page=1  -> 转发到 itzo.cn
//   GET /_api/audio?url=<encoded 直链>                                  -> 代理音频（带 CORS + Range）
//
// 注意：前端用 GET + query 参数；本 Worker 内部把 search 转成 itzo 要的
// POST application/x-www-form-urlencoded 表单。itzo 契约：
//   filter = 搜索方式（name/id/url），type = 音源平台（netease/1ting/...）

const ITZO = 'https://music.itzo.cn/';

const UPSTREAM_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 跨域响应头：前端部署在 *.github.io，Worker 在 *.workers.dev，必须显式放开 CORS
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Type, Content-Range, Accept-Ranges',
};

function corsResponse(body, status = 200, extra = {}) {
  return new Response(body, { status, headers: { ...CORS, ...extra } });
}

// 把前端的 input/filter/type/page 组装成 itzo 要的表单 body
function buildItzoBody(params) {
  const input = params.get('input') || '';
  const filter = params.get('filter') || 'name';
  const type = params.get('type') || 'netease';
  const page = params.get('page') || '1';
  const enc = (s) => encodeURIComponent(s);
  return `input=${enc(input)}&filter=${enc(filter)}&type=${enc(type)}&page=${enc(page)}`;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 预检
    if (request.method === 'OPTIONS') return corsResponse(null, 204);

    // ---------- 搜索 ----------
    if (url.pathname === '/_api/search') {
      // 支持 GET(query) 与 POST(body)，统一转成 itzo 的 POST 表单
      let params;
      if (request.method === 'POST') {
        const text = await request.text();
        params = new URLSearchParams(text);
      } else {
        params = url.searchParams;
      }

      const body = buildItzoBody(params);
      const upstream = await fetch(ITZO, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': UPSTREAM_UA,
          'Referer': 'https://music.itzo.cn/',
          'Origin': 'https://music.itzo.cn/',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body,
      });
      const text = await upstream.text();
      return corsResponse(text, upstream.status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
      });
    }

    // ---------- 音频代理（流式，不缓冲） ----------
    if (url.pathname === '/_api/audio') {
      const raw = url.searchParams.get('url');
      if (!raw) {
        return corsResponse(JSON.stringify({ error: 'missing url' }), 400, {
          'Content-Type': 'application/json',
        });
      }

      // Cloudflare Worker 子请求只允许 HTTPS；itzo 返回的是 http:// 直链，统一升级
      let target = raw;
      if (target.startsWith('http://')) target = 'https://' + target.slice(7);

      // 网易云需要带自己的 Referer，否则 outer/url 会跳 404
      const referer = target.includes('163.com')
        ? 'https://music.163.com/'
        : 'https://music.itzo.cn/';

      const headers = { 'User-Agent': UPSTREAM_UA, Referer: referer };
      const range = request.headers.get('Range');
      if (range) headers['Range'] = range; // 转发 Range -> 支持进度条拖动

      const upstream = await fetch(target, { headers });
      // 直接把上游 body 流式转给浏览器，128MB 内存限制也扛得住
      const respHeaders = {
        ...CORS,
        'Content-Type': upstream.headers.get('Content-Type') || 'audio/mpeg',
        'Cache-Control': 'no-store',
      };
      const cl = upstream.headers.get('Content-Length');
      if (cl) respHeaders['Content-Length'] = cl;
      const ar = upstream.headers.get('Accept-Ranges');
      if (ar) respHeaders['Accept-Ranges'] = ar;
      const cr = upstream.headers.get('Content-Range');
      if (cr) respHeaders['Content-Range'] = cr;

      return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
    }

    return corsResponse(JSON.stringify({ error: 'not found' }), 404, {
      'Content-Type': 'application/json',
    });
  },
};
