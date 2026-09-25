/**
 * 界面显示名翻译表聚合入口（原 `language-names.ts`）。
 *
 * 对外导出形状不变：languageNames / languageTranslations / countryNamesEn /
 * countryTranslations / genderTranslations。各界面语言的翻译表拆成单独模块
 * （见各 `<locale>.ts`），新增界面语言只需加一个文件并在下面两个映射里登记。
 */
import { languageNames } from './language-names-en';
import { countryNamesEn } from './country-names-en';
import { genderTranslations } from './gender-translations';

import { languageNameRu, countryNamesRu } from './ru';
import { languageNameDe, countryNamesDe } from './de';
import { languageNameFr, countryNamesFr } from './fr';
import { languageNameEs, countryNamesEs } from './es';
import { languageNameIt, countryNamesIt } from './it';
import { languageNamePl, countryNamesPl } from './pl';
import { languageNamePt, countryNamesPt } from './pt';
import { languageNameNl, countryNamesNl } from './nl';
import { languageNameTr, countryNamesTr } from './tr';
import { languageNameJa, countryNamesJa } from './ja';
import { languageNameKo, countryNamesKo } from './ko';
import { languageNameZh, countryNamesZh } from './zh';
import { languageNameHi, countryNamesHi } from './hi';
import { languageNameDa, countryNamesDa } from './da';
import { languageNameSv, countryNamesSv } from './sv';
import { languageNameFi, countryNamesFi } from './fi';
import { languageNameNo, countryNamesNo } from './no';

export { languageNames, countryNamesEn, genderTranslations };

export const languageTranslations: Record<string, Record<string, string> | null> = {
  en: null,
  ru: languageNameRu,
  de: languageNameDe,
  fr: languageNameFr,
  es: languageNameEs,
  it: languageNameIt,
  pl: languageNamePl,
  pt_PT: languageNamePt,
  nl: languageNameNl,
  tr: languageNameTr,
  ja: languageNameJa,
  ko: languageNameKo,
  zh_CN: languageNameZh,
  hi: languageNameHi,
  da: languageNameDa,
  sv: languageNameSv,
  fi: languageNameFi,
  no: languageNameNo,
};

export const countryTranslations: Record<string, Record<string, string>> = {
  en: countryNamesEn,
  ru: countryNamesRu,
  de: countryNamesDe,
  fr: countryNamesFr,
  es: countryNamesEs,
  it: countryNamesIt,
  pl: countryNamesPl,
  pt_PT: countryNamesPt,
  nl: countryNamesNl,
  tr: countryNamesTr,
  ja: countryNamesJa,
  ko: countryNamesKo,
  zh_CN: countryNamesZh,
  hi: countryNamesHi,
  da: countryNamesDa,
  sv: countryNamesSv,
  fi: countryNamesFi,
  no: countryNamesNo,
};
