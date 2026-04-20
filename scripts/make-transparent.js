/**
 * invision_logo.jpg を以下2種類のPNGに変換:
 *   1) invision_logo.png        — 白背景のみ透過（黒ロゴはそのまま）
 *   2) invision_logo_white.png  — 白背景透過 + 黒→白反転（赤は維持）
 * 実行: node scripts/make-transparent.js
 */
const { Jimp } = require('jimp');
const path = require('path');

const SRC = path.join(__dirname, '..', 'img', 'invision_logo.jpg');
const DST_NORMAL = path.join(__dirname, '..', 'img', 'invision_logo.png');
const DST_WHITE  = path.join(__dirname, '..', 'img', 'invision_logo_white.png');

const WHITE_TH = 240;  // 白背景判定
const RED_TH = 1.4;    // 赤が他より何倍強いか

(async () => {
  // 1) 白背景のみ透過
  {
    const img = await Jimp.read(SRC);
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
      const r = this.bitmap.data[idx];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      if (r >= WHITE_TH && g >= WHITE_TH && b >= WHITE_TH) {
        this.bitmap.data[idx + 3] = 0;
      }
    });
    await img.write(DST_NORMAL);
    console.log('written:', DST_NORMAL);
  }

  // 2) 白背景透過 + 黒→白反転（赤は維持）
  {
    const img = await Jimp.read(SRC);
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, idx) {
      const r = this.bitmap.data[idx];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];

      if (r >= WHITE_TH && g >= WHITE_TH && b >= WHITE_TH) {
        // 白背景 → 透過
        this.bitmap.data[idx + 3] = 0;
      } else if (r > g * RED_TH && r > b * RED_TH && r > 100) {
        // 赤系 → そのまま
      } else {
        // それ以外（黒〜グレー）→ 白に反転
        this.bitmap.data[idx]     = 255;
        this.bitmap.data[idx + 1] = 255;
        this.bitmap.data[idx + 2] = 255;
      }
    });
    await img.write(DST_WHITE);
    console.log('written:', DST_WHITE);
  }
})();
