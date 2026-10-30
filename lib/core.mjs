/**
 * dsh-legal-damages · 损害赔偿计算引擎（纯 Node，零外部依赖）
 *
 * 四类：人身损害 / 劳动争议 / 借款利息 / 违约金
 * 原则：
 *   1. 只做算术与校验，不联网、不查标准、不内置任何地方标准数字；
 *   2. 每一项都给「公式 + 代入值」，金额两位小数，可手算复核；
 *   3. 缺参数显式报错，0 / 负数 / 非数字一律拒绝；
 *   4. 算不出的项标【待填】，不拿 0 冒充。
 */

export const CATEGORY = {
  injury: '人身损害',
  labor: '劳动争议',
  interest: '借款利息',
  penalty: '违约金',
};
export const TYPES = Object.keys(CATEGORY);

const 二 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const 钱 = (n) => 二(n).toFixed(2);
const 数显 = (n) => (Number.isInteger(n) ? String(n) : String(二(n))).replace(/\.0+$/, '');

/** 解析可选数字：空 → null；非数字 → NaN */
function 读(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  return Number(s);
}

/** 必须 > 0 的数字；空返回 null（是否允许为空由调用方判断） */
function 正数(v, 名称, 错) {
  const n = 读(v);
  if (n === null) return null;
  if (!Number.isFinite(n)) 错.push(`${名称}必须是数字`);
  else if (n <= 0) 错.push(`${名称}必须大于 0`);
  else return n;
  return null;
}

/** 必须 >= 0 的数字（用于「可以是 0」的口径参数，目前未使用，保留语义） */
function 非负(v, 名称, 错) {
  const n = 读(v);
  if (n === null) return null;
  if (!Number.isFinite(n)) 错.push(`${名称}必须是数字`);
  else if (n < 0) 错.push(`${名称}不能为负数`);
  else return n;
  return null;
}

function 真假(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on' || s === '是';
}

function 日期(v, 名称, 错) {
  const s = String(v ?? '').trim();
  if (!s) { 错.push(`${名称}不能为空`); return null; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) { 错.push(`${名称}格式须为 YYYY-MM-DD（收到「${s}」）`); return null; }
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    错.push(`${名称}不是有效日期（收到「${s}」）`);
    return null;
  }
  return d;
}

const 天差 = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000);

function 成项(name, formula, sub, amount, basis, pending) {
  return { name, formula, sub, amount: 二(amount), basis, ...(pending ? { pending } : {}) };
}

/* ────────────────────────────── 人身损害 ────────────────────────────── */

function 人身损害(raw) {
  const 错 = [];
  const medical = 正数(raw.medical, '医疗费', 错);
  const dailyIncome = 正数(raw.dailyIncome, '日收入', 错);
  const lostDays = 正数(raw.lostDays, '误工天数', 错);
  const careDaily = 正数(raw.careDaily, '护理日标准', 错);
  const careDays = 正数(raw.careDays, '护理天数', 错);
  const nutritionDaily = 正数(raw.nutritionDaily, '营养日标准', 错);
  const nutritionDays = 正数(raw.nutritionDays, '营养期天数', 错);
  const mealDaily = 正数(raw.mealDaily, '伙食补助日标准', 错);
  const hospitalDays = 正数(raw.hospitalDays, '住院天数', 错);
  const disabilityBase = 正数(raw.disabilityBase, '残疾赔偿金基数', 错);
  const disabilityYears = 正数(raw.disabilityYears, '残疾赔偿金年限', 错);
  const disabilityCoefRaw = 正数(raw.disabilityCoef, '伤残系数', 错);
  const mental = 正数(raw.mental, '精神损害抚慰金', 错);
  const transport = 正数(raw.transport, '交通费', 错);

  let 系数 = null;
  if (disabilityCoefRaw !== null) {
    if (disabilityCoefRaw > 100) 错.push('伤残系数不能大于 100（十级 10，一级 100；也可填 0.1）');
    else 系数 = disabilityCoefRaw > 1 ? 二(disabilityCoefRaw / 100) : disabilityCoefRaw;
  }

  const 成对 = [
    [dailyIncome, lostDays, '误工费需同时填写「日收入」与「误工天数」'],
    [careDaily, careDays, '护理费需同时填写「护理日标准」与「护理天数」'],
    [nutritionDaily, nutritionDays, '营养费需同时填写「营养日标准」与「营养期天数」'],
    [mealDaily, hospitalDays, '住院伙食补助费需同时填写「日补助标准」与「住院天数」'],
    [disabilityBase, disabilityYears, '残疾赔偿金需同时填写「基数」与「年限」'],
  ];
  for (const [a, b, msg] of 成对) if ((a === null) !== (b === null)) 错.push(msg);
  if ((disabilityBase !== null || disabilityYears !== null) && 系数 === null) {
    错.push('已填残疾赔偿金基数/年限，还需填写「伤残系数」（十级 10，一级 100）');
  }
  if (错.length) return { ok: false, error: 错.join('；') };

  const 已填 = [medical, dailyIncome, careDaily, nutritionDaily, mealDaily, disabilityBase, mental, transport].some((x) => x !== null);
  if (!已填) return { ok: false, error: '人身损害：至少填写一项赔偿项目（医疗费/误工费/护理费/营养费/伙食补助/残疾赔偿金/精神抚慰金/交通费）' };

  const items = [];
  const notes = [];
  if (medical !== null) items.push(成项('医疗费', '按票据金额合计', `票据合计 ${钱(medical)} 元`, medical, '民法典第1179条'));
  if (dailyIncome !== null) items.push(成项('误工费', '日收入 × 误工天数', `${钱(dailyIncome)} 元/日 × ${数显(lostDays)} 天`, dailyIncome * lostDays, '民法典第1179条'));
  if (careDaily !== null) items.push(成项('护理费', '护理日标准 × 护理天数', `${钱(careDaily)} 元/日 × ${数显(careDays)} 天`, careDaily * careDays, '民法典第1179条'));
  if (nutritionDaily !== null) items.push(成项('营养费', '营养日标准 × 营养期天数', `${钱(nutritionDaily)} 元/日 × ${数显(nutritionDays)} 天`, nutritionDaily * nutritionDays, '民法典第1179条'));
  if (mealDaily !== null) items.push(成项('住院伙食补助费', '日补助标准 × 住院天数', `${钱(mealDaily)} 元/日 × ${数显(hospitalDays)} 天`, mealDaily * hospitalDays, '民法典第1179条'));
  if (disabilityBase !== null) {
    items.push(成项('残疾赔偿金', '基数 × 年限 × 伤残系数',
      `${钱(disabilityBase)} × ${数显(disabilityYears)} 年 × ${数显(二(系数 * 100))}%`,
      disabilityBase * disabilityYears * 系数,
      '民法典第1179条；基数=受诉法院所在地上一年度城镇居民人均可支配收入',
      '基数与年限须按受诉法院所在地标准核定'));
    notes.push(`残疾赔偿金基数按 ${钱(disabilityBase)} 元填报，须以受诉法院所在地上一年度城镇居民人均可支配收入核定（各地不同，本表不含任何地方标准数字）。`);
    notes.push('残疾赔偿金年限：自定残之日起按 20 年计；60 周岁以上每增 1 岁减 1 年，75 周岁以上按 5 年。');
  } else {
    notes.push('未主张残疾赔偿金：如已构成伤残，须补填基数（当地上一年度城镇居民人均可支配收入）、年限与伤残系数。');
  }
  if (mental !== null) items.push(成项('精神损害抚慰金', '酌定（无统一公式）', `填报 ${钱(mental)} 元`, mental, '民法典第1183条', '金额由法院酌定，本表仅记录填报值'));
  if (transport !== null) items.push(成项('交通费', '按实际发生票据合计', `票据合计 ${钱(transport)} 元`, transport, '民法典第1179条'));

  notes.push('医疗费、交通费按实际票据金额计；后续治疗费、康复费、被扶养人生活费未计入本表。');
  notes.push('误工费以实际减少的收入为准；无固定收入的按近三年平均收入或当地同行业标准（需另行举证）。');
  if (!items.some((i) => i.name === '残疾赔偿金')) notes.push('如构成伤残，还须补做伤残等级鉴定——没有鉴定意见，残疾赔偿金无法确定。');

  return 汇总('injury', items, notes);
}

/* ────────────────────────────── 劳动争议 ────────────────────────────── */

function 劳动(raw) {
  const 错 = [];
  const monthlyWage = 正数(raw.monthlyWage, '月工资', 错);
  const workYears = 正数(raw.workYears, '工作年限', 错);
  const socialAvgWage = 正数(raw.socialAvgWage, '当地上年度职工月平均工资', 错);
  const otWeekday = 正数(raw.otWeekday, '平日加班小时', 错);
  const otRest = 正数(raw.otRest, '休息日加班小时', 错);
  const otHoliday = 正数(raw.otHoliday, '法定节假日加班小时', 错);
  const annualLeaveDays = 正数(raw.annualLeaveDays, '未休年假天数', 错);
  const doubleWageMonths = 正数(raw.doubleWageMonths, '未签书面合同月数', 错);
  const noticeMonth = 真假(raw.noticeMonth);
  const mode = String(raw.mode ?? 'N').trim().toUpperCase() === '2N' ? '2N' : 'N';
  if (monthlyWage !== null && monthlyWage > 1e8) 错.push('月工资数值异常（超过 1 亿元），请检查单位是否为「元」');
  if (doubleWageMonths !== null && doubleWageMonths > 11) 错.push('未签书面合同月数最多 11 个月（第 1 个月为宽限期）');
  if (错.length) return { ok: false, error: 错.join('；') };
  if (monthlyWage === null) return { ok: false, error: '劳动争议：必须填写「月工资」（解除前 12 个月平均应得工资，税前）' };

  const 有请求 = workYears !== null || noticeMonth || otWeekday !== null || otRest !== null || otHoliday !== null || annualLeaveDays !== null || doubleWageMonths !== null;
  if (!有请求) return { ok: false, error: '劳动争议：至少填写一项主张（工作年限/代通知金/加班小时/未休年假/未签合同月数）' };
  if (mode === '2N' && workYears === null) return { ok: false, error: '赔偿金 2N 需填写「工作年限」' };

  const items = [];
  const notes = [];

  // 12 个月平均工资 → 补偿月数
  let 月数 = 0;
  if (workYears !== null) {
    const 总月 = Math.round(workYears * 12);
    const 整年 = Math.floor(总月 / 12);
    const 余月 = 总月 % 12;
    月数 = 整年 + (余月 >= 6 ? 1 : 余月 > 0 ? 0.5 : 0);
    if (月数 <= 0) 月数 = 0.5; // 不满 6 个月按半个月
  }

  let 基数 = monthlyWage;
  let 已封顶 = false;
  if (socialAvgWage !== null && monthlyWage > 3 * socialAvgWage) {
    基数 = 3 * socialAvgWage;
    已封顶 = true;
    if (月数 > 12) 月数 = 12;
  }

  if (workYears !== null) {
    if (mode === '2N') {
      items.push(成项('违法解除赔偿金（2N）', '经济补偿 N × 2',
        `${钱(基数)} 元 × ${数显(月数)} 个月 × 2`, 基数 * 月数 * 2, '劳动合同法第87条',
        已封顶 ? '已按 3 倍社平封顶且年限不超过 12 年' : '未做 3 倍社平封顶校验'));
    } else {
      items.push(成项('经济补偿（N）', '月工资 × 补偿月数',
        `${钱(基数)} 元 × ${数显(月数)} 个月`, 基数 * 月数, '劳动合同法第47条',
        已封顶 ? '已按 3 倍社平封顶且年限不超过 12 年' : '未做 3 倍社平封顶校验'));
    }
    notes.push(`补偿月数按「每满 1 年 1 个月；6 个月以上不满 1 年按 1 年；不满 6 个月半个月」折算：工作 ${数显(workYears)} 年 → ${数显(月数)} 个月。`);
  }
  if (mode === '2N' && workYears !== null) {
    notes.push('经济补偿 N 与违法解除赔偿金 2N 只能主张其一，本表按【2N】口径计算，未叠加。');
  } else if (workYears !== null) {
    notes.push('经济补偿 N 与违法解除赔偿金 2N 只能主张其一，本表按【N】口径计算；如系违法解除，可改选 2N。');
  }

  if (已封顶) {
    notes.push(`月工资高于当地上年度职工月平均工资 3 倍（${钱(3 * socialAvgWage)} 元），已按 3 倍计（${钱(基数)} 元），且补偿年限不超过 12 年（劳动合同法第47条第2款）。`);
  } else {
    notes.push(`未填当地上年度职工月平均工资，未做 3 倍封顶校验：如月工资高于当地社平 3 倍，经济补偿按 3 倍计且年限最高 12 年（劳动合同法第47条第2款）。`);
  }
  notes.push('月工资按解除或终止前 12 个月平均应得工资计（税前，含奖金、津贴、补贴）。');

  if (noticeMonth) {
    items.push(成项('代通知金', '1 个月工资', `${钱(monthlyWage)} 元 × 1`, monthlyWage, '劳动合同法第40条'));
    notes.push('代通知金仅适用劳动合同法第 40 条的三种情形，且用人单位未提前 30 日书面通知时才支付；第 39 条过失性解除没有代通知金。');
  }

  const 有加班 = otWeekday !== null || otRest !== null || otHoliday !== null;
  if (有加班) {
    const 小时 = monthlyWage / 21.75 / 8;
    const 倍 = 1.5 * (otWeekday || 0) + 2 * (otRest || 0) + 3 * (otHoliday || 0);
    items.push(成项('加班费', '小时工资 × (1.5×平日 + 2×休息日 + 3×法定节假日)',
      `${钱(monthlyWage)} ÷ 21.75 ÷ 8 × (1.5×${数显(otWeekday || 0)} + 2×${数显(otRest || 0)} + 3×${数显(otHoliday || 0)})`,
      小时 * 倍, '劳动法第44条'));
    notes.push(`小时工资 = 月工资 ÷ 21.75 ÷ 8 = ${钱(monthlyWage)} ÷ 21.75 ÷ 8 ≈ ${钱(小时)} 元/小时（中间值不四舍五入，直接用算式复核）；21.75 为计薪天数，不是当月实际工作日。`);
    notes.push('休息日加班已安排补休的不再支付 2 倍；法定节假日加班不能用补休替代。');
  }

  if (annualLeaveDays !== null) {
    const 日工资 = monthlyWage / 21.75;
    items.push(成项('未休年休假工资', '日工资 × 未休天数 × 200%',
      `${钱(monthlyWage)} ÷ 21.75 × ${数显(annualLeaveDays)} 天 × 200%`, 日工资 * annualLeaveDays * 2, '职工带薪年休假条例第5条'));
    notes.push('未休年假法定按日工资 300% 支付，其中 100% 为已发的正常工资，故本表只计另行支付的 200%。');
  }

  if (doubleWageMonths !== null) {
    items.push(成项('二倍工资差额', '月工资 × 未签月数（补差额一倍）',
      `${钱(monthlyWage)} 元 × ${数显(doubleWageMonths)} 个月`, monthlyWage * doubleWageMonths, '劳动合同法第82条'));
    notes.push('二倍工资差额 = 再补一倍（已发一倍）；最多 11 个月（用工满 1 个月次日起至满 1 年前一日），并注意仲裁时效。');
  }

  return 汇总('labor', items, notes);
}

/* ────────────────────────────── 借款利息 ────────────────────────────── */

function 借款利息(raw) {
  const 错 = [];
  const principal = 正数(raw.principal, '本金', 错);
  if (错.length) return { ok: false, error: 错.join('；') };
  if (principal === null) return { ok: false, error: '借款利息：必须填写「本金」' };

  const 分段 = Array.isArray(raw.segments) ? raw.segments.filter((s) => s && typeof s === 'object') : [];
  const items = [];
  const notes = [];

  if (分段.length) {
    let 合计天数 = 0;
    let 第 = 0;
    for (const s of 分段) {
      第 += 1;
      const 段错 = [];
      const rate = 正数(s.rate, `第${第}段年利率`, 段错);
      const a = 日期(s.start, `第${第}段起算日`, 段错);
      const b = 日期(s.end, `第${第}段截止日`, 段错);
      if (rate === null && !段错.length) 段错.push(`第${第}段缺少年利率`);
      if (a && b && 天差(a, b) <= 0) 段错.push(`第${第}段截止日必须晚于起算日`);
      if (段错.length) return { ok: false, error: 段错.join('；') };
      const 天 = 天差(a, b);
      合计天数 += 天;
      const 额 = principal * (rate / 100) * 天 / 365;
      items.push(成项(`利息（第 ${第} 段）`, '本金 × 年利率 × 天数 ÷ 365',
        `${钱(principal)} × ${数显(rate)}% × ${天} ÷ 365（${s.start} ~ ${s.end}）`, 额, '民法典第674条、第676条'));
    }
    notes.push(`分段计息共 ${分段.length} 段、合计 ${合计天数} 天，各段按各自利率计算后相加。`);
  } else {
    const rate = 正数(raw.rate, '年利率', 错);
    const a = 日期(raw.start, '起算日', 错);
    const b = 日期(raw.end, '截止日', 错);
    if (rate === null && !错.length) 错.push('借款利息：必须填写「年利率」');
    if (错.length) return { ok: false, error: 错.join('；') };
    const 天 = 天差(a, b);
    if (天 <= 0) return { ok: false, error: '截止日必须晚于起算日（算头不算尾，同一天为 0 天）' };
    const 额 = principal * (rate / 100) * 天 / 365;
    items.push(成项('利息', '本金 × 年利率 × 天数 ÷ 365',
      `${钱(principal)} × ${数显(rate)}% × ${天} ÷ 365`, 额, '民法典第674条、第676条'));
    notes.push(`计息天数 ${天} 天（${raw.start} 起算，${raw.end} 不计入，算头不算尾）。`);
  }

  notes.push('按 365 天/年单利计算，未计复利、未计已还本金冲抵；如有还款，请按每次还款日拆分本金后分段计算。');
  notes.push('民间借贷利率不得超过合同成立时一年期 LPR 的四倍，超过部分不受保护；LPR 数值请按合同成立日自行核对（本表不内置）。');
  notes.push('约定不明的自然人之间借款视为不支付利息（民法典第680条）；逾期利息与违约金、其他费用总计仍受利率上限约束。');
  return 汇总('interest', items, notes);
}

/* ────────────────────────────── 违约金 ────────────────────────────── */

function 违约金(raw) {
  const 错 = [];
  const base = 正数(raw.base, '违约金计算基数', 错);
  const rate = 正数(raw.rate, '约定比例', 错);
  const amountIn = 正数(raw.amount, '约定违约金金额', 错);
  const actualLoss = 正数(raw.actualLoss, '实际损失', 错);
  if (错.length) return { ok: false, error: 错.join('；') };
  if (base === null) return { ok: false, error: '违约金：必须填写「计算基数」（合同总价/未履行部分价款/定金，以合同约定为准）' };
  if (rate === null && amountIn === null) return { ok: false, error: '违约金：必须填写「约定比例」或「约定金额」之一' };
  if (rate !== null && rate > 1000) return { ok: false, error: '约定比例数值异常（超过 1000%），请检查是否误填小数' };

  const items = [];
  const notes = [];
  let 额;
  if (rate !== null) {
    额 = 二(base * rate / 100);
    items.push(成项('违约金', '基数 × 约定比例', `${钱(base)} × ${数显(rate)}%`, 额, '民法典第585条第1款'));
    if (amountIn !== null && Math.abs(amountIn - 额) > 0.01) {
      notes.push(`填报的约定金额 ${钱(amountIn)} 元与按比例算出的 ${钱(额)} 元不一致，本表按比例计；请核对合同条款。`);
    }
  } else {
    额 = 二(amountIn);
    items.push(成项('违约金', '按合同约定金额', `约定 ${钱(amountIn)} 元`, 额, '民法典第585条第1款'));
  }

  notes.push('违约金基数须以合同约定为准（合同总价 / 未履行部分价款 / 定金）；合同未写明基数的，本表按填报值暂计并列入待核。');

  if (actualLoss !== null) {
    const 阈值 = 二(actualLoss * 1.3);
    if (额 > 阈值) {
      notes.push(`🔴 调减风险：约定违约金 ${钱(额)} 元 > 实际损失 ${钱(actualLoss)} 元 × 1.3 = ${钱(阈值)} 元，违约方可依民法典第585条第2款请求适当减少（司法实践以超过损失 30% 为「过分高于」的一般参考）。`);
      notes.push('应对：守约方补充损失证据（价款差额、另行采购差价、逾期收益、维权费用）；违约方从损失未实际发生、可预见性抗辩。');
    } else if (额 < actualLoss) {
      notes.push(`🟡 违约金 ${钱(额)} 元低于实际损失 ${钱(actualLoss)} 元，守约方可请求增加，但须举证损失金额（民法典第585条第2款）。`);
    } else {
      notes.push(`未超过损失 130%（阈值 ${钱(阈值)} 元），被调减风险较低；仍须准备损失证据。`);
    }
  } else {
    notes.push('未填实际损失，无法做 30% 比对：民法典第585条第2款允许在「过分高于损失」时调减，司法实践一般以超过损失 30% 为参考；请补填损失金额后复核。');
  }
  notes.push('违约金与继续履行可以并存；违约金与损失赔偿一般择一主张，违约金不足以弥补损失的可请求增加（需证明损失）。');
  return 汇总('penalty', items, notes);
}

function 汇总(type, items, notes) {
  const total = 二(items.reduce((s, i) => s + i.amount, 0));
  const pending = items.filter((i) => i.pending).map((i) => `${i.name}：${i.pending}`);
  return {
    ok: true,
    type,
    title: CATEGORY[type],
    items,
    total,
    notes: notes.concat([
      '本表为可复算草稿，不构成法律意见；正式主张前由承办律师复核当地标准与证据。',
    ]),
    pending,
  };
}

export function calc(type, raw = {}) {
  const t = String(type ?? '').trim().toLowerCase();
  if (!CATEGORY[t]) {
    return { ok: false, error: `不支持的计算类型「${type ?? ''}」；可选：${TYPES.map((k) => `${k}（${CATEGORY[k]}）`).join('、')}` };
  }
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  try {
    if (t === 'injury') return 人身损害(input);
    if (t === 'labor') return 劳动(input);
    if (t === 'interest') return 借款利息(input);
    return 违约金(input);
  } catch (e) {
    return { ok: false, error: '计算失败：' + (e?.message || String(e)) };
  }
}

/* ────────────────────────────── 产物 ────────────────────────────── */

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCsv(r) {
  const 行 = [['类别', '项目', '公式', '代入值', '金额（元）', '依据', '待核项']];
  for (const i of r.items) 行.push([r.title, i.name, i.formula, i.sub, i.amount.toFixed(2), i.basis, i.pending || '']);
  行.push([r.title, '合计', '', '', r.total.toFixed(2), '', '']);
  const 文 = 行.map((r2) => r2.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return '\ufeff' + 文; // UTF-8 BOM：Excel 双击不乱码
}

export function buildMarkdown(r, meta = {}) {
  const out = [];
  out.push(`# ${r.title}赔偿计算说明`, '');
  out.push(`- 生成时间：${meta.generatedAt || ''}`);
  out.push(`- 计算类型：${r.title}（${r.type}）`);
  out.push(`- 金额口径：人民币元，保留两位小数；各项先四舍五入再相加`);
  out.push('');
  out.push(`## 合计：${r.total.toFixed(2)} 元（${r.items.length} 项）`, '');
  out.push('| 项目 | 公式 | 代入值 | 金额（元） | 依据 |');
  out.push('|---|---|---|---:|---|');
  for (const i of r.items) {
    out.push(`| ${i.name} | ${i.formula} | ${i.sub} | ${i.amount.toFixed(2)} | ${i.basis} |`);
  }
  out.push(`| **合计** |  |  | **${r.total.toFixed(2)}** |  |`);
  out.push('');
  out.push('## 提示与依据', '');
  for (const n of r.notes) out.push(`- ${n}`);
  out.push('');
  out.push('## 待核项', '');
  if (r.pending.length) for (const p of r.pending) out.push(`- [ ] ${p}`);
  else out.push('- [ ] 无脚本判定项；仍须核对票据、合同条款与当地标准出处');
  out.push('- [ ] 受诉法院所在地 / 当地上一年度标准（如涉及残疾赔偿金、社平工资封顶）');
  out.push('');
  out.push('## 复核方法', '');
  out.push('逐行用「公式 + 代入值」在计算器上重算，结果应与「金额」一致；合计应等于各行金额之和。');
  out.push('');
  out.push('> AI 辅助生成，需承办律师复核。本表只做算术，不替代责任认定、证据审查与法律判断。');
  return out.join('\n') + '\n';
}

export const DEMO = {
  injury: {
    medical: 12000, dailyIncome: 300, lostDays: 20,
    careDaily: 150, careDays: 10, nutritionDaily: 30, nutritionDays: 20,
    mealDaily: 50, hospitalDays: 15,
    disabilityBase: 40000, disabilityYears: 20, disabilityCoef: 10,
    mental: 5000, transport: 800,
  },
  labor: { monthlyWage: 8000, workYears: 3.5, socialAvgWage: 10000, mode: 'N', noticeMonth: false },
  interest: { principal: 100000, rate: 6, start: '2024-01-01', end: '2024-12-31' },
  penalty: { base: 200000, rate: 20, actualLoss: 20000 },
};
