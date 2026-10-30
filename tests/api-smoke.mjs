#!/usr/bin/env node
/**
 * 后端出口冒烟：不启动 DSH，直接用假 ctx 抓 handler 发请求。
 * 验证 /api/info、/api/calc、/api/csv 的形状与坏输入表现。
 */
import { Readable } from 'node:stream';
import { registerApi } from '../lib/api.js';

let handler = null;
registerApi({ webServer: { register: (o) => { handler = o.handler; } }, logger: { warn() {} } });
if (!handler) { console.error('❌ registerApi 没有注册 handler'); process.exit(1); }

function call(path, method = 'GET', body = null) {
  const req = Object.assign(Readable.from(body === null ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]), { method, url: path });
  const res = {
    code: 0, headers: null, body: '',
    writeHead(code, headers) { this.code = code; this.headers = headers; },
    end(s) { this.body = s; },
  };
  return handler(req, res).then(() => ({ code: res.code, json: (() => { try { return JSON.parse(res.body); } catch { return null; } })(), text: res.body }));
}

let pass = 0; let fail = 0;
const ok = (m) => { console.log('  ✅ ' + m); pass++; };
const bad = (m) => { console.log('  ❌ ' + m); fail++; };
const 断 = (cond, m) => cond ? ok(m) : bad(m);

// 1) info
{
  const r = await call('/dsh-legal-damages/api/info');
  断(r.code === 200 && r.json?.ok === true && r.json.version === '0.1.0', `GET /api/info → 200 + version 0.1.0`);
}
// 2) calc 形状
{
  const r = await call('/dsh-legal-damages/api/calc', 'POST', {
    type: 'injury',
    input: { medical: 12000, dailyIncome: 300, lostDays: 20, careDaily: 150, careDays: 10,
      nutritionDaily: 30, nutritionDays: 20, mealDaily: 50, hospitalDays: 15,
      disabilityBase: 40000, disabilityYears: 20, disabilityCoef: 10, mental: 5000, transport: 800 },
  });
  const j = r.json;
  const 形状对 = j?.ok === true && Array.isArray(j.items) && j.items.length === 8
    && j.items.every((i) => typeof i.name === 'string' && typeof i.formula === 'string' && typeof i.amount === 'number')
    && typeof j.total === 'number' && Array.isArray(j.notes) && j.notes.length > 0;
  断(形状对, 'POST /api/calc → {ok, items[{name,formula,amount}], total, notes[]}');
  断(Math.abs(j.total - 106650) < 0.005, `后端合计 106650.00（实得 ${j.total}）`);
}
// 3) 未知类型
{
  const r = await call('/dsh-legal-damages/api/calc', 'POST', { type: 'nope', input: {} });
  断(r.code === 200 && r.json?.ok === false && /不支持/.test(r.json.error), '未知类型 → ok:false 且说明可选类型');
}
// 4) 坏 JSON 不崩
{
  const r = await call('/dsh-legal-damages/api/calc', 'POST', '{这不是 JSON');
  断(r.code === 200 && r.json?.ok === false, '坏 JSON → ok:false，服务不崩');
}
// 5) 0 值拒绝
{
  const r = await call('/dsh-legal-damages/api/calc', 'POST', { type: 'interest', input: { principal: 0, rate: 6, start: '2024-01-01', end: '2024-06-01' } });
  断(r.json?.ok === false && /大于 0/.test(r.json.error), '本金 0 → 拒绝');
}
// 6) CSV 出口
{
  const r = await call('/dsh-legal-damages/api/csv', 'POST', { type: 'penalty', input: { base: 200000, rate: 20, actualLoss: 20000 } });
  断(r.json?.ok === true && r.json.csv.startsWith('\ufeff'), 'POST /api/csv → 带 BOM 的 CSV');
  断(/,40000\.00,/.test(r.json.csv) && /合计/.test(r.json.csv), 'CSV 含合计行与两位小数金额');
}

console.log(`\n  API 冒烟：通过 ${pass} · 失败 ${fail}`);
process.exit(fail ? 1 : 0);
