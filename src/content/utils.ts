/** content 侧工具：转发 shared 实现；applyParentheticalFilter 从本层 state 读取开关 */
import { state } from './state';
import { applyParentheticalFilter as filterText, sleep } from '../shared/utils';

export { sleep };

export function applyParentheticalFilter(text: string): string {
  return filterText(text, state.removeParentheticals);
}
