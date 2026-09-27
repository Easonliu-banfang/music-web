// Cloudflare Pages Function: /_api/audio?url=<encoded>
// 代理音乐 CDN 音频流，加 CORS 头
//
// 注意：Cloudflare Pages Functions 有 CPU 时间限制（默认 ~100ms CPU time），
// 但音频流式传输是 I/O 密集，不受 CPU 限制影响，可以正常流式播放。

export const onRequest = async ({ request, url }) => {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return json({ error: 'missing url' }, 400);
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer:
          targetUrl.includes('163.com')
            ? 'https://music.163.com/'
            : 'https://music.itzo.cn/',
        ...(request.headers.get('Range') ? { Range: request.headers.get('Range') } : {}),
      },
    });

    // 构造响应
    const headers = new Headers({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
      'Cache-Control': 'no-store',
    });

    // 透传 Content-Type
    const ct = upstream.headers.get('Content-Type');
    if (ct) headers.set('Content-Type', ct);

    // 透传长度/范围头（支持拖动播放进度）
    const cl = upstream.headers.get('Content-Length');
    if (cl) headers.set('Content-Length', cl);

    const ac = upstream.headers.get('Accept-Ranges');
    if (ac) headers.set('Accept-Ranges', ac);

    const cr = upstream.headers.get('Content-Range');
    if (cr) headers.set('Content-Range', cr);

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
