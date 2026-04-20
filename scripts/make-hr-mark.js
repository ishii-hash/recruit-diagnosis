/**
 * hr_hacker_logo.png から上部のハートマーク部分のみ切り出す
 * 実行: node scripts/make-hr-mark.js
 */
const { Jimp } = require('jimp');
const path = require('path');

const SRC = path.join(__dirname, '..', 'img', 'hr_hacker_logo.png');
const DST = path.join(__dirname, '..', 'img', 'hr_hacker_mark.png');

(async () => {
  const img = await Jimp.read(SRC);
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  // テキスト部分を除き、上部のマーク(約70%)を残す
  const cropH = Math.round(H * 0.70);
  img.crop({ x: 0, y: 0, w: W, h: cropH });
  await img.write(DST);
  console.log('written:', DST, `${W}x${cropH}`);
})();
