(function () {
  const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.renderLearnVisual = function (spec) {
    if (typeof spec !== 'string' || spec.length > 360) return '';
    const [kind, ...parts] = spec.split('|').map(s=>s.trim());
    if (kind.toLowerCase() === 'fraction' && parts.length === 1) {
      const match = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(parts[0]);
      if (!match) return '';
      const n=Number(match[1]),d=Number(match[2]);
      if(d<1||d>12||n>d)return '';
      const cells=Array.from({length:d},(_,i)=>'<rect x="'+(12+i*336/d).toFixed(2)+'" y="12" width="'+(336/d-3).toFixed(2)+'" height="44" rx="4" class="'+(i<n?'lv-filled':'lv-empty')+'"/>').join('');
      return '<figure class="learn-visual"><figcaption>Equal-part model</figcaption><svg viewBox="0 0 360 68" role="img" aria-label="'+d+' equal parts, '+n+' shaded">'+cells+'</svg></figure>';
    }
    if (kind.toLowerCase() === 'process' && parts.length >= 2 && parts.length <= 5 && parts.every(s=>s.length>0&&s.length<=60)) {
      return '<figure class="learn-visual"><figcaption>Process at a glance</figcaption><ol class="lv-flow">'+parts.map(s=>'<li><span>'+esc(s)+'</span></li>').join('')+'</ol></figure>';
    }
    return '';
  };
})();
