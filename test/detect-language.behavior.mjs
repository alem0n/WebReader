/**
 * detect-language 行为锁定测试
 *
 * 语言检测是纯函数，`docs/tech-debt.md` TD-003 要求拆分时「签名与结果完全不变」。
 * 本测试在拆分前用各语言样本跑出真实输出并固化为断言，作为重构前后的回归基线。
 * 运行：node test/detect-language.behavior.mjs
 */

import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

const outfile = resolve(__dirname, '.detect-language.bundle.mjs');
await esbuild.build({
  entryPoints: [resolve(root, 'src/shared/detect-language/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  outfile,
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});
const { detectLanguage } = await import(pathToFileURL(outfile).href);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`      ${err.message}`);
  }
}

// 各语言样本（长文本走加权评分路径）
const cases = {
  '中文 => zh-CN': ['今天天气很好，我们一起去公园里面散步，看看花草树木，呼吸新鲜空气，感觉非常放松和愉快，心情特别舒畅。', 'zh-CN'],
  '日本語(仮名) => ja-JP': ['今日はとてもいい天気です。公園を散歩しながら、花や鳥を見て、新鮮な空気を吸っています。とてもリラックスします。', 'ja-JP'],
  '한국어 => ko-KR': ['오늘은 정말 좋은 날씨입니다. 공원에서 산책하면서 꽃과 새들을 보고 신선한 공기를 마셨습니다. 정말 편안한 시간이었습니다.', 'ko-KR'],
  'Русский => ru-RU': ['Сегодня очень хорошая погода. Мы гуляли по парку, смотрели на цветы и птиц, дышали свежим воздухом. Это было очень приятно.', 'ru-RU'],
  'Български 样本 => ru-RU(既有行为)': ['Днес е много хубаво време. Ние се разхождахме в парка и гледахме цветята. Беше много приятно и спокойно.', 'ru-RU'],
  'Українська => uk-UA': ['Сьогодні дуже гарна погода. Ми гуляли в парку, дивилися на квіти та птахів. Це було дуже приємно і спокійно.', 'uk-UA'],
  'Deutsch => de-DE': ['Heute ist das Wetter sehr schön. Wir spazierten im Park und betrachteten die Blumen und Vögel. Es war sehr angenehm.', 'de-DE'],
  'Français 样本 => it-IT(既有行为)': ["Aujourd'hui, le temps est très beau. Nous nous sommes promenés dans le parc et nous avons regardé les fleurs et les oiseaux.", 'it-IT'],
  'Español => es-ES': ['Hoy hace muy buen tiempo. Paseamos por el parque y miramos las flores y los pájaros. Fue muy agradable y relajante.', 'es-ES'],
  'Português 样本 => vi-VN(既有行为)': ['Hoje o tempo está muito bom. Passeámos no parque e olhamos para as flores e os pássaros. Foi muito agradável e relaxante.', 'vi-VN'],
  'Italiano => it-IT': ['Oggi il tempo è molto bello. Abbiamo passeggiato nel parco e guardato i fiori e gli uccelli. È stato molto piacevole.', 'it-IT'],
  'Polski => pl-PL': ['Dziś jest bardzo ładna pogoda. Spacerowaliśmy po parku i oglądaliśmy kwiaty oraz ptaki. To było bardzo przyjemne i relaksujące.', 'pl-PL'],
  'Svenska => sv-SE': ['Idag är vädret väldigt fint. Vi promenerade i parken och tittade på blommor och fåglar. Det var väldigt trevligt och avkopplande.', 'sv-SE'],
  'Dansk => da-DK': ['I dag er vejret meget dejligt. Vi gik tur i parken og kiggede på blomster og fugle. Det var meget behageligt og afslappende.', 'da-DK'],
  'Suomi => fi-FI': ['Tänään on todella kaunis sää. Kävelimme puistossa ja katselimme kukkia ja lintuja. Se oli todella mukavaa ja rentouttavaa.', 'fi-FI'],
  'Norsk 样本 => da-DK(既有行为)': ['I dag er været veldig fint. Vi gåtur i parken og så på blomster og fugler. Det var veldig hyggelig og avslappende.', 'da-DK'],
  'Türkçe => tr-TR': ['Bugün hava çok güzel. Parkta yürüyüş yaptık ve çiçeklere ve kuşlara baktık. Çok keyifli ve rahatlatıcıydı.', 'tr-TR'],
  'Nederlands => nl-NL': ['Vandaag is het weer heel mooi. We liepen door het park en keken naar de bloemen en de vogels. Het was erg prettig en ontspannen.', 'nl-NL'],
  'Ελληνικά => el-GR': ['Σήμερα ο καιρός είναι πολύ ωραίος. Περπατήσαμε στο πάρκο και κοιτάξαμε τα λουλούδια και τα πουλιά. Ήταν πολύ ευχάριστο.', 'el-GR'],
  'Čeština => cs-CZ': ['Dnes je velmi hezké počasí. Procházeli jsme se v parku a dívali se na květiny a ptáky. Bylo to velmi příjemné a uklidňující.', 'cs-CZ'],
  'Magyar => hu-HU': ['Ma nagyon szép az időjárás. Sétáltunk a parkban és megnéztük a virágokat és a madarakat. Nagyon kellemes és lazító volt.', 'hu-HU'],
  'Română 样本 => vi-VN(既有行为)': ['Astăzi vremea este foarte frumoasă. Ne-am plimbat în parc și am privit florile și păsările. A fost foarte plăcut și relaxant.', 'vi-VN'],
  'हिन्दी => hi-IN': ['आज मौसम बहुत अच्छा है। हम पार्क में टहले और फूलों और पक्षियों को देखा। यह बहुत सुखद और आरामदायक था।', 'hi-IN'],
  'עברית => he-IL': ['היום מזג האוויר יפה מאוד. טיילנו בפארק וצפינו בפרחים ובציפורים. היה נעים ומרגיע מאוד.', 'he-IL'],
  'العربية => ar': ['اليوم الطقس جميل جدا. تجولنا في الحديقة ونظرنا إلى الزهور والطيور. كان لطيفا ومريحا جدا.', 'ar'],
  'Tiếng Việt => vi-VN': ['Hôm nay thời tiết rất đẹp. Chúng tôi đi dạo trong công viên và ngắm hoa và chim. Thật là dễ chịu và thư giãn.', 'vi-VN'],
  'English => en-US': ['The weather is very nice today. We walked in the park and looked at the flowers and the birds. It was very pleasant and relaxing.', 'en-US'],
  // 短文本（<20 字）走字符脚本回退路径
  '短中文 => zh-CN': ['今天天气真不错', 'zh-CN'],
  '短日文(仮名) => ja-JP': ['今日はいい天気です', 'ja-JP'],
  '短韩文 => ko-KR': ['오늘 날씨가 좋습니다', 'ko-KR'],
  '短俄文 => ru-RU': ['Сегодня хорошая погода', 'ru-RU'],
  '短阿拉伯文 => ar': ['الطقس جميل اليوم جدا', 'ar'],
  '短印地文 => hi-IN': ['आज मौसम अच्छा है', 'hi-IN'],
  '短希伯来文 => he-IL': ['מזג האוויר יפה', 'he-IL'],
  '短未知拉丁文 => null': ['hello world', null],
  '空字符串 => null': ['', null],
};

console.log('detect-language 行为锁定:');
for (const [name, [text, expected]] of Object.entries(cases)) {
  test(name, () => {
    assert.equal(detectLanguage(text), expected);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
