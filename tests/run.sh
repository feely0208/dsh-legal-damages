#!/bin/bash
# dsh-legal-damages · 真行为验证
# 覆盖：四类各算对 / 缺参数报错 / 0 与负数拒绝 / 合计等于分项和 / 坏输入不崩 / 产物结构 / 后端出口
set -uo pipefail
export PATH="/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo ""; echo "  $(node -p "require('./package.json').name") · 赔偿计算验证"
echo "  ────────────────────────────────────────────────"

TMP=$(mktemp -d) || { echo "无法创建临时目录"; exit 1; }
trap 'rm -rf "$TMP"' EXIT
CLI="bin/cli.mjs"

# ── 1. 人身损害：8 项 / 合计 106650.00 / 分项和等于合计 ──
node "$CLI" --type injury --medical 12000 --daily-income 300 --lost-days 20 \
  --care-daily 150 --care-days 10 --nutrition-daily 30 --nutrition-days 20 \
  --meal-daily 50 --hospital-days 15 --disability-base 40000 --disability-years 20 \
  --disability-coef 10 --mental 5000 --transport 800 --json > "$TMP/injury.json" 2>"$TMP/err"
[ "$?" = "0" ] && ok "人身损害计算 exit 0" || bad "人身损害计算失败：$(head -2 "$TMP/err")"

q(){ node -e "
const r=JSON.parse(require('fs').readFileSync('$1','utf8'));
$2
"; }

q "$TMP/injury.json" "
const s=r.items.reduce((a,b)=>a+b.amount,0);
if(Math.abs(r.total-106650)>0.005){console.error('合计错',r.total);process.exit(1)}
if(r.items.length!==8){console.error('项数错',r.items.length);process.exit(1)}
if(Math.abs(s-r.total)>0.005){console.error('分项和!=合计',s,r.total);process.exit(1)}
const d=r.items.find(x=>x.name==='残疾赔偿金');
if(!d||Math.abs(d.amount-80000)>0.005){console.error('残疾赔偿金错',d);process.exit(1)}
if(!/10%/.test(d.sub)){console.error('公式未写系数',d.sub);process.exit(1)}" \
  && ok "人身损害：8 项 / 合计 106650.00 / 分项和 = 合计 / 残疾赔偿金 80000（含代入值）" \
  || bad "人身损害金额或结构不对"

# ── 2. 伤残系数 10 与 0.1 等价 ──
node "$CLI" --type injury --disability-base 40000 --disability-years 20 --disability-coef 0.1 --json > "$TMP/coef.json" 2>/dev/null
q "$TMP/coef.json" "if(Math.abs(r.total-80000)>0.005){console.error('系数换算错',r.total);process.exit(1)}" \
  && ok "伤残系数 0.1 与 10 等价（80000.00）" || bad "伤残系数换算不对（0.1 应等于 10%）"

# ── 3. 劳动 N：3.5 年 → 4 个月 → 32000；2N = 64000 且不叠加 ──
node "$CLI" --type labor --monthly-wage 8000 --work-years 3.5 --mode N --json > "$TMP/n.json" 2>/dev/null
q "$TMP/n.json" "
if(Math.abs(r.total-32000)>0.005){console.error('N 错',r.total);process.exit(1)}
if(!/4 个月/.test(r.items[0].sub)){console.error('补偿月数错',r.items[0].sub);process.exit(1)}" \
  && ok "经济补偿 N：3.5 年 → 4 个月 → 32000.00" || bad "经济补偿 N 计算错"
node "$CLI" --type labor --monthly-wage 8000 --work-years 3.5 --mode 2N --json > "$TMP/n2.json" 2>/dev/null
q "$TMP/n2.json" "
if(Math.abs(r.total-64000)>0.005){console.error('2N 错',r.total);process.exit(1)}
if(r.items.some(i=>i.name.includes('经济补偿'))){console.error('2N 与 N 叠加了');process.exit(1)}" \
  && ok "赔偿金 2N：64000.00，且不叠加经济补偿" || bad "2N 计算错或与 N 叠加"

# ── 4. 加班费 21.75 口径 / 未休年假 200% ──
node "$CLI" --type labor --monthly-wage 8000 --work-years 3.5 --notice-month 1 \
  --ot-weekday 10 --ot-rest 8 --annual-leave-days 5 --json > "$TMP/ot.json" 2>/dev/null
q "$TMP/ot.json" "
const g=(n)=>r.items.find(x=>x.name===n);
if(Math.abs(g('加班费').amount-1425.29)>0.005){console.error('加班费错',g('加班费'));process.exit(1)}
if(Math.abs(g('未休年休假工资').amount-3678.16)>0.005){console.error('年假错',g('未休年休假工资'));process.exit(1)}
if(Math.abs(r.total-45103.45)>0.005){console.error('合计错',r.total);process.exit(1)}
if(!/200%/.test(g('未休年休假工资').sub)){console.error('年假口径不是 200%');process.exit(1)}" \
  && ok "加班费 1425.29（21.75÷8）/ 未休年假 3678.16（200%）/ 合计 45103.45" || bad "加班费或年假口径错"

# ── 5. 利息：365 天（算头不算尾）+ 分段 ──
node "$CLI" --type interest --principal 100000 --rate 6 --start 2024-01-01 --end 2024-12-31 --json > "$TMP/i.json" 2>/dev/null
q "$TMP/i.json" "
if(Math.abs(r.total-6000)>0.005){console.error('利息错',r.total);process.exit(1)}
if(!/365 ÷ 365/.test(r.items[0].sub)){console.error('天数口径错',r.items[0].sub);process.exit(1)}" \
  && ok "利息：100000×6%×365÷365 = 6000.00（闰年也不写 366）" || bad "利息金额或天数口径错"
node "$CLI" --type interest --principal 100000 --segment 2024-01-01,2024-07-01,6 --segment 2024-07-01,2024-12-31,5 --json > "$TMP/iseg.json" 2>/dev/null
q "$TMP/iseg.json" "
if(r.items.length!==2){console.error('分段数错',r.items.length);process.exit(1)}
if(Math.abs(r.total-5498.63)>0.005){console.error('分段利息错',r.total);process.exit(1)}" \
  && ok "分段利息：两段各自计息后相加 = 5498.63" || bad "分段利息不对"

# ── 6. 违约金 40000 + 30% 调减提示 ──
node "$CLI" --type penalty --base 200000 --rate 20 --actual-loss 20000 --json > "$TMP/p.json" 2>/dev/null
q "$TMP/p.json" "
if(Math.abs(r.total-40000)>0.005){console.error('违约金错',r.total);process.exit(1)}
const t=r.notes.join(' ');
if(!/30%/.test(t)){console.error('没有 30% 提示');process.exit(1)}
if(!/调减/.test(t)){console.error('没有调减提示');process.exit(1)}
if(!/585/.test(t)){console.error('没有援引 585 条');process.exit(1)}" \
  && ok "违约金 40000.00，且提示超损失 30% 可请求调减（援引 585 条）" || bad "违约金金额或调减提示缺失"

# ── 7. 缺参数报错（exit 2，不许静默算 0） ──
node "$CLI" --type labor >/dev/null 2>&1; [ "$?" = "2" ] && ok "劳动缺月工资 → exit 2" || bad "缺月工资应 exit 2"
node "$CLI" --type injury --daily-income 300 >/dev/null 2>&1; [ "$?" = "2" ] && ok "误工只给日收入（缺天数）→ exit 2" || bad "成对参数缺失应 exit 2"
node "$CLI" --type interest --principal 100000 --rate 6 --start 2024-01-01 >/dev/null 2>&1; [ "$?" = "2" ] && ok "利息缺截止日 → exit 2" || bad "缺日期应 exit 2"
node "$CLI" --type injury >/dev/null 2>&1; [ "$?" = "2" ] && ok "人身损害一项都不填 → exit 2" || bad "空表单应 exit 2"

# ── 8. 0 / 负数拒绝 ──
node "$CLI" --type interest --principal 0 --rate 6 --start 2024-01-01 --end 2024-06-01 >/dev/null 2>&1
[ "$?" = "2" ] && ok "本金 0 → 拒绝（exit 2）" || bad "本金 0 未被拒绝"
node "$CLI" --type penalty --base -1 --rate 20 >/dev/null 2>&1
[ "$?" = "2" ] && ok "基数负数 → 拒绝（exit 2）" || bad "负数基数未被拒绝"
node "$CLI" --type labor --monthly-wage 8000 --annual-leave-days -3 >/dev/null 2>&1
[ "$?" = "2" ] && ok "年假天数负数 → 拒绝（exit 2）" || bad "负数天数未被拒绝"
node "$CLI" --type labor --monthly-wage 8000 --double-wage-months 12 >/dev/null 2>&1
[ "$?" = "2" ] && ok "二倍工资 12 个月 → 拒绝（上限 11）" || bad "12 个月未被拒绝"

# ── 9. 坏输入不崩 ──
OUT=$(node "$CLI" --type nope 2>&1); E=$?
[ "$E" = "2" ] && echo "$OUT" | grep -q "不支持" && ok "未知类型 → exit 2 且说明可选类型（不抛栈）" || bad "未知类型处理不对：$OUT"
OUT=$(node "$CLI" --type penalty --base abc --rate 20 2>&1); E=$?
[ "$E" = "2" ] && echo "$OUT" | grep -q "必须是数字" && ok "非数字输入 → exit 2 且提示「必须是数字」" || bad "非数字输入处理不对"
OUT=$(node "$CLI" --type interest --principal 100000 --rate 6 --start 2024-02-30 --end 2024-06-01 2>&1)
echo "$OUT" | grep -q "不是有效日期" && ok "2024-02-30 → 识别为无效日期（不静默算错）" || bad "无效日期未拦住：$OUT"

# ── 10. 产物：CSV 带 BOM、两位小数、合计行；MD 含依据与免责 ──
node "$CLI" --type injury --medical 12000 --daily-income 300 --lost-days 20 --out "$TMP/out" >/dev/null 2>&1
[ -s "$TMP/out/计算表.csv" ] && ok "生成非空 计算表.csv" || bad "缺少 计算表.csv"
[ -s "$TMP/out/计算说明.md" ] && ok "生成非空 计算说明.md" || bad "缺少 计算说明.md"
head -c 3 "$TMP/out/计算表.csv" | grep -q $'\xef\xbb\xbf' && ok "CSV 带 UTF-8 BOM（Excel 可直接开）" || bad "CSV 缺 BOM"
grep -q "合计,,,18000.00" "$TMP/out/计算表.csv" && grep -q "6000.00" "$TMP/out/计算表.csv" \
  && ok "CSV 金额两位小数、合计行正确" || bad "CSV 金额格式或合计行不对"
grep -q "复核方法" "$TMP/out/计算说明.md" && grep -q "需承办律师复核" "$TMP/out/计算说明.md" \
  && ok "计算说明含复核方法与律师复核声明" || bad "计算说明缺复核/免责段"

# ── 11. --demo 四类都出 ──
node "$CLI" --demo --out "$TMP/demo" >/dev/null 2>&1
N=$(ls "$TMP/demo" 2>/dev/null | wc -l | tr -d ' ')
[ "$N" = "8" ] && ok "--demo 出四类共 8 个文件（4 CSV + 4 MD）" || bad "--demo 产物数不对（$N）"

# ── 12. 后端出口 ──
if node tests/api-smoke.mjs > "$TMP/api.log" 2>&1; then
  ok "后端出口冒烟通过（info / calc / csv / 坏 JSON / 0 值）"
else
  bad "后端出口冒烟失败：$(tail -4 "$TMP/api.log" | tr '\n' ' ')"
fi

echo ""
echo "  ────────────────────────────────────────────────"
echo "  通过 $PASS · 失败 $FAIL"; echo ""
[ "$FAIL" -eq 0 ] || exit 1
