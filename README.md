# @deepwhale-cn/dsh-legal-damages · 深鲸损害赔偿计算器

算得清、复核得了。四类最常见赔偿请求，每一项都给**公式 + 代入值 + 金额**，对方拿计算器就能重算。

不是文书生成器，也不替你判断谁担责——只做算术。

## 四类

| 类型 | 算什么 | 关键口径 |
|---|---|---|
| 人身损害 | 医疗费、误工费、护理费、营养费、住院伙食补助、残疾赔偿金、精神损害抚慰金、交通费 | 残疾赔偿金 = 基数 × 年限 × 伤残系数；**基数与年限必须由用户填**（各地标准不同，插件不内置任何地方数字） |
| 劳动争议 | 经济补偿 N、违法解除赔偿金 2N、代通知金、加班费、未休年假 200%、二倍工资差额 | N 与 2N **二选一不叠加**；日工资按 21.75 天折算；提示 3 倍社平封顶（填当地社平才校验） |
| 借款利息 | 本金 × 年利率 × 天数 ÷ 365，支持分段 | 算头不算尾；只提示 LPR 四倍上限，不内置 LPR 数值 |
| 违约金 | 基数 × 约定比例 | 超过实际损失 30% 时提示可请求调减（《民法典》第 585 条第 2 款） |

## 用法

### 面板

侧栏「法律·损害赔偿」。顶部四个类型页签 → 填表 → 计算 → 明细表（项目 / 公式 / 金额）+ 合计 + 提示 → 复制结果 / 导出 CSV。

### CLI

```bash
dsh-legal-damages --type injury --medical 12000 --daily-income 300 --lost-days 20 \
  --disability-base 40000 --disability-years 20 --disability-coef 10

dsh-legal-damages --type labor --monthly-wage 8000 --work-years 3.5 --mode N

dsh-legal-damages --type interest --principal 100000 --rate 6 \
  --start 2024-01-01 --end 2024-12-31

dsh-legal-damages --type penalty --base 200000 --rate 20 --actual-loss 20000

dsh-legal-damages --demo --out ./赔偿计算     # 四类样例一次跑完
```

- `--json`：机器可读（items / total / notes / pending）
- `--out DIR`：落 `计算表.csv`（UTF-8 BOM，Excel 直接开）+ `计算说明.md`
- 退出码：0 成功；2 参数错误或校验不通过

### HTTP

```
GET  /dsh-legal-damages/api/info
POST /dsh-legal-damages/api/calc   {type, input}
POST /dsh-legal-damages/api/csv    {type, input}
```

`/api/calc` 返回 `{ok, type, title, items:[{name,formula,sub,amount,basis}], total, notes[], pending[]}`。

## 纪律

1. **不编地方标准**：人均可支配收入、社平工资、护理/营养日标准、伙食补助、LPR 一律留空或用户填；缺了明确提示，不拿 0 或全国平均顶替。
2. **可手算复核**：金额两位小数，先各自四舍五入再相加，合计等于分项和。
3. **算的是请求额**，不是判决额；封顶、调减、举证不能都写进提示。
4. 不判断责任、伤残等级、是否违法解除；不出起诉状（用 legal-complaint）、不核法条（用 legal-cite-check）。
5. 输出带「AI 辅助生成，需承办律师复核」。

## 测试

```bash
bash tests/run.sh        # 27 条断言：四类金额、N/2N 不叠加、200% 口径、365 天、缺参报错、0/负数、坏输入、产物、后端出口
```

## License

MIT © 深鲸 DeepWhale

<p align="right"><a href="https://deepwhale.org.cn"><img src="https://www.deepwhale.org.cn/images/badge/deepwhale-badge.png" alt="powered by dwh" height="20"></a></p>
