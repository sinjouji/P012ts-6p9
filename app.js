/**
 * app.js  ポイント管理アプリ
 * Firebase Realtime Database を使ったリアルタイム同期版
 */
import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, set, update, remove, onValue }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

/* ══════════════════════════════════════
   ユーティリティ（最初に定義）
══════════════════════════════════════ */
const g      = id => document.getElementById(id);
const mkEl   = (t,c,tx) => { const e=document.createElement(t); e.className=c; if(tx!==undefined)e.textContent=tx; return e; };
const setText= (id,t) => { const e=g(id); if(e) e.textContent=t; };
const setVal = (id,v) => { const e=g(id); if(e) e.value=v; };
const getVal = id => g(id)?.value??'';
const setChk = (id,v) => { const e=g(id); if(e) e.checked=!!v; };
const fmtMin = m => { m=parseInt(m||0); if(!m)return'0分'; const s=m<0?'-':'',a=Math.abs(m),h=Math.floor(a/60),r=a%60; return h?r?`${s}${h}時間${r}分`:`${s}${h}時間`:`${s}${r}分`; };
const todayStr = () => new Date().toLocaleDateString('sv-SE');
const dowJa    = d  => ['日','月','火','水','木','金','土'][new Date(d+'T00:00:00').getDay()];
const offsetDate = (d,n) => { const dt=new Date(d+'T00:00:00'); dt.setDate(dt.getDate()+n); return dt.toLocaleDateString('sv-SE'); };
// 日本時間（JST）でタイムスタンプ生成
const nowJST = () => {
  const d = new Date();
  // UTC+9 に変換
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  // "YYYY-MM-DDTHH:mm:ss" 形式（+09:00 なしのローカル表記）
  return jst.toISOString().replace('Z', '').slice(0, 19);
};
// Firebaseは配列をオブジェクトに変換する→配列に戻すヘルパー
const toArr = v => Array.isArray(v) ? v : Object.values(v || {});

/* ══════════════════════════════════════
   datas.json の埋め込み初期データ
══════════════════════════════════════ */
const DEFAULT_DATA = {
  settings: { points_per_hour: 50, yen_per_point: 4 },
  items: [
    {id:1,name:"スマイルゼミ",base_point:1,base_time:30,daily_limit:false,weekly_limit:false,max_per_day:null,max_point_per_day:1,max_time_per_day:3,item_key:"smilezemi",is_positive:true,visible_son:true,visible_daughter:true,sort_order:1},
    {id:2,name:"宿題",base_point:1,base_time:0,daily_limit:true,weekly_limit:false,max_per_day:null,max_point_per_day:null,max_time_per_day:null,item_key:"homework",is_positive:true,visible_son:true,visible_daughter:true,sort_order:2},
    {id:3,name:"ゴミ捨て",base_point:1,base_time:0,daily_limit:true,weekly_limit:false,max_per_day:null,max_point_per_day:null,max_time_per_day:null,item_key:null,is_positive:true,visible_son:true,visible_daughter:true,sort_order:3},
    {id:4,name:"明日の服",base_point:1,base_time:0,daily_limit:true,weekly_limit:false,max_per_day:null,max_point_per_day:null,max_time_per_day:null,item_key:"ashita_no_fuku",is_positive:true,visible_son:true,visible_daughter:true,sort_order:4},
    {id:5,name:"連絡帳きれい",base_point:5,base_time:0,daily_limit:true,weekly_limit:false,max_per_day:null,max_point_per_day:null,max_time_per_day:null,item_key:"renrakucho",is_positive:true,visible_son:true,visible_daughter:true,sort_order:5},
    {id:6,name:"上ばき洗い",base_point:5,base_time:0,daily_limit:true,weekly_limit:false,max_per_day:null,max_point_per_day:null,max_time_per_day:null,item_key:null,is_positive:true,visible_son:true,visible_daughter:true,sort_order:6},
    {id:7,name:"玄関整頓",base_point:5,base_time:0,daily_limit:true,weekly_limit:false,max_per_day:null,max_point_per_day:null,max_time_per_day:null,item_key:null,is_positive:true,visible_son:true,visible_daughter:true,sort_order:7},
    {id:8,name:"食事前片付け",base_point:10,base_time:0,daily_limit:false,weekly_limit:false,max_per_day:3,max_point_per_day:null,max_time_per_day:null,item_key:null,is_positive:true,visible_son:true,visible_daughter:true,sort_order:8},
    {id:9,name:"服の引き出し整頓",base_point:20,base_time:0,daily_limit:false,weekly_limit:true,max_per_day:null,max_point_per_day:null,max_time_per_day:null,item_key:"hikidashi",is_positive:true,visible_son:true,visible_daughter:true,sort_order:9},
    {id:10,name:"ゲーム30分",base_point:0,base_time:-30,daily_limit:true,weekly_limit:false,max_per_day:null,max_point_per_day:null,max_time_per_day:null,item_key:null,is_positive:false,visible_son:true,visible_daughter:true,sort_order:10},
    {id:11,name:"ゲーム60分",base_point:0,base_time:-60,daily_limit:true,weekly_limit:false,max_per_day:null,max_point_per_day:null,max_time_per_day:null,item_key:null,is_positive:false,visible_son:true,visible_daughter:true,sort_order:11}
  ],
  tags: [],
  users: {
    son:      { clothes_count:0, clothes_last_date:null, exchange_logs:{}, daily:{} },
    daughter: { clothes_count:0, clothes_last_date:null, exchange_logs:{}, daily:{} }
  }
};

/* ══════════════════════════════════════
   Firebase 初期化
══════════════════════════════════════ */
let db = null;

/* ══════════════════════════════════════
   ▼▼▼ ここを自分の Firebase 設定値に書き換えてください ▼▼▼
   Firebase Console → プロジェクトの設定 → マイアプリ → SDKの設定と構成
══════════════════════════════════════ */
const FIREBASE_CONFIG = {
  apiKey : AIzaSyBbKlHBjsu9-qKpWVBBm4rFZinfJOek5Hc
authDomain : mychls-p0intapp.firebaseapp.com
databaseURL : https://mychls-p0intapp-default-rtdb.asia-southeast1.firebasedatabase.app
projectId : mychls-p0intapp
appId : 1:229330961921:web:c2cb7f851d35828b4ee200,
};
/* ▲▲▲ 書き換えここまで ▲▲▲ */

let auth = null;

function initFirebase() {
  try {
    const app = initializeApp(FIREBASE_CONFIG, 'points-app');
    db   = getDatabase(app);
    auth = getAuth(app);
    // 認証状態を監視
    onAuthStateChanged(auth, user => {
      if (user) {
        // ログイン済み → アプリ表示
        g('login-screen').style.display = 'none';
        g('app-screen').style.display   = 'block';
        setSyncStatus('🟢 ' + user.email);
        g('past-date').value = todayStr();
        goView('home');
        setupRealtimeSync();
      } else {
        // 未ログイン → ログイン画面
        g('login-screen').style.display = 'flex';
        g('app-screen').style.display   = 'none';
        setSyncStatus('');
      }
    });
  } catch(e) {
    console.error('Firebase init error:', e);
    g('login-error').textContent = '設定エラー: ' + e.message;
    g('login-screen').style.display = 'flex';
  }
}

window.doLogin = async function() {
  const email = getVal('login-email').trim();
  const pass  = getVal('login-pass').trim();
  const errEl = g('login-error');
  errEl.textContent = '';
  if (!email || !pass) { errEl.textContent = 'メールとパスワードを入力してください'; return; }
  const btn = g('login-btn');
  btn.disabled = true; btn.textContent = 'ログイン中...';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch(e) {
    const msgs = {
      'auth/invalid-email':    'メールアドレスの形式が正しくありません',
      'auth/user-not-found':   'ユーザーが見つかりません',
      'auth/wrong-password':   'パスワードが違います',
      'auth/invalid-credential':'メールまたはパスワードが違います',
      'auth/too-many-requests':'試行回数が多すぎます。しばらく待ってください',
    };
    errEl.textContent = msgs[e.code] || 'ログインに失敗しました: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'ログイン';
  }
};

window.doLogout = async function() {
  if (!auth) return;
  await signOut(auth);
  toast('ログアウトしました', 'info');
};

/* ══════════════════════════════════════
   アプリ状態（インメモリキャッシュ）
══════════════════════════════════════ */
let appData = JSON.parse(JSON.stringify(DEFAULT_DATA)); // deep copy

/* Firebaseからリアルタイム同期 */
function setupRealtimeSync() {
  if (!db) return;
  onValue(ref(db, '/'), snap => {
    const val = snap.val();
    if (val) {
      appData = mergeDeep(JSON.parse(JSON.stringify(DEFAULT_DATA)), val);
      // Firebaseは配列をオブジェクトに変換するため、items/tags を配列に正規化
      if (appData.items && !Array.isArray(appData.items)) {
        appData.items = Object.values(appData.items).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
      }
      if (appData.tags && !Array.isArray(appData.tags)) {
        appData.tags = Object.values(appData.tags);
      }
    } else {
      // 初回：デフォルトデータをFirebaseに書き込む
      set(ref(db, '/'), DEFAULT_DATA);
    }
    // デイリーページは全要素を更新
    if (currentView === 'daily') {
      renderDaily();      // strip・items・logs・health を全更新
    } else {
      refreshCurrentView();
    }
  }, err => {
    setSyncStatus('🔴 同期エラー');
    console.error('DB sync error:', err);
  });
}

function mergeDeep(target, source) {
  for (const key of Object.keys(source || {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = target[key] || {};
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

async function dbSet(path, value) {
  if (db) {
    await set(ref(db, path), value);
  } else {
    // オフライン時はローカルキャッシュのみ更新
    setNestedValue(appData, path, value);
    refreshCurrentView();
  }
}

async function dbUpdate(path, updates) {
  if (db) {
    // Firebaseのupdate()はスラッシュ区切りのキーを絶対パスとして扱う必要がある
    // ref(db, path)に対してネストキーを渡すと正しく動かないため、
    // ルートrefに対して絶対パスのflatなupdatesとして渡す
    const flatUpdates = {};
    for (const [k, v] of Object.entries(updates)) {
      flatUpdates[`${path}/${k}`] = v;
    }
    try {
      await update(ref(db, '/'), flatUpdates);
    } catch(e) {
      console.error('Firebase update error:', e, flatUpdates);
      throw new Error('Firebase保存エラー: ' + e.message);
    }
  } else {
    for (const [k, v] of Object.entries(updates)) {
      setNestedValue(appData, path + '/' + k, v);
    }
    refreshCurrentView();
  }
}

async function dbRemove(path) {
  if (db) await remove(ref(db, path));
  else {
    deleteNestedValue(appData, path);
    refreshCurrentView();
  }
}

function getNestedValue(obj, path) {
  return path.split('/').filter(Boolean).reduce((o, k) => o?.[k], obj);
}
function setNestedValue(obj, path, val) {
  const keys = path.split('/').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]]) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = val;
}
function deleteNestedValue(obj, path) {
  const keys = path.split('/').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur?.[keys[i]];
    if (!cur) return;
  }
  delete cur[keys[keys.length - 1]];
}

function setSyncStatus(msg) {
  const el = g('sync-status');
  if (el) el.textContent = msg;
}

window.initFirebaseData = function() {
  confirmDlg('全データを初期化しますか？\n元には戻せません。', async () => {
    await dbSet('/', DEFAULT_DATA);
    toast('初期化しました', 'info');
  });
};

/* ══════════════════════════════════════
   ルーティング
══════════════════════════════════════ */
let currentView = 'home';

/* ══ レート・換算メモ（動的生成）══ */
function renderRateMemo() {
  const tbl   = g('rate-memo-table');
  if (!tbl) return;
  const s     = appData.settings || {};
  const pph   = s.points_per_hour || 50;
  const ypp   = s.yen_per_point   || 4;
  const items = toArr(appData.items).filter(i => i.is_positive || i.base_time < 0);

  // サマリーページの換算注記も更新
  setText('sum-pph', pph);
  setText('sum-ypp', ypp);

  // 項目ごとの説明行を生成
  const rows = [];
  items.forEach(item => {
    const bp = item.base_point|0, bt = item.base_time|0, bm = item.base_money|0;
    const parts = [];
    if (bp > 0) parts.push(`+${bp}P`);
    if (bp < 0) parts.push(`${bp}P`);
    if (bt > 0) parts.push(`+${fmtMin(bt)}`);
    if (bt < 0) parts.push(`${fmtMin(bt)}`);
    if (bm > 0) parts.push(`+${bm.toLocaleString()}円`);
    if (bm < 0) parts.push(`${bm.toLocaleString()}円`);
    const val = parts.join('・');

    const limits = [];
    if (item.daily_limit)  limits.push('1日1回');
    if (item.weekly_limit) limits.push('週1回');
    if (item.max_per_day != null) limits.push(`1日${item.max_per_day}回まで`);
    if (item.max_time_per_day != null && bt > 0) limits.push(`時間${item.max_time_per_day}回まで`);
    if (item.max_point_per_day != null && bp > 0) limits.push(`P${item.max_point_per_day}回まで`);
    const limitStr = limits.length ? `（${limits.join('・')}）` : '';

    rows.push(`<tr><td>${item.name}</td><td>${val}${limitStr}</td></tr>`);
  });

  // 交換レート行
  rows.push(`<tr><td colspan="2" style="color:var(--text-lt);font-size:.75rem;padding-top:6px">── 交換レート ──</td></tr>`);
  rows.push(`<tr><td>${pph}P</td><td>= 1時間</td></tr>`);
  rows.push(`<tr><td>1P</td><td>= ${ypp}円</td></tr>`);
  rows.push(`<tr><td colspan="2" style="color:var(--text-lt);font-size:.75rem;padding-top:6px">── 明日の服 ──</td></tr>`);
  rows.push(`<tr><td>累計7日</td><td>ボーナス +10P</td></tr>`);

  tbl.innerHTML = rows.join('');
}

/* ══ ホームカレンダー週ナビ ══ */
let calWeekOffset = 0;  // 0=今週, -1=先週, +1=来週

window.calPrevWeek = function() {
  calWeekOffset--;
  renderWeekCal(1, 'cal-son',      calWeekOffset);
  renderWeekCal(2, 'cal-daughter', calWeekOffset);
  updateCalWeekLabel();
};
window.calNextWeek = function() {
  calWeekOffset++;
  renderWeekCal(1, 'cal-son',      calWeekOffset);
  renderWeekCal(2, 'cal-daughter', calWeekOffset);
  updateCalWeekLabel();
};
window.calThisWeek = function() {
  calWeekOffset = 0;
  renderWeekCal(1, 'cal-son',      calWeekOffset);
  renderWeekCal(2, 'cal-daughter', calWeekOffset);
  updateCalWeekLabel();
};

function updateCalWeekLabel() {
  const today  = todayStr();
  const dow0   = new Date(today + 'T00:00:00').getDay();
  const sun    = offsetDate(today, -dow0 + calWeekOffset * 7);
  const sat    = offsetDate(sun, 6);
  const label  = sun.slice(5).replace('-','/') + ' 〜 ' + sat.slice(5).replace('-','/');
  const el     = g('cal-week-label');
  if (el) el.textContent = label;
  const todayBtn = g('cal-today-btn');
  if (todayBtn) todayBtn.style.opacity = calWeekOffset === 0 ? '0.4' : '1';
}

function goView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.page-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });
  const el = g('view-' + view);
  if (el) el.classList.add('active');
  g('header-title').textContent = {
    home:'⭐ ポイント管理', daily:'📅 デイリー',
    summary:'📊 まとめ', trends:'📉 推移', settings:'⚙️ 設定'
  }[view] || '⭐ ポイント管理';
  renderView(view);
  window.scrollTo(0, 0);
}

function refreshCurrentView() { renderView(currentView); }

function renderView(view) {
  if (view === 'home')     renderHome();
  if (view === 'daily')    renderDaily();
  if (view === 'summary')  renderSummary();
  if (view === 'trends')   renderTrends();
  if (view === 'settings') renderSettingsView();
  if (view === 'search')   renderSearch();
  if (view === 'calc')     renderCalcRateLabel();
}

// nav リンク
document.querySelectorAll('.page-nav a').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    goView(a.dataset.view);
  });
});

// toggle
document.addEventListener('click', e => {
  const hd = e.target.closest('.toggle-hd');
  if (!hd) return;
  const toggle = hd.closest('.toggle');
  if (!toggle) return;
  toggle.classList.toggle('open');
  // Firebaseトグル（設定ページ最初のトグル）の開閉状態を記憶
  const isFirst = toggle === document.querySelector('#view-settings .toggle');
  if (isFirst) {
    if (toggle.classList.contains('open')) localStorage.setItem('fb_toggle_opened','1');
    else localStorage.removeItem('fb_toggle_opened');
  }
});
// モーダル背景クリック
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-bg')) e.target.classList.remove('open');
});

window.goView = goView;

/* ══════════════════════════════════════
   ホーム
══════════════════════════════════════ */
function renderHome() {
  const s = appData.settings;
  const pph = s.points_per_hour, ypp = s.yen_per_point;
  [1, 2].forEach(uid => {
    const ukey = uid === 1 ? 'son' : 'daughter';
    const pfx  = uid === 1 ? 'son' : 'daughter';
    const u    = appData.users[ukey] || {};
    const daily = u.daily || {};
    const tp = Object.values(daily).reduce((s, d) => s + (d.total_points || 0), 0);
    const tt = Object.values(daily).reduce((s, d) => s + (d.total_time_minutes || 0), 0);
    const h = Math.floor(tt / 60), m = tt % 60;
    const ep = tp + h * pph;
    const tm2 = Object.values(daily).reduce((s, d) => s + (d.total_money||0), 0);
    setText(`${pfx}-time`,  h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}時間`) : `${m}分`);
    setText(`${pfx}-pts`,   tp + 'P');
    setText(`${pfx}-yen`,   (ep * ypp).toLocaleString() + '円');
    setText(`${pfx}-money`, tm2.toLocaleString() + '円');
  });
  renderWeekCal(1, 'cal-son',      calWeekOffset);
  renderWeekCal(2, 'cal-daughter', calWeekOffset);
  g('past-date').value = todayStr();
  updateCalWeekLabel();
  renderRateMemo();
}

function renderWeekCal(uid, containerId, weekOffset) {
  const cal = g(containerId);
  if (!cal) return;
  cal.innerHTML = '';
  const today = todayStr();
  const DOW   = ['日','月','火','水','木','金','土'];
  const dow0  = new Date(today + 'T00:00:00').getDay();
  // weekOffset（週単位）分だけずらした週の日曜を基準にする
  const baseSun = offsetDate(today, -dow0 + (weekOffset || 0) * 7);
  const sun   = baseSun;
  const ukey  = uid === 1 ? 'son' : 'daughter';
  const daily = appData.users[ukey]?.daily || {};
  const items = toArr(appData.items);
  const keyMap = {};
  items.forEach(it => { if (it.item_key) keyMap[it.id] = it.item_key; });

  for (let i = 0; i < 7; i++) {
    const d   = offsetDate(sun, i);
    const rec = daily[d] || {};
    const states = rec.item_states || {};
    const keys = Object.entries(states)
      .filter(([, st]) => (st.press_count || 0) > 0)
      .map(([id]) => keyMap[parseInt(id)])
      .filter(Boolean);

    const hw = keys.includes('homework');
    const sm = keys.includes('smilezemi');
    const rc = keys.includes('renrakucho');
    const hk = keys.includes('hikidashi');

    const dow  = new Date(d + 'T00:00:00').getDay();
    const cls  = ['cal-day',
      dow === 0 ? 'sun' : '', dow === 6 ? 'sat' : '',
      d === today ? 'today' : '',
      hw && sm ? 'bg-green' : sm ? 'bg-red' : hw ? 'bg-yellow' : '',
    ].filter(Boolean).join(' ');

    const a   = document.createElement('a');
    a.className = cls;
    a.href      = '#daily';
    a.innerHTML = `<span class="dlabel">${DOW[dow]}</span><span class="dnum">${parseInt(d.split('-')[2])}</span><span class="dicons">${rc?'✏️':''}${hk?'👔':''}</span>`;
    a.addEventListener('click', e => { e.preventDefault(); goDaily(uid, d); });
    cal.appendChild(a);
  }
}

window.goDaily = function(uid, date) {
  dailyUser = uid;
  dailyDate = date || todayStr();
  // ユーザー・日付切替フラグをリセット（renderDailyHealthが強制クリアするよう）
  const ht = g('health-toggle');
  if (ht) delete ht.dataset.renderedKey;
  goView('daily');
};

/* ══════════════════════════════════════
   デイリー
══════════════════════════════════════ */
let dailyUser = 1;
let dailyDate = todayStr();

function getDayData(ukey, date) {
  // ukey/date を省略した場合は現在のデイリー表示に合わせる
  if (!ukey) ukey = dailyUser === 1 ? 'son' : 'daughter';
  if (!date) date = dailyDate;
  // appData.users[ukey] が存在しない場合も appData に直接書く
  if (!appData.users)       appData.users       = {};
  if (!appData.users[ukey]) appData.users[ukey] = { clothes_count:0, clothes_last_date:null, exchange_logs:{}, daily:{} };
  if (!appData.users[ukey].daily) appData.users[ukey].daily = {};
  if (!appData.users[ukey].daily[date]) {
    appData.users[ukey].daily[date] = { total_points:0, total_time_minutes:0, total_money:0, item_states:{}, point_logs:{}, manual_logs:{} };
  }
  return appData.users[ukey].daily[date];
}

function renderDaily() {
  const ukey = dailyUser === 1 ? 'son' : 'daughter';
  // バッジをタップで相手のユーザーのデイリーに切替
  const badge = g('daily-user-badge');
  if (badge) {
    badge.textContent = dailyUser === 1 ? '👦 息子 ⇄' : '👧 娘 ⇄';
    badge.style.cursor = 'pointer';
    badge.onclick = () => goDaily(dailyUser === 1 ? 2 : 1, dailyDate);
  }
  setText('daily-date-badge', dailyDate.replace(/-/g,'/') + '（' + dowJa(dailyDate) + '）');

  const day   = getDayData();
  const daily = appData.users[ukey]?.daily || {};
  const pts   = day.total_points        || 0;
  const mins  = day.total_time_minutes  || 0;
  const money = day.total_money         || 0;
  const cp    = Object.values(daily).reduce((s, d) => s + (d.total_points || 0), 0);
  const ct    = Object.values(daily).reduce((s, d) => s + (d.total_time_minutes || 0), 0);
  const cm    = Object.values(daily).reduce((s, d) => s + (d.total_money || 0), 0);

  setText('today-pts',   (pts   >= 0 ? '+' : '') + pts   + 'P');
  setText('today-time',  fmtMin(mins));
  setText('today-money', (money >= 0 ? '+' : '') + money.toLocaleString() + '円');
  setText('cum-pts',     cp + 'P');
  setText('cum-time',    fmtMin(ct));
  setText('cum-money',   cm.toLocaleString() + '円');
  renderItems();
  renderLogs();
  renderDailyHealth();  // ← 毎回必ず呼ぶ
}

function renderItems() {
  const grid  = g('items-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const ukey  = dailyUser === 1 ? 'son' : 'daughter';
  const col   = dailyUser === 1 ? 'visible_son' : 'visible_daughter';
  const items = (toArr(appData.items)).filter(i => i[col]).sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
  const day   = getDayData();
  const states= day.item_states || {};
  const pos   = items.filter(i => i.is_positive);
  const neg   = items.filter(i => !i.is_positive);

  buildItemBtns(grid, pos, states);
  if (neg.length) {
    const sep = document.createElement('div');
    sep.className = 'neg-sep';
    sep.textContent = 'マイナス項目';
    grid.appendChild(sep);
    buildItemBtns(grid, neg, states);
  }
}

function buildItemBtns(grid, items, states) {
  items.forEach(item => {
    const sid   = String(item.id);
    const st    = states[sid] || { press_count:0, point_count:0, time_count:0 };
    const count = st.press_count || 0;
    const done  = count > 0;
    const pos   = item.is_positive;

    const btn = document.createElement('button');
    btn.className = ['item-btn', done?(pos?'done':'neg-item done'):(pos?'':'neg-item')].filter(Boolean).join(' ');
    btn.dataset.itemId = sid;

    if (done && pos)  btn.appendChild(mkEl('span','done-mark','✓'));
    if (count > 1)    btn.appendChild(mkEl('span','cnt-badge', count+'×'));
    btn.appendChild(mkEl('div','item-name', item.name));

    const meta = document.createElement('div');
    meta.className = 'item-meta';
    const bp = item.base_point|0, bt = item.base_time|0;
    if (bp > 0) meta.appendChild(mkEl('span','badge-p','+'+bp+'P'));
    if (bp < 0) meta.appendChild(mkEl('span','badge-n', bp+'P'));
    if (bt > 0) meta.appendChild(mkEl('span','badge-t','+'+fmtMin(bt)));
    if (bt < 0) meta.appendChild(mkEl('span','badge-n', fmtMin(bt)));
    btn.appendChild(meta);

    btn.addEventListener('click', () => pressItem(sid));
    grid.appendChild(btn);
  });
}

async function pressItem(itemId) {
  const item = (toArr(appData.items)).find(i => String(i.id) === String(itemId));
  if (!item) { console.warn('item not found:', itemId); return; }

  const ukey = dailyUser === 1 ? 'son' : 'daughter';
  const sid  = String(itemId);

  // getDayData() で必ず appData に今日のレコードを作成してから取得
  const day = getDayData(ukey, dailyDate);
  if (!day.item_states)  day.item_states  = {};
  if (!day.point_logs)   day.point_logs   = {};
  if (!day.manual_logs)  day.manual_logs  = {};

  const st = day.item_states[sid] || { press_count:0, point_count:0, time_count:0 };

  // ── 制限チェック ──
  if (item.weekly_limit) {
    const dow0 = new Date(dailyDate+'T00:00:00').getDay();
    const sun  = offsetDate(dailyDate, -dow0);
    const sat  = offsetDate(sun, 6);
    const daily = appData.users[ukey]?.daily || {};
    for (const [d, rec] of Object.entries(daily)) {
      if (d >= sun && d <= sat && d !== dailyDate) {
        if ((rec.item_states?.[sid]?.press_count || 0) > 0) { toast('週1回の制限です','ng'); return; }
      }
    }
    if (st.press_count > 0) { toast('週1回の制限です（今週分）','ng'); return; }
  }
  if (item.daily_limit && st.press_count > 0) { toast('今日はもう押せません','ng'); return; }
  if (item.max_per_day != null && st.press_count >= item.max_per_day) {
    toast(`1日${item.max_per_day}回の制限です`,'ng'); return;
  }

  let add_p = item.base_point|0;
  let add_t = item.base_time|0;
  let add_m = item.base_money|0;
  if (item.max_point_per_day != null && st.point_count >= item.max_point_per_day) add_p = 0;
  if (item.max_time_per_day  != null && st.time_count  >= item.max_time_per_day)  add_t = 0;
  if (add_p === 0 && add_t === 0 && (item.max_point_per_day != null || item.max_time_per_day != null)) {
    toast('今日の上限に達しています','ng'); return;
  }

  const ts    = nowJST();
  const logId = 'pl_' + Date.now();
  const newSt = {
    press_count: (st.press_count||0) + 1,
    point_count: (st.point_count||0) + (add_p !== 0 ? 1 : 0),
    time_count:  (st.time_count ||0) + (add_t !== 0 ? 1 : 0),
  };

  // ── 1. ローカル appData を先に更新（オプティミスティック更新）──
  day.total_points       = (day.total_points||0)      + add_p;
  day.total_time_minutes = (day.total_time_minutes||0) + add_t;
  day.total_money        = (day.total_money||0)        + add_m;
  day.item_states[sid]   = newSt;
  day.point_logs[logId]  = { id:logId, item_id:parseInt(itemId), item_name:item.name,
                              points_added:add_p, time_added:add_t, money_added:add_m, timestamp:ts };

  // ── 2. 画面をすぐに更新 ──
  renderDaily();
  const btn = document.querySelector(`.item-btn[data-item-id="${itemId}"]`);
  if (btn) { btn.classList.add('anim-pop'); setTimeout(()=>btn?.classList.remove('anim-pop'), 300); }
  toast(item.name + ' ✓', 'ok');

  // ── 3. Firebase に書き込み（非同期・バックグラウンド）──
  const basePath = `users/${ukey}/daily/${dailyDate}`;
  dbUpdate(basePath, {
    total_points:      day.total_points,
    total_time_minutes:day.total_time_minutes,
    [`item_states/${sid}`]: newSt,
    [`point_logs/${logId}`]: day.point_logs[logId],
  }).catch(e => {
    console.error('pressItem Firebase error:', e);
    toast('保存エラー（再試行してください）','ng');
  });

  // 明日の服ボーナス
  if (item.item_key === 'ashita_no_fuku' && (st.press_count||0) === 0) {
    checkClothesBonus(ukey, add_p);
  }
}

async function checkClothesBonus(ukey, addPts) {
  const u     = appData.users[ukey] || {};
  const count = u.clothes_count || 0;
  const last  = u.clothes_last_date;
  const today = dailyDate;
  // 同じ日に2回カウントしない
  if (last === today) return;
  // 累計でインクリメント（連続チェックなし）
  const newCount = count + 1;
  if (newCount >= 7) {
    // 7日累計達成 → ボーナス付与・リセット
    const day     = getDayData();
    const ts      = nowJST();
    const logId   = 'pl_bonus_' + Date.now();
    const basePath= `users/${ukey}/daily/${dailyDate}`;
    await dbUpdate(basePath, {
      total_points: (day.total_points||0) + addPts + 10,
      [`point_logs/${logId}`]: { id:logId, item_id:0, item_name:'明日の服ボーナス（累計7日達成）', points_added:10, time_added:0, timestamp:ts },
    });
    await dbUpdate(`users/${ukey}`, { clothes_count:0, clothes_last_date:today });
    setTimeout(() => toast('🎉 累計7日達成！ボーナス +10P', 'info', 4000), 600);
  } else {
    await dbUpdate(`users/${ukey}`, { clothes_count:newCount, clothes_last_date:today });
  }
}

function renderLogs() {
  const list = g('log-list');
  if (!list) return;
  const day = getDayData();
  const pl  = Object.values(day.point_logs  || {}).map(l => ({ ...l, _t:'point',  pts:l.points_added|0, mins:l.time_added|0,   mny:l.money_added|0,  name:l.item_name||'' }));
  const ml  = Object.values(day.manual_logs || {}).map(l => ({ ...l, _t:'manual', pts:l.points|0,       mins:l.time_minutes|0, mny:l.money|0,        name:l.description||'' }));
  const all = [...pl, ...ml].sort((a,b) => a.timestamp > b.timestamp ? 1 : -1);

  list.innerHTML = '';
  if (!all.length) { list.innerHTML = '<li class="empty">まだ記録がありません</li>'; return; }
  all.forEach(log => {
    const li  = document.createElement('li');
    li.className = 'log-item';
    const ph  = log.pts  !== 0 ? `<span class="${log.pts >0?'lp':'ln'}">${log.pts >0?'+'+log.pts+'P':log.pts+'P'}</span>` : '';
    const th  = log.mins !== 0 ? `<span class="${log.mins>0?'lt':'ln'}">${log.mins>0?'+':''}<b>${fmtMin(log.mins)}</b></span>` : '';
    const ts  = log.timestamp ? '＠' + log.timestamp.slice(0,16).replace('T',' ') : '';
    li.innerHTML = `<span class="log-text">${[ph,th].filter(Boolean).join(' ')} ：${log.name}：<span class="text-xs text-lt">${ts}</span></span><button class="log-del" data-type="${log._t}" data-id="${log.id}">✕</button>`;
    list.appendChild(li);
  });
}



// 手動追加
window.setSign = function(btn) {
  document.querySelectorAll('.sign-toggle button').forEach(b => b.classList.remove('on-pos','on-neg'));
  btn.classList.add(btn.dataset.val === '+' ? 'on-pos' : 'on-neg');
  g('sign-val').value = btn.dataset.val;
};
window.setDesc = function(chip) { g('m-desc').value = chip.textContent; };

window.submitManual = async function() {
  const sign = g('sign-val').value || '+';
  let pts    = parseInt(g('m-pts').value   || '0');
  let mins   = parseInt(g('m-mins').value  || '0');
  let money  = parseInt(g('m-money').value || '0');
  const desc = g('m-desc').value.trim() || '手動追加';
  if (pts === 0 && mins === 0 && money === 0) { toast('いずれかの値を入力してください','ng'); return; }
  if (sign === '-') { pts = -Math.abs(pts); mins = -Math.abs(mins); money = -Math.abs(money); }
  else              { pts =  Math.abs(pts); mins =  Math.abs(mins); money =  Math.abs(money); }

  const ukey  = dailyUser === 1 ? 'son' : 'daughter';
  const date  = dailyDate;
  const day   = getDayData(ukey, date);
  if (!day.manual_logs) day.manual_logs = {};
  const ts    = nowJST();
  const logId = 'ml_' + Date.now();

  day.total_points       = (day.total_points||0)      + pts;
  day.total_time_minutes = (day.total_time_minutes||0) + mins;
  day.total_money        = (day.total_money||0)        + money;
  day.manual_logs[logId] = { id:logId, points:pts, time_minutes:mins, money, description:desc, timestamp:ts };

  closeModal('manual-modal');
  ['m-pts','m-mins','m-money','m-desc'].forEach(id => { const el=g(id); if(el) el.value=''; });
  renderDaily();
  toast('追加しました ✓','ok');

  const base = `users/${ukey}/daily/${date}`;
  dbUpdate(base, {
    total_points:      day.total_points,
    total_time_minutes:day.total_time_minutes,
    total_money:       day.total_money,
    [`manual_logs/${logId}`]: day.manual_logs[logId],
  }).catch(e => { console.error('submitManual Firebase error:', e); toast('保存エラー','ng'); });
};



/* ══════════════════════════════════════
   サマリー
══════════════════════════════════════ */
let sumUser = 1;
window.setSumUser = function(uid) {
  sumUser = uid;
  g('sum-tab-1').classList.toggle('active', uid===1);
  g('sum-tab-2').classList.toggle('active', uid===2);
  renderSummary();
};

function renderSummary() {
  const ukey = sumUser === 1 ? 'son' : 'daughter';
  const u    = appData.users[ukey] || {};
  const s    = appData.settings;
  const pph  = s.points_per_hour, ypp = s.yen_per_point;
  const daily= u.daily || {};
  const tp   = Object.values(daily).reduce((s, d) => s + (d.total_points||0), 0);
  const tt   = Object.values(daily).reduce((s, d) => s + (d.total_time_minutes||0), 0);
  const tm   = Object.values(daily).reduce((s, d) => s + (d.total_money||0), 0);
  const h    = Math.floor(tt/60), m = tt%60;
  const ep   = tp + h * pph;

  setText('sum-pts',   tp + 'P');
  setText('sum-time',  h>0?(m>0?`${h}h${m}m`:`${h}時間`):`${m}分`);
  setText('sum-yen',   (ep * ypp).toLocaleString() + '円');
  setText('sum-money', tm.toLocaleString() + '円');

  const cnt = u.clothes_count || 0;
  setText('clothes-num', cnt + ' / 7日');
  const dotsWrap = g('clothes-dots');
  if (dotsWrap) {
    dotsWrap.innerHTML = '';
    for (let i=1;i<=7;i++) {
      const d = document.createElement('div');
      d.className = 'dot'+(i<=cnt?' on':'');
      // 数字なし・シンプルな●○ゲージ
      dotsWrap.appendChild(d);
    }
  }
  renderExList(Object.values(u.exchange_logs||{}).sort((a,b)=>b.timestamp>a.timestamp?1:-1));
  renderSummaryMonthLog(sumUser);
}

function renderExList(logs) {
  const list = g('ex-list');
  if (!list) return;
  if (!logs.length) { list.innerHTML='<div class="empty">交換履歴がありません</div>'; return; }
  const typeMap = { time:'⏱時間', money:'💰お小遣い', item:'🎁アイテム', other:'その他' };
  list.innerHTML = '';
  logs.forEach(l => {
    const d = document.createElement('div'); d.className = 'ex-item';
    d.innerHTML = `
      <div>
        <span class="ex-type">${typeMap[l.type]||l.type}</span>
        <div style="font-weight:600">${l.description||'－'}</div>
        ${l.value_received?`<div class="text-xs text-lt">${l.value_received}</div>`:''}
        <div class="text-xs text-lt">${(l.timestamp||'').slice(0,16).replace('T',' ')}</div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:5px">
        <span class="ex-pts">−${l.points_used}P</span>
        <button class="del-btn" data-exid="${l.id}" style="font-size:.7rem;padding:3px 7px">削除</button>
      </div>`;
    list.appendChild(d);
  });
  list.querySelectorAll('[data-exid]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmDlg('この交換記録を削除しますか？（ポイントは今日に返還）', async () => {
        const ukey  = sumUser === 1 ? 'son' : 'daughter';
        const u     = appData.users[ukey] || {};
        const ex    = (u.exchange_logs||{})[btn.dataset.exid];
        if (!ex) return;
        const today = todayStr();
        const day   = (u.daily||{})[today] || { total_points:0 };
        await dbUpdate(`users/${ukey}/daily/${today}`, { total_points:(day.total_points||0)+(ex.points_used||0) });
        await dbRemove(`users/${ukey}/exchange_logs/${btn.dataset.exid}`);
        toast('削除・返還しました','info');
      });
    });
  });
}

window.submitExchange = async function() {
  const ukey  = sumUser === 1 ? 'son' : 'daughter';
  const u     = appData.users[ukey] || {};
  const daily = u.daily || {};
  const tp    = Object.values(daily).reduce((s, d) => s + (d.total_points||0), 0);
  const pts   = parseInt(g('ex-pts').value || '0');
  if (pts <= 0) { toast('ポイント数を入力してください','ng'); return; }
  if (tp < pts) { toast(`ポイント不足（残${tp}P）`,'ng'); return; }

  const today = todayStr();
  const day   = daily[today] || { total_points:0 };
  const ts    = nowJST();
  const eid   = 'ex_' + Date.now();

  await dbUpdate(`users/${ukey}/daily/${today}`, { total_points:(day.total_points||0)-pts });
  await dbUpdate(`users/${ukey}/exchange_logs/${eid}`, {
    id:eid, type:g('ex-type').value, points_used:pts,
    value_received:g('ex-val').value.trim(), description:g('ex-desc').value.trim(), timestamp:ts,
  });
  closeModal('ex-modal');
  ['ex-pts','ex-val','ex-desc'].forEach(id=>{const el=g(id);if(el)el.value='';});
  toast('交換を記録しました ✓','ok');
};

/* ══════════════════════════════════════
   推移
══════════════════════════════════════ */
let trUser = 1;
let trCharts = {};
window.setTrUser = function(uid) {
  trUser = uid;
  g('tr-tab-1').classList.toggle('active', uid===1);
  g('tr-tab-2').classList.toggle('active', uid===2);
  renderTrends();
};

function renderTrends() {
  const ukey  = trUser === 1 ? 'son' : 'daughter';
  const daily = appData.users[ukey]?.daily || {};
  const monthly={}, yearly={};

  for (const [d, rec] of Object.entries(daily)) {
    const ym = d.slice(0,7), yr = d.slice(0,4);
    if (!monthly[ym]) monthly[ym]={ym,pts:0,mins:0,days:0};
    if (!yearly[yr])  yearly[yr] ={yr,pts:0,mins:0};
    monthly[ym].pts  += rec.total_points||0;
    monthly[ym].mins += rec.total_time_minutes||0;
    monthly[ym].days++;
    yearly[yr].pts   += rec.total_points||0;
    yearly[yr].mins  += rec.total_time_minutes||0;
  }
  const mo = Object.values(monthly).sort((a,b)=>a.ym>b.ym?1:-1);
  const yr = Object.values(yearly).sort((a,b)=>a.yr>b.yr?1:-1);

  makeBar('chart-pts',  mo.map(r=>r.ym),  mo.map(r=>r.pts),  'ポイント',  '#d4622a');
  makeBar('chart-time', mo.map(r=>r.ym),  mo.map(r=>Math.round(r.mins/60*10)/10), '時間(h)', '#1a6fa8');
  makeBar('chart-year', yr.map(r=>r.yr),  yr.map(r=>r.pts),  '年間P',     '#2f6844');
  renderTempGraph(trUser);

  const tb = g('mo-tbody');
  if (tb) {
    tb.innerHTML = '';
    [...mo].reverse().forEach(r => {
      const h=Math.floor(r.mins/60),m=r.mins%60;
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${r.ym}</td><td class="td-p">${r.pts}P</td><td class="td-t">${h?h+'h':''}${m?m+'m':''}</td><td>${r.days}日</td>`;
      tb.appendChild(tr);
    });
    if (!mo.length) tb.innerHTML='<tr><td colspan="4" class="empty">データなし</td></tr>';
  }
}

function makeBar(id, labels, data, label, color) {
  if (trCharts[id]) { trCharts[id].destroy(); delete trCharts[id]; }
  const ctx = g(id); if (!ctx) return;
  trCharts[id] = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{label, data, backgroundColor:color+'99', borderColor:color, borderWidth:1.5, borderRadius:5}] },
    options:{ responsive:true, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false}}, y:{beginAtZero:true, grid:{color:'#eee'}} } }
  });
}

/* ══════════════════════════════════════
   設定
══════════════════════════════════════ */
function renderSettingsView() {
  try {
    const s = appData.settings || {};
    setVal('s-pph', s.points_per_hour || 50);
    setVal('s-ypp', s.yen_per_point   || 4);
    renderSettingsItems();
    renderTagsList();
    // Firebaseトグルは閉じた状態を維持（localStorageで記憶）
    const fbToggle = document.querySelector('#view-settings .toggle');
    if (fbToggle && !localStorage.getItem('fb_toggle_opened')) {
      fbToggle.classList.remove('open');
    }
    // Firebase設定フィールドを復元

  } catch(e) {
    console.error('renderSettingsView error:', e);
  }
}

window.saveSettings = async function() {
  await dbUpdate('settings', {
    points_per_hour: parseInt(g('s-pph').value)||50,
    yen_per_point:   parseInt(g('s-ypp').value)||4,
  });
  toast('設定を保存しました ✓','ok');
  renderRateMemo();  // レートメモに即反映
};

function renderSettingsItems() {
  const list = g('items-list');
  if (!list) return;
  try {
  const items = toArr(appData.items);
  if (!items.length) { list.innerHTML='<div class="empty">項目がありません</div>'; return; }
  list.innerHTML = '';
  items.forEach(item => {
    const lim = [
      item.daily_limit?'1日1回':'', item.weekly_limit?'週1回':'',
      item.max_per_day?`最大${item.max_per_day}回/日`:'',
      item.max_point_per_day?`P最大${item.max_point_per_day}回`:'',
      item.max_time_per_day ?`時間最大${item.max_time_per_day}回`:'',
    ].filter(Boolean).join(' / ')||'制限なし';
    const val = [
      (item.base_point?(item.base_point>0?'+':'')+item.base_point+'P':''),
      (item.base_time ?(item.base_time >0?'+':'')+item.base_time +'分':''),
      (item.base_money?(item.base_money>0?'+':'')+item.base_money.toLocaleString()+'円':''),
    ].filter(Boolean).join(' ');
    const vis = [item.visible_son?'息子':'',item.visible_daughter?'娘':''].filter(Boolean).join('・');
    const row = document.createElement('div'); row.className='set-row';
    row.innerHTML=`<div class="rm"><div class="rn">${item.name} <span class="text-lt" style="font-size:.78rem;font-weight:400">${val}</span></div><div class="rs">${lim} ／ 表示：${vis||'なし'} ／ <span style="color:var(--primary);font-weight:700">順：${item.sort_order??'－'}</span></div></div><div class="ra"><button class="edit-btn" data-id="${item.id}">編集</button><button class="del-btn" data-id="${item.id}">削除</button></div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('.edit-btn').forEach(b => {
    b.addEventListener('click', ()=>openItemModal((toArr(appData.items)).find(i=>String(i.id)===b.dataset.id)));
  });
  list.querySelectorAll('.del-btn').forEach(b => {
    b.addEventListener('click', ()=>{
      const item=(toArr(appData.items)).find(i=>String(i.id)===b.dataset.id);
      confirmDlg(`「${item?.name}」を削除しますか？`, async ()=>{
        const newItems=(toArr(appData.items)).filter(i=>String(i.id)!==b.dataset.id);
        await dbSet('items', newItems);
        toast('削除しました');
      });
    });
  });
  } catch(e) { console.error('renderSettingsItems error:', e); }
}

window.openItemModal = function(item) {
  g('item-modal-title').textContent = item?'項目を編集':'項目を追加';
  setVal('i-id',       item?.id??'');
  setVal('i-name',     item?.name??'');
  setVal('i-point',    item?.base_point??0);
  setVal('i-time',     item?.base_time??0);
  setChk('i-daily',    !!item?.daily_limit);
  setChk('i-weekly',   !!item?.weekly_limit);
  setVal('i-max',      item?.max_per_day??'');
  setVal('i-maxp',     item?.max_point_per_day??'');
  setVal('i-maxt',     item?.max_time_per_day??'');
  setVal('i-key',      item?.item_key??'');
  setChk('i-pos',      item?!!item.is_positive:true);
  setChk('i-son',      item?!!item.visible_son:true);
  setChk('i-daughter', item?!!item.visible_daughter:true);
  setVal('i-sort',     item?.sort_order??0);
  openModal('item-modal');
};

window.submitItemForm = async function() {
  // name validation below
  if (!g('i-name').value.trim()) { toast('名前は必須です','ng'); return; }
  const nint = id => { const v=g(id)?.value; return (v!==''&&v!==null&&v!==undefined)?parseInt(v):null; };
  const existId = parseInt(g('i-id').value||'0');
  const newItem = {
    id:          existId || (Math.max(0,...(toArr(appData.items)).map(i=>i.id||0)) + 1),
    name:        g('i-name').value.trim(),
    base_point:  parseInt(g('i-point').value)||0,
    base_time:   parseInt(g('i-time').value)||0,
    daily_limit: g('i-daily').checked,
    weekly_limit:g('i-weekly').checked,
    max_per_day:       nint('i-max'),
    max_point_per_day: nint('i-maxp'),
    max_time_per_day:  nint('i-maxt'),
    item_key:    g('i-key').value.trim()||null,
    is_positive: g('i-pos').checked,
    visible_son: g('i-son').checked,
    visible_daughter:g('i-daughter').checked,
    sort_order:  parseInt(g('i-sort').value)||0,
  };
  const items = toArr(appData.items);
  const newItems = existId ? items.map(i=>i.id===existId?newItem:i) : [...items, newItem];
  newItems.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  await dbSet('items', newItems);
  closeModal('item-modal');
  toast('保存しました ✓','ok');
};

window.resetClothes = function(uid) {
  const uname = uid===1?'息子':'娘';
  confirmDlg(`${uname}の服カウントをリセットしますか？`, async ()=>{
    const ukey = uid===1?'son':'daughter';
    await dbUpdate(`users/${ukey}`, { clothes_count:0, clothes_last_date:null });
    toast(`${uname}リセット完了`,'ok');
  });
};

/* ══════════════════════════════════════
   タグ定数（カラーパレット10色）
══════════════════════════════════════ */
const TAG_COLORS = [
  '#e74c3c','#e67e22','#f1c40f','#2ecc71',
  '#1abc9c','#3498db','#9b59b6','#e91e63',
  '#795548','#607d8b'
];

function toTags() {
  const t = appData.tags;
  if (!t) return [];
  return Array.isArray(t) ? t : Object.values(t);
}

/* ══════════════════════════════════════
   デイリー：体温・タグ・メモ
══════════════════════════════════════ */
function renderDailyHealth() {
  // 毎回呼び出し時点の uid/date をスナップショット → 必ず正しいデータを表示
  const uid  = dailyUser;
  const date = dailyDate;
  const ukey = uid === 1 ? 'son' : 'daughter';
  const col  = uid === 1 ? 'visible_son' : 'visible_daughter';

  // appData から該当ユーザー・日付のデータを取得（なければ空）
  const day    = appData.users?.[ukey]?.daily?.[date] || {};
  const ti     = g('temp-input');
  const ma     = g('memo-area');
  const tw     = g('daily-tags');

  // 体温：常に上書き（フォーカス中でも正しい値に戻す）
  if (ti) ti.value = (day.temperature != null) ? day.temperature : '';

  // タグ
  if (tw) {
    tw.innerHTML = '';
    const tags   = toTags().filter(t => t[col]);
    const selIds = Array.isArray(day.tag_ids) ? day.tag_ids
                 : Object.values(day.tag_ids || []);
    tags.forEach(tag => {
      const active = selIds.map(String).includes(String(tag.id));
      const chip   = document.createElement('span');
      chip.className = 'tag-chip ' + (active ? 'active' : 'inactive');
      chip.style.background  = active ? tag.color : 'transparent';
      chip.style.borderColor = tag.color;
      chip.style.color       = active ? '#fff' : tag.color;
      chip.textContent       = tag.name;
      chip.addEventListener('click', () => toggleDailyTag(String(tag.id)));
      tw.appendChild(chip);
    });
    if (!tags.length) tw.innerHTML = '<span class="text-lt text-xs">設定でタグを追加してください</span>';
  }

  // メモ：常に上書き
  if (ma) ma.value = day.memo || '';
}

async function toggleDailyTag(tagId) {
  const uid  = dailyUser;        // 呼び出し時点でスナップショット
  const date = dailyDate;
  const ukey = uid === 1 ? 'son' : 'daughter';
  const day  = getDayData(ukey, date);
  let ids    = Array.isArray(day.tag_ids) ? [...day.tag_ids]
             : Object.values(day.tag_ids || []);
  if (ids.includes(tagId)) ids = ids.filter(i => i !== tagId);
  else ids.push(tagId);
  day.tag_ids = ids;
  renderDailyHealth();
  dbUpdate(`users/${ukey}/daily/${date}`, { tag_ids: ids.length ? ids : null })
    .catch(e => console.error('tag save error:', e));
}

window.saveTemp = async function() {
  const uid  = dailyUser;        // 呼び出し時点でスナップショット
  const date = dailyDate;
  const ukey = uid === 1 ? 'son' : 'daughter';
  const raw  = g('temp-input')?.value.trim() || '';
  const val  = raw === '' ? null : parseFloat(raw);
  if (val !== null && (isNaN(val) || val < 30 || val > 45)) {
    toast('体温の値が正しくありません','ng'); return;
  }
  getDayData(ukey, date).temperature = val;
  const saved = g('temp-saved');
  if (saved) { saved.style.opacity = '1'; setTimeout(() => saved.style.opacity = '0', 1800); }
  dbUpdate(`users/${ukey}/daily/${date}`, { temperature: val })
    .catch(e => console.error('temp save error:', e));
};

window.saveMemo = async function() {
  const uid  = dailyUser;        // 呼び出し時点でスナップショット
  const date = dailyDate;
  const ukey = uid === 1 ? 'son' : 'daughter';
  const val  = g('memo-area')?.value || '';
  getDayData(ukey, date).memo = val;
  const saved = g('memo-saved');
  if (saved) { saved.style.opacity = '1'; setTimeout(() => saved.style.opacity = '0', 1800); }
  dbUpdate(`users/${ukey}/daily/${date}`, { memo: val })
    .catch(e => console.error('memo save error:', e));
};

/* ══════════════════════════════════════
   サマリー：月別ログ一覧
══════════════════════════════════════ */
function renderSummaryMonthLog(uid) {
  const ukey  = uid === 1 ? 'son' : 'daughter';
  const daily = appData.users[ukey]?.daily || {};
  const tags  = toTags();
  const tbody = g('month-log-tbody');
  if (!tbody) return;
  const month = nowJST().slice(0, 7);
  const rows  = Object.entries(daily)
    .filter(([d]) => d.startsWith(month))
    .sort(([a],[b]) => b > a ? 1 : -1);
  tbody.innerHTML = '';
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="3" class="empty">記録なし</td></tr>'; return; }
  rows.forEach(([d, rec]) => {
    const tr   = document.createElement('tr');
    const temp = rec.temperature ? rec.temperature + '℃' : '－';
    const ids  = Array.isArray(rec.tag_ids) ? rec.tag_ids : Object.values(rec.tag_ids || []);
    const tagHtml = ids.map(tid => {
      const tag = tags.find(t => String(t.id) === String(tid));
      return tag ? `<span class="tag-chip active" style="background:${tag.color};color:#fff;border-color:${tag.color};font-size:.65rem;padding:1px 6px">${tag.name}</span>` : '';
    }).join('');
    tr.innerHTML = `<td style="white-space:nowrap;font-weight:600">${d.slice(5).replace('-','/')}</td><td style="text-align:center">${temp}</td><td>${tagHtml||'－'}</td>`;
    tbody.appendChild(tr);
  });
}

/* ══════════════════════════════════════
   推移：体温グラフ
══════════════════════════════════════ */
function renderTempGraph(uid) {
  const ukey  = uid === 1 ? 'son' : 'daughter';
  const daily = appData.users[ukey]?.daily || {};

  // 月ごとに集計
  const monthly = {};
  Object.entries(daily).forEach(([d, rec]) => {
    if (!rec.temperature) return;
    const ym = d.slice(0, 7);
    if (!monthly[ym]) monthly[ym] = [];
    monthly[ym].push(parseFloat(rec.temperature));
  });
  const labels = Object.keys(monthly).sort();
  const avgs   = labels.map(ym => {
    const arr = monthly[ym];
    return Math.round(arr.reduce((s,v)=>s+v,0) / arr.length * 10) / 10;
  });

  if (trCharts['chart-temp']) { trCharts['chart-temp'].destroy(); delete trCharts['chart-temp']; }
  const ctx = g('chart-temp');
  if (!ctx) return;

  // 既存のemptyメッセージを毎回クリア
  ctx.parentElement.querySelectorAll('.empty').forEach(el => el.remove());
  ctx.style.display = '';

  if (!labels.length) {
    ctx.style.display = 'none';
    const msg = document.createElement('div');
    msg.className = 'empty'; msg.textContent = '体温データがありません';
    ctx.parentElement.appendChild(msg);
    return;
  }

  const minT = Math.floor(Math.min(...avgs) * 2) / 2 - 0.3;
  const maxT = Math.ceil( Math.max(...avgs) * 2) / 2 + 0.3;

  trCharts['chart-temp'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '体温月平均(℃)',
        data: avgs,
        borderColor: '#e74c3c',
        backgroundColor: 'rgba(231,76,60,.08)',
        borderWidth: 2.5,
        pointRadius: 6,
        pointHoverRadius: 8,
        tension: 0.3,
        fill: true,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => c.parsed.y.toFixed(1) + '℃' } }
      },
      scales: {
        x: { grid: { display: false } },
        y: { min: minT, max: maxT, grid: { color: '#eee' },
             ticks: { callback: v => v.toFixed(1) + '℃', stepSize: 0.5 } }
      }
    }
  });
}

/* ══════════════════════════════════════
   検索
══════════════════════════════════════ */
let searchUser = 1;
window.setSearchUser = function(uid) {
  searchUser = uid;
  g('sr-tab-1').classList.toggle('active', uid===1);
  g('sr-tab-2').classList.toggle('active', uid===2);
  renderSearch();
};

let searchSelectedTags = [];

function renderSearch() {
  const col  = searchUser === 1 ? 'visible_son' : 'visible_daughter';
  const tags = toTags().filter(t => t[col]);

  // タグフィルター描画
  const tw = g('search-tags');
  if (tw) {
    tw.innerHTML = '';
    tags.forEach(tag => {
      const active = searchSelectedTags.includes(String(tag.id));
      const chip   = document.createElement('span');
      chip.className = 'tag-chip ' + (active ? 'active' : 'inactive');
      chip.style.background  = active ? tag.color : 'transparent';
      chip.style.borderColor = tag.color;
      chip.style.color       = active ? '#fff' : tag.color;
      chip.textContent       = tag.name;
      chip.addEventListener('click', () => {
        const sid = String(tag.id);
        if (searchSelectedTags.includes(sid)) searchSelectedTags = searchSelectedTags.filter(i=>i!==sid);
        else searchSelectedTags.push(sid);
        renderSearch();
        runSearch();
      });
      tw.appendChild(chip);
    });
  }
  runSearch();
}

function runSearch() {
  const ukey  = searchUser === 1 ? 'son' : 'daughter';
  const daily = appData.users[ukey]?.daily || {};
  const kw    = (g('search-kw')?.value || '').trim().toLowerCase();
  const tags  = toTags();
  const result= g('search-result');
  if (!result) return;

  const entries = Object.entries(daily).sort(([a],[b]) => b > a ? 1 : -1);
  const filtered = entries.filter(([d, rec]) => {
    const memoMatch = !kw || (rec.memo || '').toLowerCase().includes(kw);
    const tagIds    = Array.isArray(rec.tag_ids) ? rec.tag_ids : Object.values(rec.tag_ids || []);
    const tagMatch  = searchSelectedTags.length === 0 ||
                      searchSelectedTags.every(tid => tagIds.includes(tid));
    return memoMatch && tagMatch;
  });

  result.innerHTML = '';
  if (!filtered.length) {
    result.innerHTML = '<div class="empty">該当する記録が見つかりません</div>'; return;
  }
  filtered.forEach(([d, rec]) => {
    const tagIds  = Array.isArray(rec.tag_ids) ? rec.tag_ids : Object.values(rec.tag_ids || []);
    const tagHtml = tagIds.map(tid => {
      const tag = tags.find(t => String(t.id) === String(tid));
      return tag ? `<span class="tag-chip active" style="background:${tag.color};color:#fff;border-color:${tag.color};font-size:.65rem;padding:1px 6px">${tag.name}</span>` : '';
    }).join(' ');
    const temp = rec.temperature ? `🌡️ ${rec.temperature}℃` : '';
    const memo = rec.memo ? rec.memo.slice(0, 40) + (rec.memo.length > 40 ? '…' : '') : '';
    const item = document.createElement('div');
    item.className = 'search-item';
    // 1段目：日付・体温・タグを横並び（折り返しあり）
    // 2段目：メモ
    item.innerHTML = `<div class="si-row1">
        <span class="si-date">${d}</span>
        ${temp ? `<span class="si-temp">${temp}</span>` : ''}
        ${tagHtml}
      </div>
      ${memo ? `<div class="si-memo">${memo}</div>` : ''}`;
    item.addEventListener('click', () => { goDaily(searchUser, d); });
    result.appendChild(item);
  });
}

// 検索バーのリアルタイム入力
setTimeout(() => {
  g('search-kw')?.addEventListener('input', runSearch);
}, 100);

/* ══════════════════════════════════════
   設定：タグ管理
══════════════════════════════════════ */
function renderTagsList() {
  const list = g('tags-list');
  if (!list) return;
  const tags = toTags();
  if (!tags.length) { list.innerHTML = '<div class="empty">タグがありません</div>'; return; }
  list.innerHTML = '';
  tags.forEach(tag => {
    const vis = [tag.visible_son?'息子':'', tag.visible_daughter?'娘':''].filter(Boolean).join('・');
    const row = document.createElement('div');
    row.className = 'set-row';
    row.innerHTML = `
      <div class="rm" style="display:flex;align-items:center;gap:8px">
        <span class="tag-chip active" style="background:${tag.color};color:#fff;border-color:${tag.color}">${tag.name}</span>
        <span class="text-xs text-lt">表示：${vis||'なし'}</span>
      </div>
      <div class="ra">
        <button class="edit-btn" data-tid="${tag.id}">編集</button>
        <button class="del-btn"  data-tid="${tag.id}">削除</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('.edit-btn[data-tid]').forEach(b => {
    b.addEventListener('click', () => openTagModal(toTags().find(t => String(t.id) === b.dataset.tid)));
  });
  list.querySelectorAll('.del-btn[data-tid]').forEach(b => {
    b.addEventListener('click', () => {
      const tag = toTags().find(t => String(t.id) === b.dataset.tid);
      confirmDlg(`「${tag?.name}」を削除しますか？`, async () => {
        const newTags = toTags().filter(t => String(t.id) !== b.dataset.tid);
        await dbSet('tags', newTags);
        toast('削除しました');
      });
    });
  });
}

window.openTagModal = function(tag) {
  g('tag-modal-title').textContent = tag ? 'タグを編集' : 'タグを追加';
  setVal('t-id',   tag?.id   ?? '');
  setVal('t-name', tag?.name ?? '');
  setVal('t-color', tag?.color ?? TAG_COLORS[0]);
  setChk('t-son',      tag ? !!tag.visible_son      : true);
  setChk('t-daughter', tag ? !!tag.visible_daughter : true);
  // カラーパレット描画
  const palette = g('color-palette');
  if (palette) {
    palette.innerHTML = '';
    TAG_COLORS.forEach(c => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (c === (tag?.color ?? TAG_COLORS[0]) ? ' selected' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => {
        palette.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        setVal('t-color', c);
      });
      palette.appendChild(sw);
    });
  }
  openModal('tag-modal');
};

window.submitTagForm = async function() {
  const name = g('t-name')?.value.trim();
  if (!name) { toast('タグ名は必須です','ng'); return; }
  const existId = g('t-id')?.value;
  const newTag  = {
    id:              existId ? parseInt(existId) : (Math.max(0, ...toTags().map(t=>t.id||0)) + 1),
    name,
    color:           getVal('t-color') || TAG_COLORS[0],
    visible_son:     g('t-son')?.checked ?? true,
    visible_daughter:g('t-daughter')?.checked ?? true,
  };
  const tags    = toTags();
  const newTags = existId ? tags.map(t => String(t.id) === existId ? newTag : t) : [...tags, newTag];
  await dbSet('tags', newTags);
  closeModal('tag-modal');
  toast('保存しました ✓','ok');
};

/* ══════════════════════════════════════
   確認ダイアログ（iOS PWA対応）
══════════════════════════════════════ */
function confirmDlg(msg, onOk) {
  g('confirm-msg').textContent = msg;
  openModal('confirm-bg');
  g('confirm-ok').onclick = ()=>{ closeModal('confirm-bg'); onOk(); };
}

/* ══════════════════════════════════════
   Toast
══════════════════════════════════════ */
function toast(msg, type='', ms=2500) {
  let w = document.querySelector('.toast-wrap');
  if (!w) { w=document.createElement('div'); w.className='toast-wrap'; document.body.appendChild(w); }
  const el=document.createElement('div'); el.className='toast '+type; el.textContent=msg;
  w.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),320); }, ms);
}

/* ══════════════════════════════════════
   モーダル
══════════════════════════════════════ */
window.openModal  = id => g(id)?.classList.add('open');
window.closeModal = id => g(id)?.classList.remove('open');

/* ══════════════════════════════════════
   ユーティリティ
══════════════════════════════════════ */


/* ══════════════════════════════════════
   起動
══════════════════════════════════════ */
/* ══════════════════════════════════════
   起動（type="module"はDOM解析後に実行されるため
   DOMContentLoadedは使わず直接実行）
══════════════════════════════════════ */

/* ══════════════════════════════════════
   換算計算機
══════════════════════════════════════ */

// 保存リスト（ページ内メモリ）
const calcSaved = { time: [], pts: [], yen: [], yen2: [] };

function getCalcRates() {
  const s = appData.settings || {};
  return {
    pph: parseInt(s.points_per_hour || 50),  // ポイント/時間
    ypp: parseInt(s.yen_per_point   ||  4),  // 円/ポイント
  };
}

function renderCalcRateLabel() {
  const { pph, ypp } = getCalcRates();
  const el = g('calc-rate-label');
  if (el) el.textContent = `${pph}P = 1時間 ／ 1P = ${ypp}円`;
}

/* ── 時間換算 ── */
window.calcTime = function() {
  const h = parseInt(g('c-h')?.value || '0');
  const m = parseInt(g('c-m')?.value || '0');
  if (isNaN(h) && isNaN(m)) return;
  const { pph, ypp } = getCalcRates();

  const totalMin = (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
  if (totalMin === 0) { toast('時間または分を入力してください','ng'); return; }

  const hh   = Math.floor(totalMin / 60);
  const mm   = totalMin % 60;
  const pts  = Math.round(totalMin / 60 * pph);  // 分→ポイント（比例換算）
  const yen  = pts * ypp;

  const rEl = g('r-time');
  rEl.innerHTML = `
    <div class="calc-result-row">
      <span class="calc-result-label">合計（分）</span>
      <span class="calc-result-val time">${totalMin} 分</span>
    </div>
    <div class="calc-result-row">
      <span class="calc-result-label">時間表記</span>
      <span class="calc-result-val time">${hh > 0 ? hh+'時間' : ''}${mm > 0 ? mm+'分' : (hh===0?'0分':'')}</span>
    </div>
    <div class="calc-result-row">
      <span class="calc-result-label">ポイント換算</span>
      <span class="calc-result-val pts">${pts} P</span>
    </div>
    <div class="calc-result-row">
      <span class="calc-result-label">金額換算</span>
      <span class="calc-result-val yen">${yen.toLocaleString()} 円</span>
    </div>
    <div style="text-align:right;margin-top:4px">
      <button class="calc-btn" style="font-size:.75rem;padding:5px 12px" onclick="saveCalc('time','${hh}時間${mm}分 (${totalMin}分) = ${pts}P = ${yen.toLocaleString()}円')">保存</button>
    </div>`;
};

/* ── ポイント換算 ── */
window.calcPoints = function() {
  const pts = parseInt(g('c-pts')?.value || '0');
  if (!pts || pts <= 0) { toast('ポイント数を入力してください','ng'); return; }
  const { pph, ypp } = getCalcRates();

  const yen    = pts * ypp;
  const minVal = Math.round(pts / pph * 60);  // ポイント→分
  const hh     = Math.floor(minVal / 60);
  const mm     = minVal % 60;

  const rEl = g('r-pts');
  rEl.innerHTML = `
    <div class="calc-result-row">
      <span class="calc-result-label">金額換算</span>
      <span class="calc-result-val yen">${yen.toLocaleString()} 円</span>
    </div>
    <div class="calc-result-row">
      <span class="calc-result-label">時間換算（分）</span>
      <span class="calc-result-val time">${minVal} 分</span>
    </div>
    <div class="calc-result-row">
      <span class="calc-result-label">時間表記</span>
      <span class="calc-result-val time">${hh > 0 ? hh+'時間' : ''}${mm > 0 ? mm+'分' : (hh===0?'0分':'')}</span>
    </div>
    <div style="text-align:right;margin-top:4px">
      <button class="calc-btn" style="font-size:.75rem;padding:5px 12px" onclick="saveCalc('pts','${pts}P = ${yen.toLocaleString()}円 = ${minVal}分')">保存</button>
    </div>`;
};

/* ── 金額換算 ── */
window.calcYen = function() {
  const yen = parseInt(g('c-yen')?.value || '0');
  if (!yen || yen <= 0) { toast('金額を入力してください','ng'); return; }
  const { pph, ypp } = getCalcRates();

  const pts    = Math.round(yen / ypp);
  const minVal = Math.round(pts / pph * 60);
  const hh     = Math.floor(minVal / 60);
  const mm     = minVal % 60;

  const rEl = g('r-yen');
  rEl.innerHTML = `
    <div class="calc-result-row">
      <span class="calc-result-label">ポイント換算</span>
      <span class="calc-result-val pts">${pts} P</span>
    </div>
    <div class="calc-result-row">
      <span class="calc-result-label">時間換算（分）</span>
      <span class="calc-result-val time">${minVal} 分</span>
    </div>
    <div class="calc-result-row">
      <span class="calc-result-label">時間表記</span>
      <span class="calc-result-val time">${hh > 0 ? hh+'時間' : ''}${mm > 0 ? mm+'分' : (hh===0?'0分':'')}</span>
    </div>
    <div style="text-align:right;margin-top:4px">
      <button class="calc-btn" style="font-size:.75rem;padding:5px 12px" onclick="saveCalc('yen','${yen.toLocaleString()}円 = ${pts}P = ${minVal}分')">保存</button>
    </div>`;
};

/* ── 保存 ── */
window.saveCalc = function(type, label) {
  calcSaved[type].unshift({ label, ts: nowJST().slice(11,16) });
  if (calcSaved[type].length > 10) calcSaved[type].pop();
  renderSavedList(type);
  toast('保存しました ✓','ok');
};

function renderSavedList(type) {
  const el = g('saved-' + type);
  if (!el) return;
  if (!calcSaved[type].length) { el.innerHTML = ''; return; }
  el.innerHTML = calcSaved[type].map((item, i) => `
    <div class="calc-saved-item">
      <div>
        <div class="cs-label">${item.ts}</div>
        <div class="cs-val">${item.label}</div>
      </div>
      <button class="calc-btn reset" style="padding:3px 8px;font-size:.72rem" onclick="removeSaved('${type}',${i})">✕</button>
    </div>`).join('');
}

window.removeSaved = function(type, idx) {
  calcSaved[type].splice(idx, 1);
  renderSavedList(type);
};

/* ── 所持金換算（calcYen の別バージョン：ポイント換算は逆引き） ── */
window.calcYen2 = function() {
  const yen = parseInt(g('c-yen2')?.value || '0');
  if (!yen || yen <= 0) { toast('金額を入力してください','ng'); return; }
  const { pph, ypp } = getCalcRates();
  const pts    = Math.round(yen / ypp);
  const minVal = Math.round(pts / pph * 60);
  const hh     = Math.floor(minVal / 60);
  const mm     = minVal % 60;
  const rEl = g('r-yen2');
  rEl.innerHTML = `
    <div class="calc-result-row">
      <span class="calc-result-label">ポイント換算</span>
      <span class="calc-result-val pts">${pts} P</span>
    </div>
    <div class="calc-result-row">
      <span class="calc-result-label">時間換算（分）</span>
      <span class="calc-result-val time">${minVal} 分</span>
    </div>
    <div class="calc-result-row">
      <span class="calc-result-label">時間表記</span>
      <span class="calc-result-val time">${hh > 0 ? hh+'時間' : ''}${mm > 0 ? mm+'分' : (hh===0?'0分':'')}</span>
    </div>
    <div style="text-align:right;margin-top:4px">
      <button class="calc-btn" style="font-size:.75rem;padding:5px 12px" onclick="saveCalc('yen2','${yen.toLocaleString()}円 = ${pts}P = ${minVal}分')">保存</button>
    </div>`;
};

/* ── リセット ── */
window.resetCalc = function(type) {
  if (type === 'time') {
    setVal('c-h',''); setVal('c-m','');
    g('r-time').innerHTML = '<span style="color:var(--text-lt);font-size:.78rem">時間または分を入力してください</span>';
    calcSaved.time = []; renderSavedList('time');
  } else if (type === 'pts') {
    setVal('c-pts','');
    g('r-pts').innerHTML = '<span style="color:var(--text-lt);font-size:.78rem">ポイント数を入力してください</span>';
    calcSaved.pts = []; renderSavedList('pts');
  } else if (type === 'yen') {
    setVal('c-yen','');
    g('r-yen').innerHTML = '<span style="color:var(--text-lt);font-size:.78rem">金額を入力してください</span>';
    calcSaved.yen = []; renderSavedList('yen');
  } else if (type === 'yen2') {
    setVal('c-yen2','');
    g('r-yen2').innerHTML = '<span style="color:var(--text-lt);font-size:.78rem">金額を入力してください</span>';
    calcSaved.yen2 = []; renderSavedList('yen2');
  }
};

// 日付ナビ
const resetHealthKey = () => { const ht=g('health-toggle'); if(ht) delete ht.dataset.renderedKey; };
g('btn-prev').addEventListener('click',  () => { dailyDate = offsetDate(dailyDate,-1); resetHealthKey(); renderDaily(); });
g('btn-next').addEventListener('click',  () => { dailyDate = offsetDate(dailyDate,+1); resetHealthKey(); renderDaily(); });
g('btn-today').addEventListener('click', () => { dailyDate = todayStr();               resetHealthKey(); renderDaily(); });

// ログ削除（イベント委譲）
g('log-list').addEventListener('click', e => {
  const btn = e.target.closest('.log-del');
  if (!btn) return;
  confirmDlg('このログを削除しますか？', async () => {
    const type  = btn.dataset.type;
    const logId = btn.dataset.id;
    const ukey  = dailyUser === 1 ? 'son' : 'daughter';
    const day   = getDayData(ukey, dailyDate);
    const base  = `users/${ukey}/daily/${dailyDate}`;

    if (type === 'point') {
      const log = day.point_logs?.[logId];
      if (!log) return;
      const p = log.points_added|0, t = log.time_added|0;
      const sid = String(log.item_id || 0);
      const st  = day.item_states?.[sid];
      const newSt = st ? {
        press_count: Math.max(0, (st.press_count||0) - 1),
        point_count: Math.max(0, (st.point_count||0) - (p !== 0 ? 1 : 0)),
        time_count:  Math.max(0, (st.time_count ||0) - (t !== 0 ? 1 : 0)),
      } : null;

      const mm = log.money_added|0;
      // 1. ローカル先行更新
      day.total_points       = (day.total_points||0)      - p;
      day.total_time_minutes = (day.total_time_minutes||0) - t;
      day.total_money        = (day.total_money||0)        - mm;
      delete day.point_logs[logId];
      if (newSt && newSt.press_count === 0) delete day.item_states[sid];
      else if (newSt) day.item_states[sid] = newSt;

      // 2. 画面更新
      renderDaily();
      toast('削除しました');

      // 3. Firebase（バックグラウンド）
      const fbUpdates = {
        total_points:      day.total_points,
        total_time_minutes:day.total_time_minutes,
        [`point_logs/${logId}`]: null,
      };
      fbUpdates.total_money = day.total_money;
      if (newSt && newSt.press_count === 0) fbUpdates[`item_states/${sid}`] = null;
      else if (newSt) fbUpdates[`item_states/${sid}`] = newSt;
      dbUpdate(base, fbUpdates).catch(e => { console.error('delete log error:', e); toast('削除保存エラー','ng'); });

    } else {
      const log = day.manual_logs?.[logId];
      if (!log) return;

      // 1. ローカル先行更新
      day.total_points       = (day.total_points||0)      - (log.points||0);
      day.total_time_minutes = (day.total_time_minutes||0) - (log.time_minutes||0);
      day.total_money        = (day.total_money||0)        - (log.money||0);
      delete day.manual_logs[logId];

      // 2. 画面更新
      renderDaily();
      toast('削除しました');

      // 3. Firebase（バックグラウンド）
      dbUpdate(base, {
        total_points:      day.total_points,
        total_time_minutes:day.total_time_minutes,
        total_money:       day.total_money,
        [`manual_logs/${logId}`]: null,
      }).catch(e => { console.error('delete manual error:', e); toast('削除保存エラー','ng'); });
    }
  });
});

// ログインUIのイベントリスナー（module読み込み完了後に確実に登録）
const loginBtn   = g('login-btn');
const loginEmail = g('login-email');
const loginPass  = g('login-pass');

if (loginBtn)   loginBtn.addEventListener('click', window.doLogin);
if (loginEmail) loginEmail.addEventListener('keydown', e => { if (e.key === 'Enter') window.doLogin(); });
if (loginPass)  loginPass.addEventListener('keydown',  e => { if (e.key === 'Enter') window.doLogin(); });

// Firebase + Auth 起動（認証後に goView('home') が呼ばれる）
initFirebase();
