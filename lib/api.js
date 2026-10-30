/** dsh-legal-damages · 宿主出口（面板后端）
 *
 * 只做两件事：算（/api/calc）、报版本（/api/info）。
 * 计算在 lib/core.mjs，纯算术，不读文件、不联网、不落盘。
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { calc, buildCsv } from './core.mjs';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE = '/dsh-legal-damages';
const VERSION = (() => {
  try { return JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version || ''; }
  catch { return ''; }
})();

const 回 = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};

const 读体 = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const x of req) {
    size += x.length;
    if (size > 1024 * 1024) return null; // 1MB 上限：这是个计算器，不该有这么大的请求
    chunks.push(x);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
};

export function registerApi(ctx) {
  const handler = async (req, res) => {
    try {
      const u = new URL(req.url || '/', 'http://127.0.0.1');
      if (u.pathname === `${ROUTE}/api/info`) {
        return 回(res, 200, { ok: true, version: VERSION });
      }
      if (u.pathname === `${ROUTE}/api/calc` && req.method === 'POST') {
        const body = await 读体(req);
        if (body === null) return 回(res, 413, { ok: false, error: '请求体超过 1MB' });
        const type = body?.type ?? body?.input?.type ?? '';
        const input = body?.input && typeof body.input === 'object' ? body.input : body;
        const r = calc(type, input);
        if (!r.ok) return 回(res, 200, { ok: false, error: r.error });
        // 面板只要这几项；items 保留 formula/sub/basis 便于展开
        return 回(res, 200, {
          ok: true,
          type: r.type,
          title: r.title,
          items: r.items,
          total: r.total,
          notes: r.notes,
          pending: r.pending,
        });
      }
      if (u.pathname === `${ROUTE}/api/csv` && req.method === 'POST') {
        const body = await 读体(req);
        if (body === null) return 回(res, 413, { ok: false, error: '请求体超过 1MB' });
        const type = body?.type ?? body?.input?.type ?? '';
        const input = body?.input && typeof body.input === 'object' ? body.input : body;
        const r = calc(type, input);
        if (!r.ok) return 回(res, 200, { ok: false, error: r.error });
        return 回(res, 200, { ok: true, filename: `计算表-${r.title}.csv`, csv: buildCsv(r) });
      }
      return 回(res, 404, { ok: false, error: 'not found' });
    } catch (e) {
      return 回(res, 500, { ok: false, error: e?.message || String(e) });
    }
  };
  ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler });
}
