// TrueReview — smarter heuristics + English & Hindi support (client-side)
const input = document.getElementById('input');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');
const resultPanel = document.getElementById('resultPanel');
const overallScoreEl = document.getElementById('overallScore');
const overallVerdictEl = document.getElementById('overallVerdict');
const reasonsEl = document.getElementById('reasons');
const detailsEl = document.getElementById('details');
const copyBtn = document.getElementById('copyBtn');
const shareBtn = document.getElementById('shareBtn');
const sensitivityEl = document.getElementById('sensitivity');
const modeEl = document.getElementById('mode');

const EN_POS = ["best","amazing","excellent","perfect","highly recommend","5 star","five star","love it","must buy","awesome","great","fantastic"];
const EN_NEG = ["disappointed","bad","never buy","poor","waste","not recommended","broken","return"];
const HI_POS = ["शानदार","बढ़िया","बहुत अच्छा","सर्वोत्तम","बेहतरीन","अच्छा","आश्चर्यजनक","सुपर"];
const HI_NEG = ["नाराज","खराब","ठग","बेकार","नहीं खरीदना","वापस"];

function detectLanguage(text){
  // simple: if contains Devanagari chars -> Hindi
  if(/[\u0900-\u097F]/.test(text)) return 'hi';
  return 'en';
}

function tokenize(text){
  return text.toLowerCase().replace(/[^0-9a-z\u0900-\u097F\s]/g,' ').split(/\s+/).filter(Boolean);
}

function analyzeSingle(text, sensitivity){
  const lang = detectLanguage(text);
  const tokens = tokenize(text);
  const words = tokens.length;
  const chars = text.length;
  let score = 0;
  const reasons = [];

  // Short generic (strong signal)
  if(words < 6) { score += 18 * sensitivity; reasons.push("Very short / generic"); }

  // Positive-words overuse
  const posList = lang === 'hi' ? HI_POS : EN_POS;
  const negList = lang === 'hi' ? HI_NEG : EN_NEG;
  let posCount = posList.reduce((s,w)=> s + (text.toLowerCase().includes(w)?1:0), 0);
  if(posCount >= 1){ score += Math.min(30, posCount * 10 * sensitivity); reasons.push("Many praise words"); }

  // emoji/exclamation overuse
  if(/[!]{2,}/.test(text) || /[\uD83C-\uDBFF\uDC00-\uDFFF]/.test(text)) { score += 8 * sensitivity; reasons.push("Emoji / excessive punctuation"); }

  // all caps (relevant to English)
  if(lang === 'en'){
    const capsRatio = (text.replace(/[^A-Z]/g,'').length) / Math.max(1, chars);
    if(capsRatio > 0.12){ score += 8 * sensitivity; reasons.push("Many ALL-CAPS letters"); }
  }

  // promo content (numbers / URLs / contact)
  if(/\d{6,}|https?:\/\/\S+|@/.test(text)) { score += 14 * sensitivity; reasons.push("Contains contact/URL/promo text"); }

  // repeated templated language
  const uniq = new Set(tokens);
  if((uniq.size / Math.max(1, words)) < 0.45 && words < 40){ score += 8 * sensitivity; reasons.push("Repeating or templated wording"); }

  // long but suspicious if many praise words
  if(words > 80 && posCount/words > 0.05){ score += 12 * sensitivity; reasons.push("Very long with many praise words"); }

  // negative words reduce fake score (increases credibility)
  const negCount = negList.reduce((s,w)=> s + (text.toLowerCase().includes(w)?1:0), 0);
  if(negCount > 0){ score = Math.max(0, score - 18 * sensitivity); reasons.push("Contains criticism (increases credibility)"); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  let verdict = "Likely Real";
  if(score >= 65) verdict = "Likely Fake";
  else if(score >= 35) verdict = "Suspicious";

  return {text, lang, score, verdict, reasons};
}

function analyzeAll(raw, sensitivity, mode){
  const blocks = raw.split(/\n{2,}|[\r\n]{2,}/).map(s=>s.trim()).filter(Boolean);
  if(blocks.length === 0) return null;
  const results = blocks.map(b => analyzeSingle(b, sensitivity));
  // aggregate
  const avg = Math.round(results.reduce((s,r)=>s+r.score,0)/results.length);
  const combined = [...new Set(results.flatMap(r => r.reasons))].slice(0,8);
  return {avg, results, combined};
}

function renderReport(report){
  if(!report) return;
  resultPanel.classList.remove('hidden');
  overallScoreEl.textContent = report.avg + "%";
  overallScoreEl.style.color = report.avg >= 65 ? getComputedStyle(document.documentElement).getPropertyValue('--danger') : report.avg >= 35 ? getComputedStyle(document.documentElement).getPropertyValue('--warn') : getComputedStyle(document.documentElement).getPropertyValue('--success');
  overallVerdictEl.textContent = report.avg >= 65 ? "Likely Fake" : report.avg >= 35 ? "Suspicious" : "Likely Real";

  // reasons chips
  reasonsEl.innerHTML = report.combined.map(r => `<span class="chip">${escapeHtml(r)}</span>`).join('');

  // details per block
  detailsEl.innerHTML = report.results.map((r, idx) => `
    <div class="detailsCard">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div><strong>Block ${idx+1}</strong> — <span style="font-weight:700">${r.score}%</span> <span class="muted" style="margin-left:8px">${r.lang.toUpperCase()}</span></div>
        <div style="font-size:13px;color:var(--muted)">${r.verdict}</div>
      </div>
      <div style="margin-top:8px" class="detailItem">
        <div style="font-size:13px;color:var(--muted)">${r.reasons.join(' • ') || 'No obvious issues detected'}</div>
        <div style="margin-top:8px;color:#cfe6ff">${escapeHtml(r.text)}</div>
      </div>
    </div>
  `).join('');
}

// UI handlers
analyzeBtn.addEventListener('click', () => {
  const raw = input.value || '';
  if(!raw.trim()){ alert('Please paste a review first.'); return; }
  const sensitivity = Number(sensitivityEl.value); // 1..3
  const mode = modeEl.value;
  const report = analyzeAll(raw, sensitivity, mode);
  renderReport(report);
});

clearBtn.addEventListener('click', () => {
  input.value = '';
  resultPanel.classList.add('hidden');
  detailsEl.innerHTML = '';
  reasonsEl.innerHTML = '';
  overallScoreEl.textContent = '—';
  overallVerdictEl.textContent = '—';
});

copyBtn.addEventListener('click', () => {
  const reportText = detailsEl.innerText || overallScoreEl.innerText;
  navigator.clipboard?.writeText(reportText).then(()=> alert('Report copied to clipboard.'));
});

shareBtn.addEventListener('click', (e) => {
  e.preventDefault();
  // craft a simple share via data URL
  const summary = `TrueReview result: ${overallScoreEl.innerText} - ${overallVerdictEl.innerText}`;
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(summary+' via TrueReview')}`;
  window.open(url,'_blank');
});

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
