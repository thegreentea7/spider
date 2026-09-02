import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  addDoc, collection, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB4EjMAMRx3P0yT3YKhD7YV06rPfZSCtkQ",
  authDomain: "gidle-era-2048.firebaseapp.com",
  projectId: "gidle-era-2048",
  storageBucket: "gidle-era-2048.firebasestorage.app",
  messagingSenderId: "46039691868",
  appId: "1:46039691868:web:57a70a827c408e50a5ec99",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();
const accountButton = document.getElementById("cloudAccountBtn");
const leaderboardButton = document.getElementById("leaderboardBtn");
const PENDING_RESULT_KEY = "miyeonSpiderPendingCloudResultV1";
let currentUser = null;
let context = {
  difficulty: localStorage.getItem("miyeonSpiderDifficulty") || "medium",
  gameKind: "random",
  dailyDateKey: todayKey(),
  ...(window.MiyeonSpiderContext || {}),
};
let activeBoard = { gameKind: "random", difficulty: "easy", dailyDate: todayKey() };
let leaderboardRequest = 0;
let dailyBoardDifficulty = "easy";
let dailyBoardRequest = 0;
let leaderboardCategory = "all";
let gameSessionPromise = null;

/* GitHub Pages has no server-side /api routes, so these calls use Firestore directly. */
const nativeFetch = window.fetch.bind(window);
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{"content-type":"application/json; charset=utf-8"}});
const safePart = value => String(value || "none").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
const scoreKey = value => [value.gameKind,value.difficulty,value.dailyDate||"all",value.category,value.userId].map(safePart).join("__");
const scoreCategory = value => value.autoCompleted ? "auto" : ((+value.hints || +value.undos) ? "assisted" : "clean");
const parseBody = async init => { try { return JSON.parse(init?.body || "{}"); } catch { return {}; } };
const stampToIso = value => value?.toDate?.().toISOString?.() || new Date().toISOString();
const emptyDailyCloud = () => ({version:1,days:{},trophies:{}});
function mergeDailyCloud(base,incoming){
  const result=emptyDailyCloud();
  for(const source of [base,incoming]){
    for(const [dateKey,item] of Object.entries(source?.days||{})){
      if(!/^\d{8}$/.test(dateKey)||!item?.completed)continue;
      const current=result.days[dateKey],candidate={...item,completed:true};
      if(!current||(+candidate.bestMoves||Infinity)<(+current.bestMoves||Infinity))result.days[dateKey]=candidate;
      if(current)result.days[dateKey].plays=Math.max(+current.plays||1,+candidate.plays||1);
    }
    Object.assign(result.trophies,source?.trophies||{});
  }
  return result;
}
function dailyProgressFromScores(scores){
  const progress=emptyDailyCloud();
  for(const score of scores){
    if(score.userId!==currentUser?.uid||score.gameKind!=="daily"||!/^\d{8}$/.test(score.dailyDate||""))continue;
    const candidate={completed:true,bestTime:+score.seconds||0,bestMoves:+score.moves||0,difficulty:score.difficulty||"medium",plays:1,completedAt:stampToIso(score.updatedAt)};
    const current=progress.days[score.dailyDate];
    if(!current||candidate.bestMoves<current.bestMoves)progress.days[score.dailyDate]=candidate;
  }
  return progress;
}

async function getProfile() {
  if (!currentUser) return jsonResponse({error:"Войдите в аккаунт"},401);
  const snapshot=await getDoc(doc(db,"miyeonSpiderProfiles",currentUser.uid));
  const stored=snapshot.exists()?snapshot.data():{};
  const scores=(await getDocs(collection(db,"miyeonSpiderScores"))).docs.map(item=>item.data());
  return jsonResponse({profile:{...stored,dailyProgress:mergeDailyCloud(stored.dailyProgress,dailyProgressFromScores(scores))}});
}
async function putProfile(init) {
  if (!currentUser) return jsonResponse({error:"Войдите в аккаунт"},401);
  const value=await parseBody(init),ref=doc(db,"miyeonSpiderProfiles",currentUser.uid),stored=await getDoc(ref),existing=stored.exists()?stored.data():{};
  const profile={progress:value.progress||{},dailyProgress:mergeDailyCloud(existing.dailyProgress,value.dailyProgress),xp:+value.xp||0,level:+value.level||1,frameId:value.frameId||"classic",playerName:cleanName(value.playerName)||"Игрок",userId:currentUser.uid,updatedAt:serverTimestamp()};
  await setDoc(ref,profile,{merge:true});
  return jsonResponse({ok:true,profile});
}
async function readScores(search) {
  const filters={gameKind:search.get("gameKind")||"random",difficulty:search.get("difficulty")||"easy",category:search.get("category")||"all",dailyDate:search.get("dailyDate")||""};
  const all=(await getDocs(collection(db,"miyeonSpiderScores"))).docs.map(item=>item.data());
  const kindMatches=item=>filters.gameKind==="random"?["random","daily"].includes(item.gameKind):item.gameKind===filters.gameKind;
  const matching=all.filter(item=>kindMatches(item)&&item.difficulty===filters.difficulty&&(filters.category==="all"||item.category===filters.category)&&(filters.gameKind==="random"||item.dailyDate===filters.dailyDate)).sort((a,b)=>(+a.moves||999999)-(+b.moves||999999)||String(a.playerName).localeCompare(String(b.playerName),"ru"));
  const seenUsers=new Set();
  const entries=matching.filter(item=>{
    if(seenUsers.has(item.userId))return false;
    seenUsers.add(item.userId);
    return true;
  }).sort((a,b)=>Number(a.moves)-Number(b.moves)||String(a.playerName).localeCompare(String(b.playerName),"ru")).slice(0,100);
  const rank=currentUser?entries.findIndex(item=>item.userId===currentUser.uid)+1:0;
  const attempts=currentUser?all.filter(item=>item.userId===currentUser.uid&&kindMatches(item)&&item.difficulty===filters.difficulty&&(filters.gameKind==="random"||item.dailyDate===filters.dailyDate)).map(item=>({...item,createdAt:stampToIso(item.updatedAt)})).sort((a,b)=>+a.moves-+b.moves):[];
  return jsonResponse({entries,participants:entries.length,rank:rank||null,attempts});
}
async function writeScore(init) {
  if (!currentUser) return jsonResponse({error:"Войдите в аккаунт"},401);
  const value=await parseBody(init),category=scoreCategory(value);
  const normalized={userId:currentUser.uid,playerName:cleanName(value.playerName)||"Игрок",gameKind:["daily","weekly"].includes(value.gameKind)?value.gameKind:"random",difficulty:["easy","medium","hard"].includes(value.difficulty)?value.difficulty:"easy",dailyDate:value.dailyDate||"",category,moves:Math.max(1,+value.moves||0),seconds:Math.max(0,+value.seconds||0),hints:+value.hints||0,undos:+value.undos||0,frameId:"classic",level:1,updatedAt:serverTimestamp()};
  const profile=await getDoc(doc(db,"miyeonSpiderProfiles",currentUser.uid));
  if(profile.exists()){normalized.frameId=profile.data().frameId||"classic";normalized.level=+profile.data().level||1}
  const ref=doc(db,"miyeonSpiderScores",scoreKey(normalized)),previous=await getDoc(ref),previousMoves=previous.exists()?+previous.data().moves:Infinity;
  if(normalized.moves<previousMoves)await setDoc(ref,normalized);
  const board=await (await readScores(new URLSearchParams({gameKind:normalized.gameKind,difficulty:normalized.difficulty,dailyDate:normalized.dailyDate,category}))).json();
  return jsonResponse({ok:true,saved:normalized.moves<previousMoves,rank:board.rank});
}
async function dailyStats(search,init) {
  if((init?.method||"GET").toUpperCase()==="POST"){
    const value=await parseBody(init);
    await addDoc(collection(db,"miyeonSpiderDailyEvents"),{event:value.event==="win"?"win":"start",dailyDate:value.dailyDate||"",difficulty:value.difficulty||"easy",moves:+value.moves||0,userId:currentUser?.uid||"guest",createdAt:serverTimestamp()});
    return jsonResponse({ok:true});
  }
  const dailyDate=search.get("dailyDate")||"",difficulty=search.get("difficulty")||"easy";
  const events=(await getDocs(collection(db,"miyeonSpiderDailyEvents"))).docs.map(item=>item.data()).filter(item=>item.dailyDate===dailyDate&&item.difficulty===difficulty);
  const board=await (await readScores(new URLSearchParams({gameKind:"daily",difficulty,dailyDate,category:"all"}))).json();
  const wins=events.filter(item=>item.event==="win"),moves=wins.map(item=>+item.moves||0).filter(Boolean).sort((a,b)=>a-b);
  const averageMoves=moves.length?Math.round(moves.reduce((sum,move)=>sum+move,0)/moves.length):null,medianMoves=moves.length?moves[Math.floor((moves.length-1)/2)]:null,plays=events.filter(item=>item.event==="start").length;
  return jsonResponse({entries:board.entries,stats:{plays,wins:wins.length,winRate:plays?Math.round(wins.length/plays*100):0,averageMoves,medianMoves,cleanRate:wins.length?Math.round(board.entries.length/wins.length*100):0}});
}
window.fetch=async(input,init={})=>{
  const raw=typeof input==="string"?input:input?.url;if(!raw)return nativeFetch(input,init);
  const url=new URL(raw,window.location.href);if(!url.pathname.startsWith("/api/"))return nativeFetch(input,init);
  try{
    if(url.pathname==="/api/progress")return(init.method||"GET").toUpperCase()==="PUT"?putProfile(init):getProfile();
    if(url.pathname==="/api/game-session")return jsonResponse({sessionId:crypto.randomUUID?.()||String(Date.now())});
    if(url.pathname==="/api/leaderboard")return(init.method||"GET").toUpperCase()==="POST"?writeScore(init):readScores(url.searchParams);
    if(url.pathname==="/api/daily-stats")return dailyStats(url.searchParams,init);
    return jsonResponse({error:"Неизвестный запрос"},404);
  }catch(error){console.error("Firebase sync error",error);return jsonResponse({error:"Не удалось синхронизировать данные"},503)}
};

const layer = document.createElement("div");
layer.className = "cloud-layer";
layer.innerHTML = `
  <section class="cloud-panel" role="dialog" aria-modal="true" aria-labelledby="cloudTitle">
    <header class="cloud-head">
      <div><span class="cloud-kicker">MIYEON SPIDER</span><h2 id="cloudTitle"></h2><p id="cloudSubtitle"></p></div>
      <button class="btn cloud-close" type="button" aria-label="Закрыть">×</button>
    </header>
    <div class="cloud-body"></div>
  </section>
`;
document.body.appendChild(layer);

const title = layer.querySelector("#cloudTitle");
const subtitle = layer.querySelector("#cloudSubtitle");
const body = layer.querySelector(".cloud-body");
layer.querySelector(".cloud-close").addEventListener("click", closeLayer);
layer.addEventListener("mousedown", (event) => { if (event.target === layer) closeLayer(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && layer.classList.contains("show")) closeLayer(); });

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function keyToInput(value) {
  const key = /^\d{8}$/.test(value || "") ? value : todayKey();
  return `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;
}

function cleanName(value) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24); }
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = String(value || ""); return node.innerHTML; }

function openLayer() { layer.classList.add("show"); }
function closeLayer() { layer.classList.remove("show"); }
function setMessage(message, error = false) {
  const node = layer.querySelector(".cloud-message");
  if (!node) return;
  node.textContent = message;
  node.style.color = error ? "#b53f59" : "";
}

function authErrorMessage(error) {
  const code = String(error?.code || "");
  if (code.includes("invalid-email")) return "Проверь email.";
  if (code.includes("missing-password") || code.includes("weak-password")) return "Пароль должен содержать не менее 6 символов.";
  if (code.includes("email-already-in-use")) return "Аккаунт с таким email уже существует.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Неверный email или пароль.";
  if (code.includes("popup-closed")) return "Окно входа было закрыто.";
  if (code.includes("popup-blocked")) return "Браузер заблокировал окно Google.";
  if (code.includes("unauthorized-domain")) return "Этот адрес нужно добавить в разрешённые домены Firebase.";
  if (code.includes("network-request-failed")) return "Не удалось подключиться. Проверь интернет или VPN.";
  return "Не удалось выполнить вход.";
}

async function runAuth(action) {
  setMessage("Подождите…");
  try {
    await action();
    setMessage("Вход выполнен");
  } catch (error) {
    setMessage(authErrorMessage(error), true);
  }
}

function renderAccount() {
  title.textContent = currentUser ? "Профиль игрока" : "Войти в игру";
  subtitle.textContent = currentUser
    ? "Почта нигде не показывается. В рейтинге видно только игровое имя."
    : "Войди, чтобы сохранять прогресс, достижения и результаты на разных устройствах.";

  if (!currentUser) {
    body.innerHTML = `
      <div class="cloud-auth">
        <button class="btn cloud-google" type="button" data-google>G · Войти через Google</button>
        <div class="cloud-divider"><span>ИЛИ</span></div>
        <label>EMAIL<input type="email" autocomplete="email" data-email placeholder="name@example.com"></label>
        <label>ПАРОЛЬ<input type="password" autocomplete="current-password" data-password placeholder="Не менее 6 символов"></label>
        <div class="cloud-auth-actions"><button class="btn primary" type="button" data-login>Войти</button><button class="btn" type="button" data-register>Создать аккаунт</button></div>
        <p class="cloud-message" role="status"></p>
      </div>`;
    const email = body.querySelector("[data-email]");
    const password = body.querySelector("[data-password]");
    body.querySelector("[data-google]").addEventListener("click", () => runAuth(() => signInWithPopup(auth, googleProvider)));
    body.querySelector("[data-login]").addEventListener("click", () => runAuth(() => signInWithEmailAndPassword(auth, email.value.trim(), password.value)));
    body.querySelector("[data-register]").addEventListener("click", () => runAuth(() => createUserWithEmailAndPassword(auth, email.value.trim(), password.value)));
    return;
  }

  body.innerHTML = `
    <div class="profile-card">
      <div class="public-profile-card" data-public-profile><span>Загружаем профиль…</span></div>
      <strong>${escapeHtml(currentUser.displayName || "Игрок")}</strong>
      <p>${escapeHtml(currentUser.email || "")}</p>
      <label class="profile-name">ИМЯ В РЕЙТИНГЕ<input type="text" maxlength="24" data-player-name value="${escapeHtml(currentUser.displayName || "")}" placeholder="Например, Neverland7"></label>
      <div class="profile-actions"><button class="btn primary" type="button" data-save-name>Сохранить имя</button><button class="btn" type="button" data-sign-out>Выйти</button></div>
      <p class="cloud-message" role="status"></p>
    </div>`;
  loadPublicProfile();
  body.querySelector("[data-save-name]").addEventListener("click", async () => {
    const name = cleanName(body.querySelector("[data-player-name]").value);
    if (name.length < 2) { setMessage("Имя должно содержать минимум 2 символа.", true); return; }
    setMessage("Сохраняем…");
    try {
      await updateProfile(currentUser, { displayName: name });
      await currentUser.reload();
      currentUser = auth.currentUser;
      updateAccountButton();
      setMessage("Имя сохранено");
      await publishPendingResult();
    } catch { setMessage("Не удалось сохранить имя.", true); }
  });
  body.querySelector("[data-sign-out]").addEventListener("click", async () => { await signOut(auth); closeLayer(); });
}

async function loadPublicProfile() {
  const node=body.querySelector("[data-public-profile]"); if(!node||!currentUser)return;
  try {
    const response=await fetch("/api/progress",{headers:{authorization:`Bearer ${await currentUser.getIdToken()}`}});
    const json=await response.json(),p=json.profile||{},progress=p.progress||{},wins=(progress.history||[]).filter(x=>x.won);
    const favorite=["easy","medium","hard"].sort((a,b)=>wins.filter(x=>x.difficulty===b).length-wins.filter(x=>x.difficulty===a).length)[0]||"easy";
    node.className=`public-profile-card frame-${p.frameId||"classic"}`;
    node.innerHTML=`<div class="profile-avatar">${Number(p.level)||1}</div><div><b>${escapeHtml(currentUser.displayName||"Игрок")}</b><span>Уровень ${Number(p.level)||1} · ${Number(p.xp)||0} XP</span><small>${wins.length} побед · любимый режим: ${favorite==="hard"?"сложный":favorite==="medium"?"средний":"лёгкий"}</small></div>`;
  } catch { node.innerHTML="<span>Профиль появится после первой синхронизации</span>"; }
}

async function createGameSession(detail) {
  if(!currentUser||detail.gameKind==="code")return "";
  const gameKind=["daily","weekly"].includes(detail.gameKind)?detail.gameKind:"random";
  const response=await fetch("/api/game-session",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${await currentUser.getIdToken()}`},body:JSON.stringify({...detail,gameKind})});
  if(!response.ok)return "";
  return (await response.json()).sessionId||"";
}

function updateAccountButton() {
  if (!accountButton) return;
  accountButton.dataset.signedIn = currentUser ? "true" : "false";
  accountButton.textContent = currentUser ? `● ${cleanName(currentUser.displayName) || "Профиль"}` : "Войти";
}

function boardTabs() {
  return [
    ["random", "easy", "Лёгкий"], ["random", "medium", "Средний"], ["random", "hard", "Сложный"],
  ].map(([kind, difficulty, label]) => {
    const active = kind === activeBoard.gameKind && difficulty === activeBoard.difficulty;
    return `<button class="btn${active ? " active" : ""}" type="button" data-kind="${kind}" data-difficulty="${difficulty}">${label}</button>`;
  }).join("");
}

function renderLeaderboardShell() {
  title.textContent = "Таблица лидеров";
  subtitle.textContent = "Учитываются обычные и ежедневные раскладки. Места определяются только по количеству ходов.";
  body.innerHTML = `
    <div class="board-tabs" role="tablist">${boardTabs()}</div>
    <div class="leaderboard-table"><div class="board-empty"><strong>Загружаем результаты…</strong></div></div>
    <p class="cloud-message" role="status"></p>
    <div class="profile-actions"><button class="btn primary" type="button" data-board-account>${currentUser ? "Имя и профиль" : "Войти в игру"}</button><button class="btn" type="button" data-refresh>Обновить</button></div>`;
  body.querySelector(".board-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-kind]");
    if (!tab) return;
    activeBoard.gameKind = tab.dataset.kind;
    activeBoard.difficulty = tab.dataset.difficulty;
    renderLeaderboardShell();
    loadLeaderboard();
  });
  body.querySelector("[data-board-account]").addEventListener("click", renderAccount);
  body.querySelector("[data-refresh]").addEventListener("click", loadLeaderboard);
}

async function loadLeaderboard() {
  const table = body.querySelector(".leaderboard-table");
  if (!table) return;
  const requestId = ++leaderboardRequest;
  table.innerHTML = `<div class="board-empty"><strong>Загружаем результаты…</strong></div>`;
  const params = new URLSearchParams({ gameKind: activeBoard.gameKind, difficulty: activeBoard.difficulty, category: leaderboardCategory });
  if (activeBoard.gameKind === "daily") params.set("dailyDate", activeBoard.dailyDate);
  try {
    const response = await fetch(`/api/leaderboard?${params}`, {headers: currentUser ? {authorization:`Bearer ${await currentUser.getIdToken()}`} : {}});
    const data = await response.json();
    if (requestId !== leaderboardRequest || !table.isConnected) return;
    if (!response.ok) throw new Error(data.error || "load-failed");
    const entries = Array.isArray(data.entries) ? data.entries : [];
    if (!entries.length) {
      table.innerHTML = `<div class="board-empty"><strong>Рейтинг пока пуст</strong><span>Первый победный результат появится здесь.</span></div>`;
      return;
    }
    table.innerHTML = `<div class="board-head"><span>Место</span><span>Игрок</span><span>Ходы</span></div>${entries.map((entry, index) => `
      <div class="board-row${entry.userId === currentUser?.uid ? " own" : ""}">
        <span class="board-rank">${index + 1}</span>
        <span class="board-player frame-${escapeHtml(entry.frameId || "classic")}">${escapeHtml(entry.playerName || "Игрок")} <em>ур. ${Number(entry.level)||1}</em>${entry.userId === currentUser?.uid ? "<small>ВЫ</small>" : ""}</span>
        <span class="board-moves">${Number(entry.moves) || 0}</span>
      </div>`).join("")}`;
  } catch {
    if (requestId !== leaderboardRequest || !table.isConnected) return;
    table.innerHTML = `<div class="board-empty"><strong>Не удалось загрузить рейтинг</strong><span>Попробуй обновить ещё раз.</span></div>`;
  }
}

function openLeaderboard() {
  activeBoard = {
    gameKind: "random",
    difficulty: context.difficulty || "medium",
    dailyDate: context.dailyDateKey || todayKey(),
  };
  renderLeaderboardShell();
  openLayer();
  loadLeaderboard();
}

async function publishResult(result) {
  if (!currentUser || cleanName(currentUser.displayName).length < 2) return false;
  const gameKind = ["daily", "weekly"].includes(result.gameKind) ? result.gameKind : "random";
  const sessionId = await gameSessionPromise;
  const response = await fetch("/api/leaderboard", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await currentUser.getIdToken()}` },
    body: JSON.stringify({
      difficulty: result.difficulty,
      gameKind,
      dailyDate: ["daily", "weekly"].includes(gameKind) ? result.dailyDateKey : "",
      seconds: result.seconds,
      moves: result.moves,
      playerName: cleanName(currentUser.displayName),
      hints: result.hints || 0,
      undos: result.undos || 0,
      deals: result.deals || 0,
      firstRunDeal: result.firstRunDeal,
      autoCompleted: Boolean(result.autoCompleted),
      sessionId,
    }),
  });
  const saved=await response.json();
  if (!response.ok) throw new Error(saved.error || "save-failed");
  window.dispatchEvent(new CustomEvent("miyeon-spider-score-saved",{detail:{...saved,gameKind,dailyDate:result.dailyDateKey||"",difficulty:result.difficulty}}));
  return true;
}

async function publishPendingResult() {
  if (!currentUser || cleanName(currentUser.displayName).length < 2) return;
  const raw = localStorage.getItem(PENDING_RESULT_KEY);
  if (!raw) return;
  try {
    const result = JSON.parse(raw);
    await publishResult(result);
    localStorage.removeItem(PENDING_RESULT_KEY);
  } catch { /* retry on the next sign-in or win */ }
}

function dailyDateLabel(key) {
  if (!/^\d{8}$/.test(key || "")) return "Выбранный день";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${keyToInput(key)}T12:00:00`));
}

async function loadDailyBoard(dateKey = context.dailyDateKey || todayKey()) {
  const panel = document.getElementById("dailyCommunityPanel");
  const table = document.getElementById("dailyCommunityBoard");
  const statsNode = document.getElementById("dailyCommunityStats");
  const titleNode = document.getElementById("dailyCommunityTitle");
  if (!panel || !table || !statsNode || !titleNode || !/^\d{8}$/.test(dateKey)) return;
  panel.querySelectorAll("[data-daily-board-difficulty]").forEach((button) => {
    button.classList.toggle("active", button.dataset.dailyBoardDifficulty === dailyBoardDifficulty);
  });
  const difficultyLabel = dailyBoardDifficulty === "easy" ? "лёгкий" : dailyBoardDifficulty === "hard" ? "сложный" : "средний";
  titleNode.textContent = `${dailyDateLabel(dateKey)} · ${difficultyLabel}`;
  table.innerHTML = `<div class="board-empty"><strong>Загружаем результаты…</strong></div>`;
  statsNode.innerHTML = "";
  const requestId = ++dailyBoardRequest;
  try {
    const params = new URLSearchParams({ dailyDate: dateKey, difficulty: dailyBoardDifficulty });
    const response = await fetch(`/api/daily-stats?${params}`);
    const data = await response.json();
    if (requestId !== dailyBoardRequest) return;
    if (!response.ok) throw new Error(data.error || "load-failed");
    const stats = data.stats || {};
    const entries = Array.isArray(data.entries) ? data.entries : [];
    const best = entries.length ? Number(entries[0].moves) : null;
    statsNode.innerHTML = `
      <div><b>${Number(stats.plays) || 0}</b><span>игр</span></div>
      <div><b>${Number(stats.wins) || 0}</b><span>побед</span></div>
      <div><b>${Number(stats.winRate) || 0}%</b><span>процент побед</span></div>
      <div><b>${best ?? "—"}</b><span>лучший результат</span></div>
      <div><b>${stats.averageMoves ?? "—"}</b><span>среднее ходов</span></div>
      <div><b>${stats.medianMoves ?? "—"}</b><span>медиана ходов</span></div>
      <div><b>${Number(stats.cleanRate) || 0}%</b><span>чистых побед</span></div>`;
    if (!entries.length) {
      table.innerHTML = `<div class="board-empty"><strong>Пока никто не прошёл</strong><span>Первый победитель появится здесь.</span></div>`;
      return;
    }
    table.innerHTML = `<div class="daily-board-head"><span>Место</span><span>Игрок</span><span>Ходы</span></div>${entries.map((entry, index) => `
      <div class="daily-board-row${entry.userId === currentUser?.uid ? " own" : ""}">
        <span class="board-rank">${index + 1}</span>
        <span class="board-player">${escapeHtml(entry.playerName || "Игрок")}${entry.userId === currentUser?.uid ? "<small>ВЫ</small>" : ""}</span>
        <span class="board-moves">${Number(entry.moves) || 0}</span>
      </div>`).join("")}`;
  } catch {
    if (requestId !== dailyBoardRequest) return;
    table.innerHTML = `<div class="board-empty"><strong>Не удалось загрузить статистику</strong><span>Попробуй открыть ежедневные ещё раз.</span></div>`;
  }
}

document.getElementById("dailyCommunityPanel")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-daily-board-difficulty]");
  if (!button) return;
  dailyBoardDifficulty = button.dataset.dailyBoardDifficulty;
  loadDailyBoard(context.dailyDateKey || todayKey());
});

async function recordDailyEvent(event, detail) {
  if (detail.gameKind !== "daily" || !detail.dailyDateKey) return;
  await fetch("/api/daily-stats", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, dailyDate: detail.dailyDateKey, difficulty: detail.difficulty, moves: detail.moves }),
  });
}

accountButton?.addEventListener("click", () => { renderAccount(); openLayer(); });
leaderboardButton?.addEventListener("click", openLeaderboard);
window.addEventListener("miyeon-spider-context", (event) => { context = { ...context, ...event.detail }; });
window.addEventListener("miyeon-spider-daily-selected", (event) => {
  context.dailyDateKey = event.detail.dailyDateKey;
  loadDailyBoard(context.dailyDateKey);
});
window.addEventListener("miyeon-spider-start", (event) => {
  recordDailyEvent("start", event.detail).catch(() => {});
  gameSessionPromise=createGameSession(event.detail);
});
window.addEventListener("miyeon-spider-win", async (event) => {
  const scoreDetail = { ...event.detail };
  delete scoreDetail.replay;
  const result = { ...scoreDetail, gameKind: ["daily", "weekly"].includes(event.detail.gameKind) ? event.detail.gameKind : "random" };
  if (event.detail.gameKind === "code") return;
  recordDailyEvent("win", event.detail).catch(() => {});
  localStorage.setItem(PENDING_RESULT_KEY, JSON.stringify(result));
  try {
    if (await publishResult(result)) localStorage.removeItem(PENDING_RESULT_KEY);
  } catch { /* the local result stays queued */ }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  updateAccountButton();
  if (layer.classList.contains("show") && title.textContent !== "Таблица лидеров") renderAccount();
  if (user) await publishPendingResult();
  window.dispatchEvent(new CustomEvent("miyeon-spider-auth", {detail:{signedIn:Boolean(user),uid:user?.uid||""}}));
  if (!user && !localStorage.getItem("miyeonSpiderAccountInviteV1")) {
    localStorage.setItem("miyeonSpiderAccountInviteV1","1");
    renderAccount();
    openLayer();
  }
});

window.MiyeonSpiderCloud = {
  getToken: async () => currentUser ? currentUser.getIdToken() : "",
  getUser: () => currentUser,
};
