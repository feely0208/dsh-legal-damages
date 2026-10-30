# 深鲸损害赔偿计算器（dsh-legal-damages）

**什么时候用**：用户要算赔偿金额——「误工费多少」「经济补偿 N 怎么算」「2N 是多少」「加班费」「未休年假」「借款利息算到哪天」「违约金能调减吗」。给定数字，出可手算复核的明细表。

**不适用于**：判断谁担责、是否构成伤残、地方标准是多少（必须用户给或标【待填】）、出起诉状（找 legal-complaint）、核法条（找 legal-cite-check）。

```bash
<cli> --type <injury|labor|interest|penalty> [参数...] [--out 输出目录] [--json]
<cli> --demo
```

## 四类参数

| 类型 | 参数 | 要点 |
|---|---|---|
| `injury` 人身损害 | `--medical --daily-income --lost-days --care-daily --care-days --nutrition-daily --nutrition-days --meal-daily --hospital-days --disability-base --disability-years --disability-coef --mental --transport` | 成对参数必须同时给（日收入+天数）；残疾赔偿金基数/年限/系数三个一起给；至少一项金额 |
| `labor` 劳动 | `--monthly-wage --work-years --mode N\|2N --social-avg-wage --notice-month 1 --ot-weekday --ot-rest --ot-holiday --annual-leave-days --double-wage-months` | 月工资必填；N 与 2N 二选一；月数上限 11 |
| `interest` 利息 | `--principal --rate --start --end`，或 `--segment "起算日,截止日,年利率"`（可重复） | 算头不算尾；365 天/年单利 |
| `penalty` 违约金 | `--base --rate --amount --actual-loss` | 比例与金额二选一；填了损失就做 30% 比对 |

## 口径（脚本已实现，不要口头另算一套）

- 经济补偿月数：`总月数 = round(年限×12)`；整年 +（余月≥6 按 1 年，0<余月<6 按半个月）。
- 日工资 = `月工资 ÷ 21.75`；小时工资 = `月工资 ÷ 21.75 ÷ 8`。
- 加班费 = 小时工资 ×（1.5×平日 + 2×休息日 + 3×节假日）。
- 未休年假 = 日工资 × 天数 × **200%**（300% 含已发的 100%）。
- 利息 = 本金 × 年利率 × 天数 ÷ 365；天数 = 截止日 − 起算日（算头不算尾）。
- 违约金 = 基数 × 比例；`违约金 > 实际损失 × 1.3` → 提示可请求调减（民法典第 585 条第 2 款）。
- 金额两位小数；先各自四舍五入再相加。

## 输出

- 控制台：合计 + 每项「公式 + 代入值 + 金额」。
- `--out DIR`：`计算表.csv`（UTF-8 BOM，Excel 可开）+ `计算说明.md`（逐项说明、依据、待核清单、免责声明）。
- `--json`：`{ok, type, title, items:[{name,formula,sub,amount,basis}], total, notes[], pending[]}`。

## 纪律

1. **不编地方标准**：人均可支配收入、社平工资、护理/营养日标准、LPR 一律由用户填；缺了标【待填】，不要拿全国平均或往年数字顶替。
2. **算的是请求额**，不是判决额；封顶、调减、举证不能都写进提示。
3. **N 与 2N 不叠加**；未签合同二倍工资最多 11 个月。
4. 每项给依据（法条到条 / 合同条款号 / 票据编号）；缺依据的标待核。
5. 结论用「可以主张 / 通常 / 需结合…判断」，不承诺结果。
6. 交付带「AI 辅助生成，需承办律师复核」。

## 复核

逐行用「公式 + 代入值」在计算器上重算，应与金额一致；合计应等于各行金额之和。不一致就是脚本或输入有问题，先查单位（元/日 vs 元/月、% vs 小数、日 vs 月）。
