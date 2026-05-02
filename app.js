// ============================================================
//  app.js — 読書ログ (GitHub手動同期版)
//
//  同期の仕組み：
//  ・起動時: GitHubのpublicリポジトリからdata.jsonをfetch（認証不要）
//  ・編集時: localStorageに自動保存
//  ・書き出し: 「💾 書き出し」でdata.jsonをダウンロード
//            → GitHubリポジトリにアップロードして他端末と共有
//  ・再読み込み: 「🔄 再読み込み」でGitHubから最新データを取得
// ============================================================

const App = (() => {

// ---- 設定 (設定ページから変更可) ----
// app.js の最初の設定部分
const getCfg = () => ({
  RAW_URL: localStorage.getItem('cfg_raw_url') || 'https://raw.githubusercontent.com/sinjouji/my-b0o0oksd6t6/refs/heads/main/data.json',
  // 例: https://raw.githubusercontent.com/sinjouji/my-b0o0oksd6t6/main/data.json
});
  
// ---- パレット・定数 ----
const PALETTE = [
  '#B52A40','#9E3A5A','#EB6E80','#D2553B','#E8A020','#C4A120',
  '#7DA23A','#1E7A4E','#4FA090','#3D8A9E','#3558A0','#2545A0',
  '#8B6DAE','#6B4D8A','#7D6E98','#C4A882','#7A5C35','#5A5050',
  '#8A7E78','#4A3B30'
];
const DEF_COLORS = ['#7B5EA7','#D45D79','#4A90A4','#5B8C5A','#C47C2B','#5A7DB5','#9B4E8E','#3D8B8B'];
const FAV_OPTS = [{v:1,l:'★'},{v:2,l:'★★'},{v:3,l:'★★★'},{v:4,l:'👑'}];
const FAV_C = {1:'#EF9F27',2:'#EF9F27',3:'#EF9F27',4:'#E6C200'};
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const WDAYS = ['日','月','火','水','木','金','土'];
const ACCENT_THEMES = [
  {name:'鮮緑',  accent:'#1D9E75',dark:'#0F6E56',bg:'#E1F5EE',text:'#085041'},
  {name:'呉須',  accent:'#3D6EAF',dark:'#2D5490',bg:'#E3ECF8',text:'#1A3B6A'},
  {name:'蘇芳',  accent:'#9e3d3e',dark:'#7e2e2f',bg:'#f4dada',text:'#5e2425'},
  {name:'古代紫',accent:'#6B5B9A',dark:'#524680',bg:'#EEEAF7',text:'#352568'},
  {name:'鴨の羽',accent:'#3D7A8A',dark:'#2C5C6A',bg:'#E0EEF1',text:'#1C454F'},
  {name:'朱華',  accent:'#c47c2b',dark:'#a36320',bg:'#faebd7',text:'#7a4910'},
];

// ---- 状態 ----
let books = [], tagMaster = [], series = [], characters = [], features = [];
let tagFilterModes = {};
let aTy = '', aFv = 0, sK = 'date', sD = 'desc';
let vM   = localStorage.getItem('vM') || 'list';
let spineGradMode = localStorage.getItem('spineGradMode') || 'single';
let tagChipOrder  = localStorage.getItem('tagChipOrder')  || 'freq-desc';
let serSearch = '', serSort = localStorage.getItem('serSort') || 'name', serSortDir = localStorage.getItem('serSortDir') || 'asc';
let charSearch = '', charSort = localStorage.getItem('charSort') || 'name', charSortDir = localStorage.getItem('charSortDir') || 'asc';
let mST = [], mSF = 0, mNP = 0;
let curDet = null, curSer = null, curChar = null, caSelSeries = [];
let prevPg = 'shelf', saBooks = [];
let statsYr = new Date().getFullYear();
let calYr = new Date().getFullYear(), calMo = new Date().getMonth() + 1;
let tagEditPalMap = {}, addPalIdx = 0;
let isDirty = false; // 未書き出し変更あり

// フィルター状態を復元
try {
  const s = JSON.parse(localStorage.getItem('filters') || '{}');
  tagFilterModes = s.tagFilterModes || {}; aTy = s.aTy || ''; aFv = s.aFv || 0; sK = s.sK || 'date'; sD = s.sD || 'desc';
} catch(e) {}

// ---- ローカルストレージキー ----
const LS_KEY = 'readinglog_data';

// ---- 同期バー ----
function setSyncBadge(state, msg) {
  const badge = document.getElementById('sync-badge');
  const msgEl = document.getElementById('sync-msg');
  badge.className = 'sync-badge ' + state;
  badge.textContent = state === 'ok' ? '✓ 保存済み' : state === 'dirty' ? '● 未書き出し' : '⟳ 読込中';
  if (msgEl) msgEl.textContent = msg || '';
}

function markDirty() {
  isDirty = true;
  setSyncBadge('dirty', '変更あり — 💾 書き出しでdata.jsonを保存してください');
  saveToLocal();
}

function saveToLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ books, tagMaster, series, characters, features }));
  } catch(e) { console.warn('localStorage save failed', e); }
}

function saveFilterState() {
  try { localStorage.setItem('filters', JSON.stringify({ tagFilterModes, aTy, aFv, sK, sD })); } catch(e) {}
}

// ---- データ読み込み ----
async function loadData() {
  try {
    const local = localStorage.getItem(LS_KEY);
    if (local) {
      const d = JSON.parse(local);
      books = d.books || []; tagMaster = d.tagMaster || [];
      series = d.series || []; characters = d.characters || [];
      features = d.features || defFeats();
    } else {
      features = defFeats();
    }
  } catch(e) { features = defFeats(); }

  const { RAW_URL } = getCfg();
  if (RAW_URL) {
    await reloadFromGitHub(true); // silent=true
  } else {
    setSyncBadge('ok', 'GitHub URLを設定ページで設定するとリモートから読み込めます');
    document.getElementById('sync-bar').classList.remove('hidden');
  }
  
  // ★ 絶対確実にローディング画面を消す
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

async function init() {
  initAccent();
  await loadData();
  
  // ★ loadData完了後に確実にUI初期化
  renderNav();
  document.getElementById('nb-shelf')?.classList.add('act');
  renderShelf();
}


  
async function reloadFromGitHub(silent = false) {
  const { RAW_URL } = getCfg();
  if (!RAW_URL) {
    if (!silent) alert('設定ページでGitHubのraw URLを設定してください。');
    return;
  }
  setSyncBadge('loading', 'GitHubから読み込み中...');
  document.getElementById('sync-bar').classList.remove('hidden');
  try {
    const res = await fetch(RAW_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    books = d.books || []; tagMaster = d.tagMaster || [];
    series = d.series || []; characters = d.characters || [];
    features = d.features || defFeats();
    saveToLocal();
    isDirty = false;
    setSyncBadge('ok', 'GitHubから読み込み完了');
    if (!silent) { renderNav(); renderShelf(); }
  } catch(e) {
    console.error('GitHub読み込みエラー:', e);  // ★ 追加
    setSyncBadge('dirty', 'GitHubからの読み込み失敗: ' + e.message);
    if (!silent) alert('GitHubからの読み込みに失敗しました。\nURLを確認してください。\n' + e.message);
  } finally {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }
}
// ---- JSON書き出し（ダウンロード） ----
function exportJSON() {
  const data = { books, tagMaster, series, characters, features };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'data.json';
  a.click();
  URL.revokeObjectURL(a.href);
  isDirty = false;
  setSyncBadge('ok', 'data.jsonをダウンロードしました。GitHubにアップロードして他端末と同期できます');
}

// ---- JSON読み込み（インポート） ----
function importJSON(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!confirm('現在のデータをインポートしたファイルで上書きします。よろしいですか？')) return;
      books = d.books || []; tagMaster = d.tagMaster || [];
      series = d.series || []; characters = d.characters || [];
      features = d.features || defFeats();
      saveToLocal(); isDirty = false;
      setSyncBadge('ok', 'インポート完了');
      renderNav(); renderShelf();
    } catch(err) { alert('JSONの読み込みに失敗しました: ' + err.message); }
  };
  reader.readAsText(file);
  input.value = '';
}

// ---- デフォルト機能リスト ----
function defFeats() {
  return [
    {id:'fav',       name:'お気に入り度',    desc:'4段階で評価を記録',       on:true},
    {id:'tags',      name:'タグ付け',         desc:'本にタグを付けて分類',     on:true},
    {id:'series',    name:'シリーズ管理',     desc:'続刊・シリーズをまとめる', on:true},
    {id:'characters',name:'登場人物',         desc:'人物一覧と関連付けを管理', on:true},
    {id:'readlog',   name:'読了ログ',         desc:'読んだ日付・回数を記録',   on:true},
    {id:'stats_tag', name:'タグ別統計',       desc:'タグ別グラフを表示',       on:true},
    {id:'stats_month',name:'月別読了数',      desc:'月ごとの統計を表示',       on:true},
    {id:'wishlist',  name:'ウィッシュリスト', desc:'読みたい本を管理',         on:true},
    {id:'memo',      name:'メモ欄',           desc:'各ページにメモ欄を表示',   on:false},
  ];
}

// ---- ユーティリティ ----
const feat    = id => features.find(f => f.id === id)?.on;
const tagById = id => tagMaster.find(t => t.id === id);
const bookById= id => books.find(b => b.id === id);
const charById= id => characters.find(c => c.id === id);
const today   = () => new Date().toISOString().slice(0, 10);
const favHtml = fav => { if (!fav) return ''; const o = FAV_OPTS.find(x => x.v === fav); return o ? `<span style="font-size:13px;color:${FAV_C[fav]}">${o.l}</span>` : ''; };
const chipsHtml = ids => ids.map(id => { const t = tagById(id); return t ? `<span class="chip chip-on" style="background:${t.color};font-size:11px">${t.name}</span>` : ''; }).join('');

function tagFreq() { const c = {}; books.forEach(b => b.tagIds.forEach(id => { c[id] = (c[id] || 0) + 1; })); return c; }
function sortedTags() { const f = tagFreq(); return [...tagMaster].sort((a, b) => { const d = (f[b.id]||0)-(f[a.id]||0); return d || a.name.localeCompare(b.name,'ja'); }); }
function latestDate(b) { const v = (b.dates || []).filter(d => d); return v.length ? v.slice().sort().reverse()[0] : ''; }
const readCount = b => (b.dates || []).filter(d => d).length;
function countYM(yr, mo) { const p = `${yr}-${String(mo).padStart(2,'0')}`; let n = 0; books.filter(b => b.type==='normal').forEach(b => { (b.dates||[]).forEach(d => { if (d && d.startsWith(p)) n++; }); }); return n; }
function countY(yr) { let n = 0; books.filter(b => b.type==='normal').forEach(b => { (b.dates||[]).forEach(d => { if (d && d.startsWith(String(yr))) n++; }); }); return n; }
function booksOnDate(ds) { return books.filter(b => b.type==='normal' && (b.dates||[]).includes(ds)); }
function seriesLatestDate(s) { let best = ''; s.bookIds.forEach(id => { const b = bookById(id); if (!b) return; const ld = latestDate(b); if (ld > best) best = ld; }); return best; }
function charSeriesNames(ch) { return (ch.seriesIds||[]).map(sid => { const s = series.find(x => x.id===sid); return s ? s.name : null; }).filter(Boolean); }
function spineColors(b) { if (b.tagIds&&b.tagIds.length>=2) { const t1=tagById(b.tagIds[0]),t2=tagById(b.tagIds[1]); if (t1&&t2) return [t1.color,t2.color]; } if (b.tagIds&&b.tagIds.length===1) { const t=tagById(b.tagIds[0]); if(t) return [t.color,t.color]; } const c=DEF_COLORS[b.id%DEF_COLORS.length]; return [c,c]; }
function spineW(b) { const l=b.title.length; return l<=4?32:l<=8?42:l<=14?52:62; }
function spineH(b) { return 155+(b.title.length>10?14:0)+(b.fav?28:0); }
function relevanceScore(bt, sn) { if(!sn) return 0; let s=0; if(bt.includes(sn)) s+=20; for(const c of sn) if(bt.includes(c)) s++; return s; }

// ---- タグチップ並び順 ----
function tagChipSorted() { const freq=tagFreq(); const tags=[...tagMaster]; if(tagChipOrder==='freq-desc') return tags.sort((a,b)=>(freq[b.id]||0)-(freq[a.id]||0)||a.name.localeCompare(b.name,'ja')); if(tagChipOrder==='freq-asc') return tags.sort((a,b)=>(freq[a.id]||0)-(freq[b.id]||0)||a.name.localeCompare(b.name,'ja')); if(tagChipOrder==='name-asc') return tags.sort((a,b)=>a.name.localeCompare(b.name,'ja')); if(tagChipOrder==='name-desc') return tags.sort((a,b)=>b.name.localeCompare(a.name,'ja')); return tags; }
function cycleTagChipOrder() { const o=['freq-desc','freq-asc','name-asc','name-desc']; tagChipOrder=o[(o.indexOf(tagChipOrder)+1)%o.length]; localStorage.setItem('tagChipOrder',tagChipOrder); renderSettings(); }
function tagChipOrderLabel() { return {['freq-desc']:'冊数↓',['freq-asc']:'冊数↑',['name-asc']:'名前↑',['name-desc']:'名前↓'}[tagChipOrder]||'冊数↓'; }

// ---- タグフィルター ----
function cycleTagFilter(id) { const cur=tagFilterModes[id]; if(!cur) tagFilterModes[id]='and'; else if(cur==='and') tagFilterModes[id]='or'; else if(cur==='or') tagFilterModes[id]='not'; else delete tagFilterModes[id]; saveFilterState(); renderFilterChips(); renderShelfList(); }
function bookPassesTagFilter(b) { const active=Object.keys(tagFilterModes).filter(id=>tagFilterModes[id]); if(!active.length) return true; const and=active.filter(id=>tagFilterModes[id]==='and'),or=active.filter(id=>tagFilterModes[id]==='or'),not=active.filter(id=>tagFilterModes[id]==='not'); if(and.length&&!and.every(id=>b.tagIds.includes(id))) return false; if(or.length&&!or.some(id=>b.tagIds.includes(id))) return false; if(not.some(id=>b.tagIds.includes(id))) return false; return true; }

// ---- ナビ ----
function renderNav() {
  const pages = [{id:'shelf',label:'本棚'},{id:'series',label:'シリーズ',hide:!feat('series')},{id:'characters',label:'登場人物',hide:!feat('characters')},{id:'stats',label:'統計'},{id:'settings',label:'設定'}];
  document.getElementById('nav-area').innerHTML =
    pages.filter(p=>!p.hide).map(p=>`<button class="nb" id="nb-${p.id}" onclick="App.goPage('${p.id}')">${p.label}</button>`).join('') +
    `<span style="display:inline-flex;gap:3px;margin-left:6px"><button class="view-btn ${vM==='list'?'act':''}" onclick="App.setView('list')">☰</button><button class="view-btn ${vM==='spine'?'act':''}" onclick="App.setView('spine')">📚</button></span>`;
}
function goPage(id, skip) {
  if (!skip && !['detail','series-detail','char-detail'].includes(id)) prevPg = id;
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  document.getElementById('pg-'+id).classList.add('on');
  document.querySelectorAll('.nb').forEach(b => b.classList.remove('act'));
  const nb = document.getElementById('nb-'+id); if (nb) nb.classList.add('act');
  if(id==='shelf')      renderShelf();
  if(id==='series')     renderSeriesPage();
  if(id==='characters') renderCharPage();
  if(id==='stats')      renderStats();
  if(id==='settings')   renderSettings();
}
function setView(m) { vM=m; localStorage.setItem('vM',m); renderNav(); renderShelf(); }

// ---- 本棚 ----
function renderShelf() {
  const pg = document.getElementById('pg-shelf');
  const yr=new Date().getFullYear(), mn=new Date().getMonth()+1, wO=feat('wishlist');
  pg.innerHTML = `
  <div class="row between" style="margin-bottom:12px">
    <div class="row" style="gap:10px">
      <div style="background:#eee;border-radius:10px;padding:8px 14px;text-align:center"><div style="font-size:20px;font-weight:500">${countY(yr)}</div><div style="font-size:11px;color:#888">今年</div></div>
      <div style="background:#eee;border-radius:10px;padding:8px 14px;text-align:center"><div style="font-size:20px;font-weight:500">${countYM(yr,mn)}</div><div style="font-size:11px;color:#888">今月</div></div>
      ${wO?`<div style="background:#eee;border-radius:10px;padding:8px 14px;text-align:center"><div style="font-size:20px;font-weight:500">${books.filter(b=>b.type==='wish').length}</div><div style="font-size:11px;color:#888">ウィッシュ</div></div>`:''}
    </div>
    <button class="btn-pri" onclick="App.openBookModal()">+ 本を追加</button>
  </div>
  <div class="row" style="margin-bottom:8px;gap:6px">
    <input class="sinp" style="flex:1;min-width:0" type="text" placeholder="タイトルで検索..." oninput="App.renderShelfList()" id="shelf-q">
    <div class="row" style="gap:3px;flex-shrink:0" id="sort-btns"></div>
  </div>
  <div style="margin-bottom:8px"><div id="fr1" class="fg" style="margin-bottom:5px"></div><div id="fr2" class="fg"></div></div>
  <div id="shelf-list"></div>`;
  renderSortBtns(); renderFilterChips(); renderShelfList();
}
function renderSortBtns() { const el=document.getElementById('sort-btns'); if(!el) return; el.innerHTML=[{k:'title',l:'タイトル'},{k:'date',l:'読了日'},{k:'fav',l:'評価'}].map(s=>{const act=sK===s.k,arr=act?(sD==='asc'?'↑':'↓'):'';return`<button class="sort-btn ${act?'act':''}" onclick="App.setSort('${s.k}')">${s.l}${arr}</button>`;}).join(''); }
function setSort(k) { sK===k?(sD=sD==='asc'?'desc':'asc'):(sK=k,sD=k==='title'?'asc':'desc'); saveFilterState(); renderSortBtns(); renderShelfList(); }
function renderFilterChips() {
  const wO=feat('wishlist'),fO=feat('fav'),tO=feat('tags');
  let r1='';
  if(wO) [{v:'',l:'全種類'},{v:'normal',l:'読了'},{v:'wish',l:'ウィッシュ'}].forEach(o=>{const on=aTy===o.v;r1+=`<span class="cf${on?' mode-and':''}" style="${on?'background:#888780;border-color:#888780':''}" onclick="App.setTy('${o.v}')">${o.l}</span>`;});
  if(fO) [{v:0,l:'★全て'},{v:4,l:'👑'},{v:3,l:'★★★'},{v:2,l:'★★以上'},{v:1,l:'★以上'}].forEach(o=>{const on=aFv===o.v;r1+=`<span class="cf${on?' mode-and':''}" style="${on?'background:#EF9F27;border-color:#EF9F27':''}" onclick="App.setFv(${o.v})">${o.l}</span>`;});
  let r2='';
  if(tO){r2+='<span style="font-size:11px;color:#bbb;align-self:center">タップ:AND→OR→NOT</span>';tagChipSorted().forEach(t=>{const mode=tagFilterModes[t.id];let cls='cf',style='',lbl=t.name;if(mode==='and'){cls='cf mode-and';style=`background:${t.color};border-color:${t.color}`;}else if(mode==='or'){cls='cf mode-or';style=`background:${t.color};border-color:${t.color}`;lbl+=' OR';}else if(mode==='not'){cls='cf mode-not';style='background:#A32D2D;border-color:#A32D2D';}r2+=`<span class="${cls}" style="${style}" onclick="App.cycleTagFilter('${t.id}')">${lbl}</span>`;});}
  const e1=document.getElementById('fr1'),e2=document.getElementById('fr2');
  if(e1)e1.innerHTML=r1; if(e2)e2.innerHTML=r2;
}
function setTy(v){aTy=aTy===v&&v!==''?'':v;saveFilterState();renderFilterChips();renderShelfList();}
function setFv(v){aFv=aFv===v&&v!==0?0:v;saveFilterState();renderFilterChips();renderShelfList();}
function filteredBooks(){const q=(document.getElementById('shelf-q')?.value||'').toLowerCase(),wO=feat('wishlist');return books.filter(b=>{if(!wO&&b.type==='wish')return false;if(q&&!b.title.toLowerCase().includes(q))return false;if(aTy&&b.type!==aTy)return false;if(aFv&&(b.fav||0)<aFv)return false;if(!bookPassesTagFilter(b))return false;return true;}).slice().sort((a,b)=>{let c=0;if(sK==='title')c=a.title.localeCompare(b.title,'ja',{numeric:true,sensitivity:'base'});else if(sK==='date'){const da=latestDate(a),db=latestDate(b);c=da<db?-1:da>db?1:0;if(c===0)c=a.id-b.id;}else if(sK==='fav')c=(a.fav||0)-(b.fav||0);return sD==='asc'?c:-c;});}
function renderShelfList(){const el=document.getElementById('shelf-list');if(!el)return;const list=filteredBooks();if(!list.length){el.innerHTML='<div style="font-size:13px;color:#888;padding:12px">該当する本がありません</div>';return;}if(vM==='spine'){renderSpineShelves(list,el);}else{const rO=feat('readlog');el.innerHTML=list.map(b=>{const ld=latestDate(b),cnt=readCount(b);return`<div class="bitem ${b.type}" onclick="App.openDetail(${b.id})"><div class="row between"><div class="bt">${b.title}${b.type==='wish'?' <span class="wbadge">ウィッシュリスト</span>':''}</div>${rO&&cnt>0?`<span class="cnt">${cnt}回読了</span>`:''}</div><div class="brow">${ld?`<span class="bdate">${ld}</span>`:''}${feat('tags')?chipsHtml(b.tagIds):''}${feat('fav')?favHtml(b.fav):''}</div></div>`;}).join('');}}
function renderSpineShelves(list,container){const cw=container.clientWidth||window.innerWidth-32||600;const GAP=6;const rows=[];let row=[],rw=0;for(const b of list){const w=spineW(b);const need=rw===0?w:rw+GAP+w;if(rw>0&&need>cw){rows.push(row);row=[b];rw=w;}else{row.push(b);rw=need;}}if(row.length)rows.push(row);let html='<div class="spine-section">';for(const r of rows){html+='<div class="spine-row">';for(const b of r){const[c1,c2]=spineColors(b);const bgStyle=spineGradMode==='grad'&&c1!==c2?`background:linear-gradient(to bottom,${c1} 75%,${c2})`:spineGradMode==='split'&&c1!==c2?`background:linear-gradient(to bottom,${c1} 70%,${c2} 70%)`:`background:${c1}`;const w=spineW(b),h=spineH(b),fav=b.fav?FAV_OPTS.find(o=>o.v===b.fav)?.l:'';const dim=b.type==='wish'?'filter:brightness(0.72)':'';html+=`<div class="spine-book" style="${bgStyle};width:${w}px;height:${h}px;${dim}" onclick="App.openDetail(${b.id})" title="${b.title}">${b.type==='wish'?'<div class="spine-wish"></div>':''}<div class="spine-title">${b.title}</div>${fav?`<div class="spine-fav">${fav}</div>`:''}</div>`;}html+='</div><div class="shelf-board"></div>';}html+='</div>';container.innerHTML=html;}

// ---- 個別ページ ----
function openDetail(id){curDet=id;renderDetail();goPage('detail',true);}
function renderDetail(){
  const b=bookById(curDet);if(!b)return;const pg=document.getElementById('pg-detail');
  const bS=series.filter(s=>s.bookIds.includes(b.id));const notInSeries=series.filter(s=>!s.bookIds.includes(b.id)).sort((a,z)=>relevanceScore(b.title,z.name)-relevanceScore(b.title,a.name));
  const mS=b.memo&&b.memo.trim()!=='',cnt=readCount(b),rO=feat('readlog');
  pg.innerHTML=`<div class="row" style="margin-bottom:14px"><button class="btn btn-sm" onclick="App.goPage(prevPg)">← 戻る</button></div>
  <div class="card">
    <div class="row between" style="margin-bottom:12px"><div style="font-size:16px;font-weight:600" id="d-tt">${b.title}</div><div class="row" style="gap:6px"><button class="btn btn-sm" onclick="App.dupBook(${b.id})">複製</button><button class="btn btn-sm" onclick="App.togDE()">編集</button></div></div>
    <div id="d-ea" style="display:none;margin-bottom:12px"><div class="fr"><div class="fl">タイトル</div><input class="edit-inp" id="d-ti" value="${b.title}"></div><div class="row" style="justify-content:flex-end"><button class="btn-pri btn-sm" onclick="App.saveDT()">保存</button></div></div>
    ${feat('wishlist')?`<div class="df"><div class="dl">種別</div><div class="row" style="gap:6px"><span class="chip ${b.type==='normal'?'chip-on':'chip-off'}" style="${b.type==='normal'?'background:var(--accent)':''}" onclick="App.setDTy('normal')">読了</span><span class="chip ${b.type==='wish'?'chip-on':'chip-off'}" style="${b.type==='wish'?'background:#888780':''}" onclick="App.setDTy('wish')">ウィッシュリスト</span></div></div>`:''}
    ${rO?`<div class="df"><div class="row between" style="margin-bottom:6px"><div class="row" style="gap:8px"><div class="dl" style="margin:0">読了ログ</div>${cnt>0?`<span style="font-size:12px;color:#888">${cnt}回読了</span>`:''}</div><button class="btn btn-sm" onclick="App.addRR()">再読了</button></div><div id="d-dl"></div></div>`:''}
    ${feat('fav')?`<div class="df"><div class="dl">お気に入り度</div><div id="d-fc" class="row wrap" style="gap:6px;margin-top:3px"></div></div>`:''}
    ${feat('tags')?`<div class="df"><div class="dl">タグ</div><div id="d-tc" class="row wrap" style="gap:5px;margin-top:3px"></div></div>`:''}
    ${feat('memo')?`<div class="df"><div class="row between" style="margin-bottom:4px"><div class="dl">メモ</div><button class="btn btn-sm" onclick="App.togBME()">編集</button></div><div id="d-md" style="display:${mS?'block':'none'}"><div class="memo-disp">${(b.memo||'').replace(/</g,'&lt;')}</div></div><div id="d-me" style="display:${mS?'none':'block'}"><textarea class="memo-area" id="d-memo">${b.memo||''}</textarea><button class="btn-pri btn-sm" onclick="App.saveDM()" style="margin-top:5px">保存</button></div></div>`:''}
    ${feat('series')?`<div class="df"><div class="dl">シリーズ</div><div class="row wrap" style="gap:5px;margin-bottom:8px">${bS.length?bS.map(s=>`<span class="chip chip-on" style="background:var(--accent);cursor:pointer" onclick="App.openSerDet('${s.id}')">${s.name} →</span>`).join(''):'<span style="font-size:12px;color:#aaa">未登録</span>'}</div>${notInSeries.length?`<div class="row" style="gap:6px"><select class="sinp" id="d-ser-sel" style="flex:1"><option value="">シリーズに追加...</option>${notInSeries.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select><button class="btn btn-sm" onclick="App.addDetToSeries()">追加</button></div>`:''}<div style="margin-top:8px"><button class="btn btn-sm" onclick="App.createSeriesFromBook(${b.id})" style="font-size:12px">＋「${b.title}」でシリーズを新規作成</button></div></div>`:''}
    <div class="divider"></div>
    <button class="btn btn-sm btn-danger" onclick="App.delBook(${b.id})">この本を削除</button>
  </div>`;
  renderDDates();renderDFav();renderDTags();
}
function dupBook(id){const b=bookById(id);if(!b)return;const nb={...b,id:Date.now(),title:b.title+'c',dates:[...(b.dates||[])],tagIds:[...b.tagIds]};books.unshift(nb);series.forEach(s=>{if(s.bookIds.includes(id))s.bookIds.push(nb.id);});curDet=nb.id;renderDetail();markDirty();}
function addDetToSeries(){const sid=document.getElementById('d-ser-sel')?.value;if(!sid)return;const s=series.find(x=>x.id===sid);if(!s||s.bookIds.includes(curDet))return;s.bookIds.push(curDet);renderDetail();markDirty();}
function togDE(){const el=document.getElementById('d-ea');el.style.display=el.style.display==='none'?'':'none';}
function saveDT(){const b=bookById(curDet);if(!b)return;const v=document.getElementById('d-ti').value.trim();if(v)b.title=v;document.getElementById('d-tt').textContent=b.title;togDE();markDirty();}
function togBME(){const d=document.getElementById('d-md'),e=document.getElementById('d-me');const isE=e.style.display!=='none';d.style.display=isE?'block':'none';e.style.display=isE?'none':'block';}
function saveDM(){const b=bookById(curDet);if(!b)return;const val=document.getElementById('d-memo').value;b.memo=val;const d=document.getElementById('d-md'),e=document.getElementById('d-me');d.querySelector('.memo-disp').textContent=val;val.trim()?(d.style.display='block',e.style.display='none'):(d.style.display='none',e.style.display='block');markDirty();}
function setDTy(t){const b=bookById(curDet);if(!b)return;b.type=t;renderDetail();markDirty();}
function renderDDates(){const el=document.getElementById('d-dl');if(!el)return;const b=bookById(curDet);if(!b)return;el.innerHTML=!(b.dates&&b.dates.length)?'<div style="font-size:13px;color:#888">未設定</div>':b.dates.map((d,i)=>`<div class="row" style="gap:6px;margin-bottom:5px"><input class="edit-inp" type="date" value="${d}" style="flex:1" onchange="App.updD(${i},this.value)"><button class="btn btn-sm" onclick="App.clrD(${i})">クリア</button>${i>0?`<button class="btn btn-sm btn-danger" onclick="App.remD(${i})">削除</button>`:''}</div>`).join('');}
function addRR(){const b=bookById(curDet);if(!b)return;if(!b.dates)b.dates=[];b.dates.push(today());renderDetail();markDirty();}
function updD(i,v){const b=bookById(curDet);if(b){b.dates[i]=v;markDirty();}}
function clrD(i){const b=bookById(curDet);if(!b)return;b.dates[i]='';renderDDates();markDirty();}
function remD(i){const b=bookById(curDet);if(!b)return;b.dates.splice(i,1);renderDetail();markDirty();}
function renderDFav(){const el=document.getElementById('d-fc');if(!el)return;const b=bookById(curDet);if(!b)return;el.innerHTML=FAV_OPTS.map(o=>{const on=b.fav===o.v;return`<span class="chip ${on?'chip-on':'chip-off'}" style="${on?'background:'+FAV_C[o.v]:''}" onclick="App.setDF(${o.v})">${o.l}</span>`;}).join('');}
function setDF(v){const b=bookById(curDet);if(!b)return;b.fav=b.fav===v?0:v;renderDFav();markDirty();}
function renderDTags(){const el=document.getElementById('d-tc');if(!el)return;const b=bookById(curDet);if(!b)return;el.innerHTML=sortedTags().map(t=>{const on=b.tagIds.includes(t.id);return`<span class="chip ${on?'chip-on':'chip-off'}" style="${on?'background:'+t.color:''}" onclick="App.togDT('${t.id}')">${t.name}</span>`;}).join('');}
function togDT(id){const b=bookById(curDet);if(!b)return;b.tagIds=b.tagIds.includes(id)?b.tagIds.filter(x=>x!==id):[...b.tagIds,id];renderDTags();markDirty();}
function delBook(id){if(!confirm('この本を削除しますか？'))return;books=books.filter(b=>b.id!==id);series.forEach(s=>{s.bookIds=s.bookIds.filter(x=>x!==id);});goPage(prevPg);markDirty();}
function createSeriesFromBook(bookId){const b=bookById(bookId);if(!b)return;const name=b.title;if(series.find(s=>s.name===name)){alert(`「${name}」というシリーズはすでに存在します。`);return;}const ns={id:'s'+Date.now(),name,bookIds:[bookId],memo:''};series.push(ns);curSer=ns.id;renderDetail();markDirty();if(confirm(`シリーズ「${name}」を作成しました。シリーズページを開きますか？`)){openSerDet(ns.id);}}

// ---- シリーズ ----
function renderSeriesPage(){const pg=document.getElementById('pg-series');const filt=series.filter(s=>!serSearch||s.name.toLowerCase().includes(serSearch.toLowerCase()));const sorted=[...filt].sort((a,b)=>{let c=0;if(serSort==='name')c=a.name.localeCompare(b.name,'ja');else if(serSort==='date'){const da=seriesLatestDate(a),db=seriesLatestDate(b);c=da<db?-1:da>db?1:0;}return serSortDir==='asc'?c:-c;});pg.innerHTML=`<div class="row between" style="margin-bottom:10px"><div style="font-size:15px;font-weight:600">シリーズ</div><button class="btn" onclick="App.openSerAdd()">+ シリーズ追加</button></div><div class="row" style="gap:6px;margin-bottom:8px"><input class="sinp" style="flex:1;min-width:0" type="text" placeholder="シリーズを検索..." value="${serSearch}" oninput="serSearch=this.value;App.renderSeriesPage()"><div class="row" style="gap:3px;flex-shrink:0">${[{k:'name',l:'名前'},{k:'date',l:'読了日'}].map(s=>{const act=serSort===s.k,arr=act?(serSortDir==='asc'?'↑':'↓'):'';return`<button class="sort-btn ${act?'act':''}" onclick="App.setSerSort('${s.k}')">${s.l}${arr}</button>`;}).join('')}</div></div>${sorted.map(s=>`<div class="card" onclick="App.openSerDet('${s.id}')" style="cursor:pointer"><div class="row between"><div style="font-weight:500">${s.name}</div><div style="font-size:12px;color:#888">${s.bookIds.length}冊</div></div><div class="row wrap" style="gap:5px;margin-top:8px">${s.bookIds.map((id,i)=>{const b=bookById(id);return b?`<span class="vb ${b.type==='wish'?'unread':''}" title="${b.title}">${i+1}</span>`:''}).join('')}</div></div>`).join('')||'<div style="font-size:13px;color:#888">シリーズがありません</div>'}`;}
function setSerSort(k){serSort===k?(serSortDir=serSortDir==='asc'?'desc':'asc'):(serSort=k,serSortDir='asc');localStorage.setItem('serSort',serSort);localStorage.setItem('serSortDir',serSortDir);renderSeriesPage();}
function openSerAdd(){saBooks=[];document.getElementById('sa-name').value='';document.getElementById('sa-memo').value='';document.getElementById('sa-search').value='';document.getElementById('sa-memo-wrap').style.display=feat('memo')?'':'none';renderSABS();renderSABL();document.getElementById('series-add-modal').classList.add('open');}
function renderSABS(){const sel=document.getElementById('sa-book-sel');if(!sel)return;const q=(document.getElementById('sa-search')?.value||'').toLowerCase();const sName=(document.getElementById('sa-name')?.value||'');const candidates=books.filter(b=>!saBooks.includes(b.id)).filter(b=>!q||b.title.toLowerCase().includes(q)).sort((a,b)=>relevanceScore(b.title,sName)-relevanceScore(a.title,sName));sel.innerHTML='<option value="">本を選択...</option>'+candidates.map(b=>`<option value="${b.id}">${b.title}</option>`).join('');}
function addBookToNewSeries(){const id=parseInt(document.getElementById('sa-book-sel').value);if(!id||saBooks.includes(id))return;saBooks.push(id);renderSABS();renderSABL();}
function renderSABL(){const el=document.getElementById('sa-book-list');el.innerHTML=saBooks.map(id=>{const b=bookById(id);if(!b)return'';return`<div class="row between" style="padding:5px 0;border-bottom:1px solid #eee"><span>${b.title}</span><button class="btn btn-sm btn-danger" onclick="App.remSAB(${id})">外す</button></div>`;}).join('')||'<div style="font-size:12px;color:#888">まだ本が追加されていません</div>';}
function remSAB(id){saBooks=saBooks.filter(x=>x!==id);renderSABS();renderSABL();}
function saveNewSeries(){const name=document.getElementById('sa-name').value.trim();if(!name)return;series.push({id:'s'+Date.now(),name,bookIds:[...saBooks],memo:document.getElementById('sa-memo').value});document.getElementById('series-add-modal').classList.remove('open');renderSeriesPage();markDirty();}
function openSerDet(id){curSer=id;renderSerDet();goPage('series-detail',true);}
function renderSerDet(){
  const s=series.find(x=>x.id===curSer);if(!s)return;const mS=s.memo&&s.memo.trim()!=='';
  const linkedChars=characters.filter(c=>(c.seriesIds||[]).includes(s.id));
  document.getElementById('pg-series-detail').innerHTML=`<div class="row" style="margin-bottom:14px"><button class="btn btn-sm" onclick="App.goPage('series')">← シリーズ一覧</button></div>
  <div class="card">
    <div class="row between" style="margin-bottom:12px"><div style="font-size:16px;font-weight:600" id="sd-nd">${s.name}</div><button class="btn btn-sm" onclick="App.togSE()">編集</button></div>
    <div id="sd-ea" style="display:none;margin-bottom:10px"><input class="edit-inp" id="sd-ni" value="${s.name}" style="margin-bottom:6px"><div class="row" style="justify-content:flex-end"><button class="btn-pri btn-sm" onclick="App.saveSN()">保存</button></div></div>
    ${feat('memo')?`<div class="df"><div class="row between" style="margin-bottom:4px"><div class="dl">メモ</div><button class="btn btn-sm" onclick="App.togSME()">編集</button></div><div id="sd-md" style="display:${mS?'block':'none'}"><div class="memo-disp">${(s.memo||'').replace(/</g,'&lt;')}</div></div><div id="sd-me" style="display:${mS?'none':'block'}"><textarea class="memo-area" id="sd-memo">${s.memo||''}</textarea><button class="btn-pri btn-sm" onclick="App.saveSM()" style="margin-top:5px">保存</button></div></div>`:''}
    ${feat('characters')?`<div class="df"><div class="dl">登場人物</div><div class="row wrap" style="gap:5px;margin-top:4px;margin-bottom:6px">${linkedChars.length?linkedChars.map(c=>`<span class="chip chip-on" style="background:#7A5C35;cursor:pointer" onclick="App.openCharDet('${c.id}')">${c.name} →</span>`).join(''):'<span style="font-size:12px;color:#aaa">なし</span>'}</div></div>`:''}
    <div style="font-size:13px;font-weight:500;margin-bottom:4px">本を追加</div>
    <input class="edit-inp" id="sd-search" placeholder="タイトルで検索..." oninput="App.renderSDBL()" style="margin-bottom:6px">
    <div style="display:flex;gap:6px;margin-bottom:12px"><select class="sinp" id="sd-bs" style="flex:1"></select><button class="btn btn-sm" style="flex-shrink:0" onclick="App.addBtoS()">追加</button></div>
    <div style="font-size:13px;font-weight:500;margin-bottom:8px">登録されている本</div>
    <div id="sd-bl" style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px"></div>
    <div class="divider"></div>
    <button class="btn btn-sm" onclick="App.createBookFromSeries('${s.id}')" style="margin-bottom:6px">＋「${s.name}」で本を新規作成してシリーズに追加</button><br>
    <button class="btn btn-sm btn-danger" onclick="App.delSeries('${s.id}')">このシリーズを削除</button>
  </div>`;
  renderSDBL();
}
function togSME(){const d=document.getElementById('sd-md'),e=document.getElementById('sd-me');const isE=e.style.display!=='none';d.style.display=isE?'block':'none';e.style.display=isE?'none':'block';}
function saveSM(){const s=series.find(x=>x.id===curSer);if(!s)return;const val=document.getElementById('sd-memo').value;s.memo=val;const d=document.getElementById('sd-md'),e=document.getElementById('sd-me');d.querySelector('.memo-disp').textContent=val;val.trim()?(d.style.display='block',e.style.display='none'):(d.style.display='none',e.style.display='block');markDirty();}
function renderSDBL(){const s=series.find(x=>x.id===curSer);if(!s)return;const el=document.getElementById('sd-bl');if(el)el.innerHTML=s.bookIds.map((id,i)=>{const b=bookById(id);if(!b)return'';return`<div class="row between" style="padding:5px 0;border-bottom:1px solid #eee"><div class="row" style="gap:6px"><span class="vb" style="background:var(--accent);color:#fff">${i+1}</span><span class="chip chip-on" style="background:${b.type==='normal'?'var(--accent)':'#888780'};cursor:pointer;font-size:12px" onclick="App.openDetFS(${b.id})">${b.title}</span></div><button class="btn btn-sm btn-danger" onclick="App.remFS(${id})">外す</button></div>`;}).join('')||'<div style="font-size:13px;color:#888">まだ本が登録されていません</div>';const sel=document.getElementById('sd-bs');if(!sel)return;const q=(document.getElementById('sd-search')?.value||'').toLowerCase();const sName=(series.find(x=>x.id===curSer)||{}).name||'';const candidates=books.filter(b=>!s.bookIds.includes(b.id)).filter(b=>!q||b.title.toLowerCase().includes(q)).sort((a,b)=>relevanceScore(b.title,sName)-relevanceScore(a.title,sName));sel.innerHTML='<option value="">本を選択...</option>'+candidates.map(b=>`<option value="${b.id}">${b.title}</option>`).join('');}
function openDetFS(id){curDet=id;renderDetail();document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));document.getElementById('pg-detail').classList.add('on');prevPg='series-detail';}
function togSE(){const el=document.getElementById('sd-ea');el.style.display=el.style.display==='none'?'':'none';}
function saveSN(){const s=series.find(x=>x.id===curSer);if(!s)return;const v=document.getElementById('sd-ni').value.trim();if(v)s.name=v;document.getElementById('sd-nd').textContent=s.name;togSE();markDirty();}
function addBtoS(){const s=series.find(x=>x.id===curSer);if(!s)return;const id=parseInt(document.getElementById('sd-bs').value);if(!id)return;s.bookIds.push(id);renderSerDet();markDirty();}
function remFS(id){const s=series.find(x=>x.id===curSer);if(!s)return;s.bookIds=s.bookIds.filter(x=>x!==id);renderSerDet();markDirty();}
function delSeries(id){if(!confirm('このシリーズを削除しますか？'))return;series=series.filter(s=>s.id!==id);goPage('series');markDirty();}
function createBookFromSeries(seriesId){const s=series.find(x=>x.id===seriesId);if(!s)return;const title=s.name;const nb={id:Date.now(),title,dates:[],tagIds:[],fav:0,type:'normal',memo:''};books.unshift(nb);s.bookIds.push(nb.id);markDirty();renderSerDet();if(confirm(`本「${title}」を作成してシリーズに追加しました。本の個別ページを開きますか？`)){curDet=nb.id;renderDetail();document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));document.getElementById('pg-detail').classList.add('on');prevPg='series-detail';}}

// ---- 登場人物 ----
function renderCharPage(){const pg=document.getElementById('pg-characters');const filt=characters.filter(c=>!charSearch||c.name.toLowerCase().includes(charSearch.toLowerCase()));const sorted=[...filt].sort((a,b)=>{let c=0;if(charSort==='name')c=a.name.localeCompare(b.name,'ja');else if(charSort==='series'){const sa=charSeriesNames(a).join(','),sb=charSeriesNames(b).join(',');c=sa.localeCompare(sb,'ja');}return charSortDir==='asc'?c:-c;});pg.innerHTML=`<div class="row between" style="margin-bottom:10px"><div style="font-size:15px;font-weight:600">登場人物</div><button class="btn" onclick="App.openCharAddModal()">+ 追加</button></div><div class="row" style="gap:6px;margin-bottom:8px"><input class="sinp" style="flex:1;min-width:0" type="text" placeholder="人物名で検索..." value="${charSearch}" oninput="charSearch=this.value;App.renderCharPage()"><div class="row" style="gap:3px;flex-shrink:0">${[{k:'name',l:'名前'},{k:'series',l:'関連作品'}].map(s=>{const act=charSort===s.k,arr=act?(charSortDir==='asc'?'↑':'↓'):'';return`<button class="sort-btn ${act?'act':''}" onclick="App.setCharSort('${s.k}')">${s.l}${arr}</button>`;}).join('')}</div></div>${sorted.map(c=>{const sNames=charSeriesNames(c);return`<div class="card" onclick="App.openCharDet('${c.id}')" style="cursor:pointer"><div style="font-weight:600;font-size:14px;margin-bottom:4px">${c.name}${c.alias?` <span style="font-size:12px;color:#888;font-weight:400">（${c.alias}）</span>`:''}</div>${sNames.length?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px">${sNames.map(n=>`<span class="chip chip-on" style="background:#7A5C35;font-size:11px">${n}</span>`).join('')}</div>`:'<div style="font-size:12px;color:#aaa">シリーズ未登録</div>'}</div>`;}).join('')||'<div style="font-size:13px;color:#888">登場人物がいません</div>'}`;
}
function setCharSort(k){charSort===k?(charSortDir=charSortDir==='asc'?'desc':'asc'):(charSort=k,charSortDir='asc');localStorage.setItem('charSort',charSort);localStorage.setItem('charSortDir',charSortDir);renderCharPage();}
function openCharAddModal(){caSelSeries=[];document.getElementById('ca-name').value='';document.getElementById('ca-alias').value='';document.getElementById('ca-memo').value='';document.getElementById('ca-ser-search').value='';renderCASerSelect();renderCASerList();document.getElementById('char-add-modal').classList.add('open');}
function renderCASerSelect(){const sel=document.getElementById('ca-ser-sel');if(!sel)return;const q=(document.getElementById('ca-ser-search')?.value||'').toLowerCase();const candidates=series.filter(s=>!caSelSeries.includes(s.id)).filter(s=>!q||s.name.toLowerCase().includes(q));sel.innerHTML='<option value="">シリーズを選択...</option>'+candidates.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');}
function addCASerEntry(){const id=document.getElementById('ca-ser-sel')?.value;if(!id||caSelSeries.includes(id))return;caSelSeries.push(id);document.getElementById('ca-ser-search').value='';renderCASerSelect();renderCASerList();}
function removeCASerEntry(id){caSelSeries=caSelSeries.filter(x=>x!==id);renderCASerSelect();renderCASerList();}
function renderCASerList(){const el=document.getElementById('ca-ser-list');if(!el)return;el.innerHTML=caSelSeries.map(id=>{const s=series.find(x=>x.id===id);if(!s)return'';return`<div class="row between" style="padding:5px 0;border-bottom:1px solid #eee"><span class="chip chip-on" style="background:#7A5C35;font-size:12px">${s.name}</span><button class="btn btn-sm btn-danger" onclick="App.removeCASerEntry('${id}')">外す</button></div>`;}).join('')||'<div style="font-size:12px;color:#aaa">シリーズ未登録</div>';}
function saveNewChar(){const name=document.getElementById('ca-name').value.trim();if(!name)return;const alias=document.getElementById('ca-alias').value.trim();const memo=document.getElementById('ca-memo').value;characters.push({id:'ch'+Date.now(),name,alias,seriesIds:[...caSelSeries],memo});document.getElementById('char-add-modal').classList.remove('open');renderCharPage();markDirty();}
function openCharDet(id){curChar=id;renderCharDet();goPage('char-detail',true);}
function renderCharDet(){const c=charById(curChar);if(!c)return;const pg=document.getElementById('pg-char-detail');const mS=c.memo&&c.memo.trim()!=='';const sNames=charSeriesNames(c);const notLinked=series.filter(s=>!(c.seriesIds||[]).includes(s.id)).sort((a,b)=>relevanceScore(b.name,c.name)-relevanceScore(a.name,c.name));pg.innerHTML=`<div class="row" style="margin-bottom:14px"><button class="btn btn-sm" onclick="App.goPage(prevPg)">← 戻る</button></div><div class="card"><div class="row between" style="margin-bottom:12px"><div style="font-size:16px;font-weight:600" id="cd-name">${c.name}</div><button class="btn btn-sm" onclick="App.togCDE()">編集</button></div><div id="cd-ea" style="display:none;margin-bottom:12px"><div class="fr"><div class="fl">名前</div><input class="edit-inp" id="cd-ni" value="${c.name}"></div><div class="fr"><div class="fl">あだ名・別名</div><input class="edit-inp" id="cd-ai" value="${c.alias||''}"></div><div class="row" style="justify-content:flex-end"><button class="btn-pri btn-sm" onclick="App.saveCDEdit()">保存</button></div></div>${c.alias?`<div class="df"><div class="dl">あだ名・別名</div><div style="font-size:13px">${c.alias}</div></div>`:''}<div class="df"><div class="dl">シリーズ</div><div class="row wrap" style="gap:5px;margin-bottom:8px">${sNames.length?sNames.map((n,i)=>{const sid=(c.seriesIds||[])[i];return`<span class="chip chip-on" style="background:#7A5C35;cursor:pointer" onclick="App.openSerDet('${sid}')">${n} →</span>`;}).join(''):'<span style="font-size:12px;color:#aaa">未登録</span>'}</div>${notLinked.length?`<div class="row" style="gap:6px"><select class="sinp" id="cd-ser-sel" style="flex:1"><option value="">シリーズに関連付け...</option>${notLinked.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select><button class="btn btn-sm" onclick="App.addCharToSeries()">追加</button></div>`:''}</div><div class="df"><div class="row between" style="margin-bottom:4px"><div class="dl">メモ</div><button class="btn btn-sm" onclick="App.togCDME()">編集</button></div><div id="cd-md" style="display:${mS?'block':'none'}"><div class="memo-disp">${(c.memo||'').replace(/</g,'&lt;')}</div></div><div id="cd-me" style="display:${mS?'none':'block'}"><textarea class="memo-area" id="cd-memo">${c.memo||''}</textarea><button class="btn-pri btn-sm" onclick="App.saveCDMemo()" style="margin-top:5px">保存</button></div></div><div class="divider"></div><button class="btn btn-sm btn-danger" onclick="App.delChar('${c.id}')">この人物を削除</button></div>`;}
function togCDE(){const el=document.getElementById('cd-ea');el.style.display=el.style.display==='none'?'':'none';}
function saveCDEdit(){const c=charById(curChar);if(!c)return;const n=document.getElementById('cd-ni').value.trim();if(n)c.name=n;c.alias=document.getElementById('cd-ai').value.trim();document.getElementById('cd-name').textContent=c.name;togCDE();markDirty();}
function addCharToSeries(){const c=charById(curChar);if(!c)return;const sid=document.getElementById('cd-ser-sel')?.value;if(!sid)return;if(!c.seriesIds)c.seriesIds=[];if(!c.seriesIds.includes(sid))c.seriesIds.push(sid);renderCharDet();markDirty();}
function togCDME(){const d=document.getElementById('cd-md'),e=document.getElementById('cd-me');const isE=e.style.display!=='none';d.style.display=isE?'block':'none';e.style.display=isE?'none':'block';}
function saveCDMemo(){const c=charById(curChar);if(!c)return;const val=document.getElementById('cd-memo').value;c.memo=val;const d=document.getElementById('cd-md'),e=document.getElementById('cd-me');d.querySelector('.memo-disp').textContent=val;val.trim()?(d.style.display='block',e.style.display='none'):(d.style.display='none',e.style.display='block');markDirty();}
function delChar(id){if(!confirm('この人物を削除しますか？'))return;characters=characters.filter(c=>c.id!==id);goPage(prevPg);markDirty();}

// ---- 統計 ----
function renderStats(){const pg=document.getElementById('pg-stats');const freq=tagFreq(),st=sortedTags().filter(t=>freq[t.id]),max=st[0]?freq[st[0].id]:1;const th=feat('stats_tag')?`<div class="card"><div style="font-weight:500;margin-bottom:10px">タグ別読了数</div>${st.map(t=>`<div class="cbar-row"><span class="clbl">${t.name}</span><div class="cbg"><div class="cfill" style="width:${Math.round((freq[t.id]||0)/max*100)}%;background:${t.color}"></div></div><span class="cval">${freq[t.id]||0}</span></div>`).join('')||'<div style="font-size:13px;color:#888">データなし</div>'}</div>`:'';const mh=feat('stats_month')?`<div class="card"><div class="month-nav"><button class="mnb" onclick="statsYr--;App.renderMC()">‹</button><div style="font-weight:500;font-size:14px;min-width:60px;text-align:center" id="sy-lbl">${statsYr}年</div><button class="mnb" onclick="statsYr++;App.renderMC()">›</button></div><div id="mc-body"></div></div>`:'';const calH=`<div class="card"><div class="month-nav"><button class="mnb" onclick="App.calPrev()">‹</button><div style="font-weight:500;font-size:14px;min-width:80px;text-align:center" id="cal-lbl">${calYr}年${calMo}月</div><button class="mnb" onclick="App.calNext()">›</button></div><div id="cal-grid"></div></div>`;pg.innerHTML=calH+th+mh||'<div style="font-size:13px;color:#888">統計機能がオフです</div>';if(feat('stats_month'))renderMC();renderCalendar();}
function renderMC(){const lbl=document.getElementById('sy-lbl');if(lbl)lbl.textContent=statsYr+'年';const el=document.getElementById('mc-body');if(!el)return;const counts=MONTHS.map((_,i)=>countYM(statsYr,i+1)),max=Math.max(...counts,1);const accent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#1D9E75';el.innerHTML=counts.map((n,i)=>`<div class="cbar-row"><span class="clbl">${MONTHS[i]}</span><div class="cbg"><div class="cfill" style="width:${Math.round(n/max*100)}%;background:${accent}"></div></div><span class="cval">${n}</span></div>`).join('');}
function calPrev(){calMo--;if(calMo<1){calMo=12;calYr--;}renderCalendar();}
function calNext(){calMo++;if(calMo>12){calMo=1;calYr++;}renderCalendar();}
function renderCalendar(){const lbl=document.getElementById('cal-lbl');if(lbl)lbl.textContent=calYr+'年'+calMo+'月';const el=document.getElementById('cal-grid');if(!el)return;const todayStr=today();const firstDay=new Date(calYr,calMo-1,1).getDay();const lastDate=new Date(calYr,calMo,0).getDate();let html='<div class="cal-grid">';WDAYS.forEach(w=>{html+=`<div class="cal-head">${w}</div>`;});for(let i=0;i<firstDay;i++)html+=`<div class="cal-cell other-month"></div>`;for(let d=1;d<=lastDate;d++){const ds=`${calYr}-${String(calMo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const cnt=booksOnDate(ds).length;const isToday=ds===todayStr;html+=`<div class="cal-cell ${isToday?'today':''}"><div class="cal-day-num">${d}</div>${cnt>0?`<span class="cal-count" onclick="App.openDayModal('${ds}')">${cnt}</span>`:''}</div>`;}html+='</div>';el.innerHTML=html;}
function openDayModal(ds){const list=booksOnDate(ds).slice().sort((a,b)=>a.id-b.id);document.getElementById('day-modal-title').textContent=`${ds} の読了`;document.getElementById('day-modal-list').innerHTML=list.map(b=>`<div class="bitem normal" style="cursor:pointer" onclick="App.openDetailFromDay(${b.id})"><div class="bt">${b.title}</div><div class="brow">${feat('tags')?chipsHtml(b.tagIds):''}${feat('fav')?favHtml(b.fav):''}</div></div>`).join('')||'<div style="font-size:13px;color:#888">なし</div>';document.getElementById('day-modal').classList.add('open');}
function openDetailFromDay(id){document.getElementById('day-modal').classList.remove('open');curDet=id;prevPg='stats';renderDetail();document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));document.getElementById('pg-detail').classList.add('on');document.querySelectorAll('.nb').forEach(b=>b.classList.remove('act'));}

// ---- 設定 ----
function renderSettings(){
  const accentIdx=parseInt(localStorage.getItem('accentIdx')||'0');
  const rawUrl=getCfg().RAW_URL;
  document.getElementById('pg-settings').innerHTML=`
  <div style="font-size:15px;font-weight:600;margin-bottom:12px">機能のオン／オフ</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">${features.map((f,i)=>`<div class="sitem"><div><div style="font-size:13px;font-weight:500;margin-bottom:2px">${f.name}</div><div style="font-size:11px;color:#888">${f.desc}</div></div><label class="tog"><input type="checkbox" ${f.on?'checked':''} onchange="App.togFeat(${i},this.checked)"><span class="tsl"></span></label></div>`).join('')}</div>

  <div style="font-size:15px;font-weight:600;margin-bottom:10px">GitHub同期設定</div>
  <div class="card" style="margin-bottom:10px">
    <div style="font-size:12px;color:#888;margin-bottom:8px">パブリックリポジトリのdata.jsonへのraw URLを設定してください。<br>例: <code>https://raw.githubusercontent.com/ユーザー名/reading-log/main/data.json</code></div>
    <div class="fr"><div class="fl">GitHub raw URL</div><input class="edit-inp" id="cfg-raw" value="${rawUrl}" placeholder="https://raw.githubusercontent.com/..."></div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button class="btn-pri btn-sm" onclick="App.saveRawUrl()">URLを保存</button>
      <button class="btn btn-sm" onclick="App.reloadFromGitHub()">🔄 今すぐ再読み込み</button>
    </div>
  </div>
  <div class="card" style="margin-bottom:10px;background:#fffbf0;border-color:#ffe082">
    <div style="font-size:13px;font-weight:500;margin-bottom:6px">📋 同期の手順</div>
    <div style="font-size:12px;color:#7a5800;line-height:1.8">
      <b>1.</b> このアプリで本を追加・編集する<br>
      <b>2.</b> 上部バーの「💾 書き出し」でdata.jsonをダウンロード<br>
      <b>3.</b> GitHubリポジトリにdata.jsonをアップロード（上書き）<br>
      <b>4.</b> 別端末で「🔄 再読み込み」を押すと最新データを取得
    </div>
  </div>
  <div class="card" style="margin-bottom:10px">
    <div style="font-size:13px;font-weight:500;margin-bottom:8px">データ管理</div>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm" onclick="App.exportJSON()">💾 data.jsonを書き出し</button>
      <button class="btn btn-sm" onclick="document.getElementById('import-file').click()">📂 data.jsonを読み込み</button>
    </div>
  </div>

  <div style="font-size:15px;font-weight:600;margin-bottom:10px;margin-top:20px">表示設定</div>
  <div class="card" style="margin-bottom:10px"><div style="font-size:13px;font-weight:500;margin-bottom:10px">アクセントカラー</div><div style="display:flex;gap:10px;flex-wrap:wrap">${ACCENT_THEMES.map((t,i)=>`<div onclick="App.applyAccent(${i});App.renderSettings()" style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="width:32px;height:32px;border-radius:50%;background:${t.accent};border:3px solid ${accentIdx===i?'#333':'transparent'};transition:.15s"></div><div style="font-size:10px;color:#888;white-space:nowrap">${t.name}</div></div>`).join('')}</div></div>
  <div class="card" style="margin-bottom:10px"><div class="row between"><div><div style="font-size:13px;font-weight:500;margin-bottom:2px">背表紙カラーモード</div><div style="font-size:11px;color:#888">${spineGradMode==='grad'?'グラデーション':spineGradMode==='split'?'くっきり':'単色'}</div></div><div style="display:flex;gap:6px"><button class="sort-btn ${spineGradMode==='single'?'act':''}" onclick="App.setSpineGradMode('single')">単色</button><button class="sort-btn ${spineGradMode==='grad'?'act':''}" onclick="App.setSpineGradMode('grad')">グラデーション</button><button class="sort-btn ${spineGradMode==='split'?'act':''}" onclick="App.setSpineGradMode('split')">くっきり</button></div></div></div>
  <div class="card" style="margin-bottom:20px"><div class="row between"><div><div style="font-size:13px;font-weight:500;margin-bottom:2px">絞り込みタグの並び順</div><div style="font-size:11px;color:#888">タップで切り替え</div></div><button class="sort-btn act" onclick="App.cycleTagChipOrder()">${tagChipOrderLabel()}</button></div></div>

  <div style="font-size:15px;font-weight:600;margin-bottom:10px">タグ管理</div>
  <div class="card" id="tag-card"></div>`;
  renderTagCard();
}
function saveRawUrl(){const v=document.getElementById('cfg-raw').value.trim();localStorage.setItem('cfg_raw_url',v);setSyncBadge('ok','URLを保存しました');if(v)reloadFromGitHub();}
function togFeat(i,v){features[i].on=v;renderNav();renderSettings();markDirty();}
function setSpineGradMode(m){spineGradMode=m;localStorage.setItem('spineGradMode',m);renderSettings();}
function applyAccent(idx){const t=ACCENT_THEMES[idx];if(!t)return;const r=document.documentElement.style;r.setProperty('--accent',t.accent);r.setProperty('--accent-dark',t.dark);r.setProperty('--accent-bg',t.bg);r.setProperty('--accent-text',t.text);localStorage.setItem('accentIdx',String(idx));const mcBody=document.getElementById('mc-body');if(mcBody)renderMC();}
function initAccent(){const idx=parseInt(localStorage.getItem('accentIdx')||'0');applyAccent(idx);}

// ---- タグ管理 ----
function renderTagCard(){const el=document.getElementById('tag-card');if(!el)return;const freq=tagFreq();el.innerHTML=`<div class="row between" style="margin-bottom:10px"><div style="font-size:13px;font-weight:500">登録タグ (${tagMaster.length}/50)</div><button class="btn btn-sm" onclick="App.showAddTag()">+ タグを追加</button></div><div id="tag-add-box" style="display:none;margin-bottom:10px"><div class="tag-edit-box"><input class="edit-inp" id="tan-inp" placeholder="タグ名を入力..." style="margin-bottom:6px"><div style="font-size:12px;color:#888;margin-bottom:3px">カラー</div><div class="pal" id="tap-pal"></div><div class="row" style="justify-content:flex-end;gap:6px;margin-top:8px"><button class="btn btn-sm" onclick="App.hideAddTag()">キャンセル</button><button class="btn-pri btn-sm" onclick="App.commitAddTag()">追加</button></div></div></div>${sortedTags().map(t=>`<div class="tag-row"><span class="chip chip-on" style="background:${t.color};font-size:12px">${t.name}</span><span style="flex:1;font-size:12px;color:#888;margin-left:8px">${freq[t.id]||0}冊</span><button class="btn btn-sm" onclick="App.startET('${t.id}')">編集</button><button class="btn btn-sm btn-danger" onclick="App.delTag('${t.id}')">削除</button></div><div id="te-${t.id}" style="display:none"><div class="tag-edit-box"><input class="edit-inp" id="ten-${t.id}" value="${t.name}" style="margin-bottom:6px"><div style="font-size:12px;color:#888;margin-bottom:3px">カラー</div><div class="pal" id="tep-${t.id}"></div><div class="row" style="justify-content:flex-end;gap:6px;margin-top:8px"><button class="btn btn-sm" onclick="App.cancelET('${t.id}')">キャンセル</button><button class="btn-pri btn-sm" onclick="App.commitET('${t.id}')">保存</button></div></div></div>`).join('')||'<div style="font-size:13px;color:#888">タグがありません</div>'};addPalIdx=0;renderTagAddPal();sortedTags().forEach(t=>{tagEditPalMap[t.id]=Math.max(0,PALETTE.indexOf(t.color));renderTagEditPal(t.id);});}
function renderTagAddPal(){const el=document.getElementById('tap-pal');if(!el)return;el.innerHTML=PALETTE.map((c,i)=>`<div class="pcol ${i===addPalIdx?'sel':''}" style="background:${c}" onclick="addPalIdx=${i};App.renderTagAddPal()"></div>`).join('');}
function renderTagEditPal(id){const el=document.getElementById('tep-'+id);if(!el)return;el.innerHTML=PALETTE.map((c,i)=>`<div class="pcol ${i===tagEditPalMap[id]?'sel':''}" style="background:${c}" onclick="tagEditPalMap['${id}']=${i};App.renderTagEditPal('${id}')"></div>`).join('');}
function showAddTag(){document.getElementById('tag-add-box').style.display='';document.getElementById('tan-inp').value='';addPalIdx=0;renderTagAddPal();}
function hideAddTag(){document.getElementById('tag-add-box').style.display='none';}
function commitAddTag(){const name=document.getElementById('tan-inp').value.trim();if(!name||tagMaster.length>=50||tagMaster.find(t=>t.name===name))return;tagMaster.push({id:'t'+Date.now(),name,color:PALETTE[addPalIdx]});renderTagCard();markDirty();}
function startET(id){sortedTags().forEach(t=>{const e=document.getElementById('te-'+t.id);if(e)e.style.display='none';});const el=document.getElementById('te-'+id);if(el)el.style.display='';tagEditPalMap[id]=Math.max(0,PALETTE.indexOf((tagById(id)||{}).color||PALETTE[0]));renderTagEditPal(id);}
function cancelET(id){const el=document.getElementById('te-'+id);if(el)el.style.display='none';}
function commitET(id){const t=tagById(id);if(!t)return;const name=document.getElementById('ten-'+id).value.trim();if(name)t.name=name;t.color=PALETTE[tagEditPalMap[id]||0];renderTagCard();markDirty();}
function delTag(id){if(!confirm('このタグを削除しますか？すべての本からも外れます。'))return;tagMaster=tagMaster.filter(t=>t.id!==id);books=books.map(b=>({...b,tagIds:b.tagIds.filter(x=>x!==id)}));delete tagFilterModes[id];renderTagCard();markDirty();}

// ---- 本を追加 ----
function openBookModal(){mST=[];mSF=0;mNP=0;document.getElementById('m-title').value='';document.getElementById('m-date').value=today();document.getElementById('m-memo').value='';document.getElementById('m-tags-wrap').style.display=feat('tags')?'':'none';document.getElementById('m-fav-wrap').style.display=feat('fav')?'':'none';document.getElementById('m-memo-wrap').style.display=feat('memo')?'':'none';const sw=document.getElementById('m-series-wrap');if(sw)sw.style.display=feat('series')&&series.length?'':'none';renderMTC();renderMFC();renderMNP();renderMSeriesSel();document.getElementById('book-modal').classList.add('open');}
function closeBookModal(){document.getElementById('book-modal').classList.remove('open');}
function renderMSeriesSel(){const sw=document.getElementById('m-series-wrap');if(!sw)return;sw.style.display=feat('series')&&series.length?'':'none';const sel=document.getElementById('m-series-sel');if(!sel)return;const q=(document.getElementById('m-title')?.value||'').toLowerCase();const sorted=[...series].sort((a,b)=>relevanceScore(b.name,q||b.name)-relevanceScore(a.name,q||a.name));sel.innerHTML='<option value="">シリーズに追加（任意）</option>'+sorted.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');}
function renderMTC(){document.getElementById('m-tag-chips').innerHTML=sortedTags().map(t=>{const on=mST.includes(t.id);return`<span class="chip ${on?'chip-on':'chip-off'}" style="${on?'background:'+t.color:''}" onclick="App.togMT('${t.id}')">${t.name}</span>`;}).join('');}
function togMT(id){mST=mST.includes(id)?mST.filter(x=>x!==id):[...mST,id];renderMTC();}
function renderMFC(){document.getElementById('m-fav-chips').innerHTML=FAV_OPTS.map(o=>{const on=mSF===o.v;return`<span class="chip ${on?'chip-on':'chip-off'}" style="${on?'background:'+FAV_C[o.v]:''}" onclick="mSF=mSF===${o.v}?0:${o.v};App.renderMFC()">${o.l}</span>`;}).join('');}
function renderMNP(){document.getElementById('m-new-tag-pal').innerHTML=PALETTE.map((c,i)=>`<div class="pcol ${i===mNP?'sel':''}" style="background:${c}" onclick="mNP=${i};App.renderMNP()"></div>`).join('');}
function addTagFromModal(){if(tagMaster.length>=50)return;const name=document.getElementById('m-new-tag-name').value.trim();if(!name||tagMaster.find(t=>t.name===name))return;const id='t'+Date.now();tagMaster.push({id,name,color:PALETTE[mNP]});mST=[...mST,id];document.getElementById('m-new-tag-name').value='';renderMTC();}
function saveBook(type){const title=document.getElementById('m-title').value.trim();if(!title)return;const date=type==='normal'?(document.getElementById('m-date').value||''):'';const nb={id:Date.now(),title,dates:date?[date]:[],tagIds:[...mST],fav:mSF,type,memo:document.getElementById('m-memo').value};books.unshift(nb);const sid=document.getElementById('m-series-sel')?.value;if(sid){const s=series.find(x=>x.id===sid);if(s)s.bookIds.push(nb.id);}closeBookModal();renderShelf();markDirty();}

// ---- 起動 ----
async function init() {
  initAccent();
  await loadData();
  renderNav();
  document.getElementById('nb-shelf')?.classList.add('act');
  renderShelf();
}

// ---- 外部公開 ----
return {
  goPage, setView, renderSeriesPage, renderCharPage,
  renderShelfList, setSort, setTy, setFv, cycleTagFilter,
  openDetail, togDE, saveDT, togBME, saveDM, setDTy,
  addRR, updD, clrD, remD, setDF, togDT, delBook,
  dupBook, addDetToSeries, createSeriesFromBook, renderDDates,
  openSerDet, openSerAdd, renderSABS, addBookToNewSeries, remSAB,
  saveNewSeries, togSE, saveSN, togSME, saveSM,
  renderSDBL, openDetFS, addBtoS, remFS, delSeries, setSerSort, createBookFromSeries,
  openCharDet, openCharAddModal, renderCASerSelect, addCASerEntry,
  removeCASerEntry, saveNewChar, togCDE, saveCDEdit, addCharToSeries,
  togCDME, saveCDMemo, delChar, setCharSort,
  renderMC, calPrev, calNext, openDayModal, openDetailFromDay,
  renderSettings, togFeat, setSpineGradMode, applyAccent,
  cycleTagChipOrder, saveRawUrl,
  showAddTag, hideAddTag, commitAddTag, startET, cancelET, commitET,
  delTag, renderTagAddPal, renderTagEditPal,
  openBookModal, closeBookModal, renderMSeriesSel,
  renderMTC, togMT, renderMFC, renderMNP, addTagFromModal, saveBook,
  exportJSON, importJSON, reloadFromGitHub,
  get prevPg() { return prevPg; },
  init,
};

})(); // end App IIFE

// アプリ起動
App.init();
