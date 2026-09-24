/**
 * 站点规则（移植自 kiss-translator config/rules.js 的 RULES_MAP，
 * 仅保留与正文采集相关的字段：autoScan / selector / ignoreSelector /
 * blockSelector / rootsSelector）。
 */
import { DEFAULT_IGNORE_SELECTOR, DEFAULT_SELECTOR } from './selectors';

export interface ExtractRule {
  /** 是否启用智能扫描（"true" 启用裸文本遍历，"false" 仅用 selector） */
  autoScan: string;
  /** 显式模式下的正文元素选择器 */
  selector: string;
  /** 额外忽略选择器 */
  ignoreSelector: string;
  /** 自定义块级元素选择器 */
  blockSelector: string;
  /** 限制扫描仅在特定根容器内进行 */
  rootsSelector: string;
}

export const DEFAULT_RULE: ExtractRule = {
  autoScan: 'true',
  selector: DEFAULT_SELECTOR,
  ignoreSelector: DEFAULT_IGNORE_SELECTOR,
  blockSelector: '',
  rootsSelector: 'body',
};

export interface SiteRule {
  /** 匹配网址的通配符模式（逗号/换行分隔表示或） */
  pattern: string;
  rule: Partial<ExtractRule>;
}

/** 顺序敏感：更具体的模式（如 live_chat）必须排在通用模式（如 youtube.com）之前 */
export const SITE_RULES: SiteRule[] = [
  {
    // 限定到正文容器 #mw-content-text：标题栏/语言按钮/粘性工具栏/分类列表
    // 均在该容器之外，从根上排除，无需逐一枚举噪声选择器。
    pattern: '.wikipedia.org',
    rule: {
      rootsSelector: '#mw-content-text',
      ignoreSelector: `.button, code, footer, form, mark, pre, .mwe-math-element, .mw-editsection, .sidebar, .navbox`,
    },
  },
  {
    pattern: 'news.ycombinator.com',
    rule: {
      selector: `p, .titleline, .commtext, .hn-item-title, .hn-comment-text, .hn-story-title`,
      ignoreSelector: `button, code, footer, form, header, mark, nav, pre, .reply`,
      autoScan: 'false',
    },
  },
  {
    pattern: 'twitter.com, https://x.com',
    rule: {
      selector: `[data-testid='tweetText'], [data-testid='twitter-article-title'], [data-testid='UserDescription'], .public-DraftStyleDefault-block, span.text-body, div.css-175oi2r.r-3pj75a div.css-175oi2r>span, div.css-175oi2r.r-3pj75a li>span, div.r-1s2bzr4>div.r-16dba41, div.r-16y2uox>div.r-1jeg54m`,
      ignoreSelector: `[data-testid='videoPlayer'], [data-testid^='tweetTextarea']`,
      autoScan: 'false',
    },
  },
  {
    pattern: 'www.youtube.com/live_chat',
    rule: {
      rootsSelector: `div#items`,
      selector: `span.yt-live-chat-text-message-renderer`,
      autoScan: 'false',
    },
  },
  {
    pattern: 'www.youtube.com',
    rule: {
      rootsSelector: `ytd-page-manager`,
      ignoreSelector: `aside, button, footer, form, header, pre, mark, nav, #player, #container, .caption-window, .ytp-settings-menu`,
    },
  },
  {
    pattern: 'web.telegram.org',
    rule: {
      autoScan: 'false',
      selector: '.text-content, .embedded-text-wrapper',
      rootsSelector: '.Transition',
    },
  },
  {
    pattern: 'github.com',
    rule: {
      autoScan: 'false',
      selector: `h1, h2, h3, h4, h5, h6, .markdown-body li, p, dd, blockquote, figcaption, label, legend, .user-profile-bio>div, [data-testid="results-list"] .search-match, .Subhead-description, [class^="prc-SelectPanel-Subtitle-"], [class^="prc-ActionList-ItemLabel-"], [role="dialog"] .overflow-auto, .h4, .repos-list-description, .discussion-title, [class*="PinnedIssue-module__Link"] span, .js-wiki-sidebar-page-container :is(.Truncate-text, .Link--primary)`,
      ignoreSelector: `button, p.pinned-item-desc+p`,
    },
  },
];
