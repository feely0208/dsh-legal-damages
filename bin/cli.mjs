#!/usr/bin/env node
/**
 * dsh-legal-damages —— 深鲸损害赔偿计算器（离线 CLI）
 *
 * 用法：
 *   dsh-legal-damages --type injury --medical 12000 --daily-income 300 --lost-days 20
 *   dsh-legal-damages --type labor --monthly-wage 8000 --work-years 3.5 --mode N
 *   dsh-legal-damages --type interest --principal 100000 --rate 6 --start 2024-01-01 --end 2024-12-31
 *   dsh-legal-damages --type interest --principal 100000 --segment 2024-01-01,2024-07-01,6 --segment 2024-07-01,2024-12-31,5
 *   dsh-legal-damages --type penalty --base 200000 --rate 20 --actual-loss 20000
 *   dsh-legal-damages --demo [--out 输出目录] [--json]
 *
 * 退出码：
 *   0  计算成功
 *   2  参数错误 / 校验不通过
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { calc, buildCsv, buildMarkdown, DEMO, TYPES, CATEGORY } from '../lib/core.mjs';

const args = process.argv.slice(2);
const has = (k) => args.includes('--' + k);
const val = (k, d = '') => {
  const i = args.indexOf('--' + k);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const all = (k) => {
  const out = [];
  args.forEach((a, i) => { if (a === '--' + k && args[i + 1] !== undefined) out.push(args[i + 1]); });
  return out;
};

if (has('help') || (!args.length && process.stdin.isTTY)) {
  console.log(`dsh-legal-damages —— 深鲸损害赔偿计算器

用法：
  dsh-legal-damages --type <injury|labor|interest|penalty> [参数...] [--out 目录] [--json]
  dsh-legal-damages --demo [--out 目录] [--json]

类型与参数：
  injury    --medical --daily-income --lost-days --care-daily --care-days
            --nutrition-daily --nutrition-days --meal-daily --hospital-days
            --disability-base --disability-years --disability-coef --mental --transport
  labor     --monthly-wage --work-years --mode N|2N --social-avg-wage --notice-month 1
            --ot-weekday --ot-rest --ot-holiday --annual-leave-days --double-wage-months
  interest  --principal --rate --start --end   或   --segment "起算日,截止日,年利率"（可重复）
  penalty   --base --rate --amount --actual-loss

选项：
  --json   输出机器可读 JSON
  --out D  输出 计算表.csv + 计算说明.md
  --demo   用内置四类样例跑一遍

金额两位小数；每一项都给公式与代入值，可手算复核。
地方标准（人均可支配收入、社平工资、护理/营养日标准、LPR）不内置，请自行填写。`);
  process.exit(0);
}

const FIELD_MAP = {
  medical: 'medical', 'daily-income': 'dailyIncome', 'lost-days': 'lostDays',
  'care-daily': 'careDaily', 'care-days': 'careDays', 'nutrition-daily': 'nutritionDaily',
  'nutrition-days': 'nutritionDays', 'meal-daily': 'mealDaily', 'hospital-days': 'hospitalDays',
  'disability-base': 'disabilityBase', 'disability-years': 'disabilityYears',
  'disability-coef': 'disabilityCoef', mental: 'mental', transport: 'transport',
  'monthly-wage': 'monthlyWage', 'work-years': 'workYears', mode: 'mode',
  'social-avg-wage': 'socialAvgWage', 'notice-month': 'noticeMonth',
  'ot-weekday': 'otWeekday', 'ot-rest': 'otRest', 'ot-holiday': 'otHoliday',
  'annual-leave-days': 'annualLeaveDays', 'double-wage-months': 'doubleWageMonths',
  principal: 'principal', rate: 'rate', start: 'start', end: 'end',
  base: 'base', amount: 'amount', 'actual-loss': 'actualLoss',
};

function 造输入() {
  const input = {};
  for (const [flag, key] of Object.entries(FIELD_MAP)) {
    const v = val(flag, '');
    if (v !== '') input[key] = v;
  }
  const segs = all('segment').map((s) => {
    const [start, end, rate] = String(s).split(/[,，]/).map((x) => x.trim());
    return { start, end, rate };
  }).filter((s) => s.start && s.end && s.rate);
  if (segs.length) { input.segments = segs; delete input.rate; delete input.start; delete input.end; }
  if (String(input.noticeMonth ?? '') === '1' || String(input.noticeMonth ?? '').toLowerCase() === 'true') input.noticeMonth = true;
  return input;
}

if (has('demo')) {
  const out = val('out', '');
  const results = [];
  for (const t of TYPES) {
    const r = calc(t, DEMO[t]);
    if (!r.ok) { console.error('❌ ' + r.error); process.exit(2); }
    results.push(r);
  }
  if (out) {
    const dir = resolve(out);
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    for (const r of results) {
      writeFileSync(join(dir, `计算表-${r.title}.csv`), buildCsv(r), 'utf8');
      writeFileSync(join(dir, `计算说明-${r.title}.md`), buildMarkdown(r, { generatedAt: stamp }), 'utf8');
    }
    if (has('json')) console.log(JSON.stringify({ ok: true, out: dir, results }, null, 2));
    else {
      for (const r of results) {
        console.log(`${r.title}：合计 ${r.total.toFixed(2)} 元（${r.items.length} 项）`);
        for (const i of r.items) console.log(`  ${i.name}  ${i.sub}  = ${i.amount.toFixed(2)}`);
        console.log('');
      }
      console.log(`产物目录：${dir}`);
      console.log('  ' + results.map((r) => `计算表-${r.title}.csv / 计算说明-${r.title}.md`).join('、'));
    }
  } else if (has('json')) {
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } else {
    for (const r of results) {
      console.log(`${r.title}：合计 ${r.total.toFixed(2)} 元（${r.items.length} 项）`);
      for (const i of r.items) console.log(`  ${i.name}  ${i.sub}  = ${i.amount.toFixed(2)}`);
      console.log('');
    }
  }
  process.exit(0);
}

const type = String(val('type', '')).trim().toLowerCase();
if (!type) {
  console.error('❌ 缺少 --type（可选：' + TYPES.map((t) => `${t}（${CATEGORY[t]}）`).join('、') + '）');
  process.exit(2);
}

const r = calc(type, 造输入());
if (!r.ok) {
  if (has('json')) console.log(JSON.stringify({ ok: false, error: r.error }, null, 2));
  else console.error('❌ ' + r.error);
  process.exit(2);
}

const out = val('out', '');
if (out) {
  const dir = resolve(out);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  writeFileSync(join(dir, '计算表.csv'), buildCsv(r), 'utf8');
  writeFileSync(join(dir, '计算说明.md'), buildMarkdown(r, { generatedAt: stamp }), 'utf8');
  r.outputs = { dir, csv: join(dir, '计算表.csv'), md: join(dir, '计算说明.md') };
}

if (has('json')) {
  console.log(JSON.stringify(r, null, 2));
} else {
  console.log(`${r.title}：合计 ${r.total.toFixed(2)} 元（${r.items.length} 项）`);
  for (const i of r.items) console.log(`  ${i.name}  ${i.formula}（${i.sub}）  = ${i.amount.toFixed(2)}`);
  console.log('');
  for (const n of r.notes) console.log('· ' + n);
  if (out) console.log(`\n产物目录：${resolve(out)}\n  计算表.csv\n  计算说明.md`);
}
process.exit(0);
