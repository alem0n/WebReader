/**
 * 布尔开关型配置的统一声明（popup 主界面与网页悬浮窗共用同一份）。
 *
 * 新增开关只需在 TOGGLE_SETTINGS 追加一项，即可获得：
 *   - 两层 UI 自动渲染（popup 与悬浮窗永远对齐，不必再改两处界面模板 / 文案）
 *   - 持久化键自动注册（shared/settings 的 SETTING_KEYS 派生全部开关键）
 *   - 从属联动自动生效（dependsOn：被依赖开关关闭时本项禁用）
 *   - 存储缺失时按声明默认值兜底
 * 另需在 content/state.ts、popup/state.ts 加同名布尔字段，以及各层业务读取点。
 *
 * 文案一律写死中文（AGENTS.md §1.1：不新增 i18n 键）；界面语言切换不作用于本表。
 */
export type ToggleKey = 'removeParentheticals' | 'inlineDisplayEnabled' | 'autoScrollEnabled';

interface ToggleSettingDef {
  key: ToggleKey;
  /** 开关显示文案（写死中文） */
  label: string;
  /** 悬停说明（写死中文） */
  title: string;
  /** 存储缺失时的默认值 */
  default: boolean;
  /** 从属于另一开关：被依赖开关关闭时本项禁用（如自动滚动从属于网页内高亮） */
  dependsOn?: ToggleKey;
}

export const TOGGLE_SETTINGS: ToggleSettingDef[] = [
  {
    key: 'removeParentheticals',
    label: '删除括号内容',
    title: '朗读前删除括号及其中的内容（支持中英文圆括号、方括号、花括号，可嵌套）',
    default: true,
  },
  {
    key: 'inlineDisplayEnabled',
    label: '网页内高亮当前朗读',
    title: '整页朗读时在网页原位高亮正在朗读的句子（原文保持不变，仅高亮不加框），无需看本文本框',
    default: true,
  },
  {
    key: 'autoScrollEnabled',
    label: '朗读时自动滚动页面',
    title: '朗读时自动把高亮句滚动到页面中部（需开启上一项；关闭后只高亮、不移动浏览器滚动条）',
    default: true,
    dependsOn: 'inlineDisplayEnabled',
  },
];

/** 所有开关键（供持久化层派生存储键、供两层渲染遍历） */
export const TOGGLE_KEYS: ToggleKey[] = TOGGLE_SETTINGS.map((d) => d.key);
