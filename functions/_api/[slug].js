// 音乐盒子 · Pages Functions 干净入口
// 作用：把 https://<本站>.pages.dev/_api/<slug> 透明转发给真正的 Worker
//        https://music-web-api.17721266011.workers.dev/_api/<slug>
//
// 为什么需要这一层（方法论 china-serverless-reachability）：
//   *.workers.dev 在国内被精准 DNS 投毒（解析到假 IP），无代理连不上；
//   而 *.pages.dev 解析干净。浏览器 -> pages.dev（干净）-> Cloudflare 服务端
//   再 fetch workers.dev（走 CF 自家 DNS，不经过国内投毒链路）-> 真 Worker。
//
// Worker 本身零改动，这里只是“干净的那一跳”。

const UPSTREAM = 'https://music-web-api.17721266011.workers.dev';

export const onRequest = async ({ request }) => {
  const url = new URL(request.url);
  const upstreamUrl = UPSTREAM + url.pathname + url.search;

  // 透传请求头，但去掉 Host（fetch 会用目标域名）
  const headers = new Headers(request.headers);
  headers.delete('host');

  const init = {
    method: request.method,
    headers,
    redirect: 'follow',
  };
  // GET/HEAD 没有 body
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(upstreamUrl, init);

  // 透传 Worker 的响应（已含 CORS / Content-Type / Range 等头）
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
};
