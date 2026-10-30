import { createPlugin, pkgRootFrom } from '@deepwhale-cn/dsh-guard-core/plugin';
import { registerApi } from './api.js';

const base = createPlugin({
  name: 'legal-damages',
  pkgRoot: pkgRootFrom(import.meta.url),
  skillFile: 'skill/damages-calc.md',
  binFile: 'bin/cli.mjs',
  description: '深鲸损害赔偿计算器：人身损害、劳动争议（N/2N/加班费/年假/二倍工资）、借款利息（可分段）、违约金（含 30% 调减提示）四类表单计算',
  whenToUse: '当用户要算赔偿金额、误工费、经济补偿 N/2N、加班费、未休年假、二倍工资、借款利息或违约金时使用：' +
    '每项给出公式与代入值，可手算复核；缺地方标准时报「按当地标准待填」，不编数字。',
});
export const name = base.name;
export const inject = [...base.inject, 'webServer'];
export function apply(ctx) {
  base.apply(ctx);
  try {
    if (ctx.webServer?.register) registerApi(ctx);
  } catch (e) {
    ctx.logger?.warn?.('[legal-damages] 面板出口注册失败: ' + (e?.message || e));
  }
}
