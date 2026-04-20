/* =========================================================
   main.js — TOP画面
   URL入力 → /api/analyze → sessionStorage → 結果画面へ
   ローカルで開いた場合（file://）は API を呼ばずダミーデータで結果画面に遷移
   ========================================================= */
(function () {
  const form = document.getElementById('analyze-form');
  if (!form) return;

  const input  = document.getElementById('url-input');
  const button = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;

    let url;
    try { url = new URL(raw); }
    catch { return showError('正しいURLを入力してください（例: https://example.com/recruit/）'); }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return showError('http/https のURLを入力してください');
    }

    // ローカル動作（file://）はAPI呼ばず、ダミーで結果画面へ
    if (location.protocol === 'file:') {
      location.href = 'result.html?url=' + encodeURIComponent(url.href);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.href })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '診断に失敗しました');

      // 結果をsessionStorageに保存して結果画面へ
      sessionStorage.setItem('analysis_result', JSON.stringify(data));
      location.href = 'result.html?url=' + encodeURIComponent(url.href);
    } catch (err) {
      console.error(err);
      showError(err.message || '診断に失敗しました。時間をおいて再度お試しください。');
      setLoading(false);
    }
  });

  function setLoading(loading) {
    if (loading) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = '診断中…（20〜40秒）';
      button.style.opacity = '.7';
      button.style.cursor = 'wait';
      input.disabled = true;
    } else {
      button.disabled = false;
      if (button.dataset.originalText) button.textContent = button.dataset.originalText;
      button.style.opacity = '';
      button.style.cursor = '';
      input.disabled = false;
    }
  }

  function showError(msg) {
    let el = document.getElementById('form-error');
    if (!el) {
      el = document.createElement('p');
      el.id = 'form-error';
      el.style.cssText = 'color:#E60012;font-size:13px;margin-top:10px;font-weight:700;';
      form.appendChild(el);
    }
    el.textContent = msg;
  }
})();
