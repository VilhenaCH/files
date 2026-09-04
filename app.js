import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, setDoc, getDoc, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ------------------------------------------------------------------
// Firebase
// ------------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const vaultsCol = collection(db, "vaults");

// ------------------------------------------------------------------
// Estado de identidade / cofre (definido depois do fluxo de auth)
// ------------------------------------------------------------------
let boardId = null;
let boardRef = null;
let nodesCol = null;
let edgesCol = null;
let playerName = localStorage.getItem("canvas_player_name") || "";

// ------------------------------------------------------------------
// DOM refs
// ------------------------------------------------------------------
const viewport = document.getElementById("canvas-viewport");
const content = document.getElementById("canvas-content");
const nodesLayer = document.getElementById("nodes-layer");
const edgeLayer = document.getElementById("edge-layer");
const edgesGroup = document.getElementById("edges-group");
const pendingEdgePath = document.getElementById("pending-edge");
const nodeTemplate = document.getElementById("node-template");
const hint = document.getElementById("hint");
const zoomLevelLabel = document.getElementById("zoom-level");
const boardTitleInput = document.getElementById("board-title");
const playerMenuBtn = document.getElementById("player-menu-btn");
const playerMenu = document.getElementById("player-menu");
const playerNameLabel = document.getElementById("player-name-label");
const authOverlay = document.getElementById("auth-overlay");

const panels = {
  lobby: document.getElementById("panel-lobby"),
  create: document.getElementById("panel-create"),
  unlock: document.getElementById("panel-unlock"),
  name: document.getElementById("panel-name"),
};
function showPanel(key) {
  Object.values(panels).forEach((p) => p.classList.add("hidden"));
  panels[key].classList.remove("hidden");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
async function hashPassword(pw) {
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
playerNameLabel.textContent = playerName;
let nameMode = "enter"; // "enter" (primeira entrada) ou "rename" (trocar nome sem sair do cofre)

// ------------------------------------------------------------------
// Fluxo de cofres: lobby -> criar / desbloquear -> nome -> quadro
// ------------------------------------------------------------------
let currentUnlockTarget = null;

init();

async function init() {
  const urlBoard = new URL(location.href).searchParams.get("board");
  if (urlBoard) {
    await tryEnterVault(urlBoard);
  } else {
    showLobby();
  }
}

async function showLobby() {
  authOverlay.classList.remove("hidden-overlay");
  history.replaceState(null, "", location.pathname);
  showPanel("lobby");
  const list = document.getElementById("vault-list");
  list.innerHTML = '<div class="vault-loading">Carregando cofres…</div>';
  try {
    const snap = await getDocs(vaultsCol);
    if (snap.empty) {
      list.innerHTML = '<div class="vault-empty">Nenhum cofre criado ainda. Crie o primeiro!</div>';
      return;
    }
    list.innerHTML = "";
    snap.forEach((d) => {
      const data = d.data();
      const row = document.createElement("button");
      row.className = "vault-row";
      row.innerHTML = `<span class="vault-row-name">${escapeHtml(data.name || "Sem nome")}</span><span class="vault-row-arrow">›</span>`;
      row.onclick = () => tryEnterVault(d.id);
      list.appendChild(row);
    });
  } catch (err) {
    list.innerHTML = '<div class="vault-empty">Não foi possível carregar os cofres. Confira o firebase-config.js e as regras do Firestore.</div>';
    console.error(err);
  }
}

async function tryEnterVault(id) {
  let snap;
  try {
    snap = await getDoc(doc(db, "vaults", id));
  } catch (err) {
    console.error(err);
    showLobby();
    return;
  }
  if (!snap.exists()) {
    finalizeBoard(id, null);
    return;
  }
  const data = snap.data();
  if (localStorage.getItem("vault_unlocked_" + id)) {
    finalizeBoard(id, data.name);
    return;
  }
  currentUnlockTarget = { id, data };
  document.getElementById("unlock-vault-name").textContent = data.name || "Cofre protegido";
  document.getElementById("unlock-error").textContent = "";
  document.getElementById("unlock-password").value = "";
  showPanel("unlock");
}

document.getElementById("unlock-submit").onclick = async () => {
  const pw = document.getElementById("unlock-password").value;
  const errEl = document.getElementById("unlock-error");
  if (!pw) { errEl.textContent = "Digite a senha."; return; }
  const hash = await hashPassword(pw);
  if (hash === currentUnlockTarget.data.passwordHash) {
    localStorage.setItem("vault_unlocked_" + currentUnlockTarget.id, "1");
    finalizeBoard(currentUnlockTarget.id, currentUnlockTarget.data.name);
  } else {
    errEl.textContent = "Senha incorreta.";
  }
};
document.getElementById("unlock-password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("unlock-submit").click();
});
document.getElementById("unlock-back").onclick = showLobby;

document.getElementById("show-create-btn").onclick = () => {
  document.getElementById("create-name").value = "";
  document.getElementById("create-password").value = "";
  document.getElementById("create-error").textContent = "";
  showPanel("create");
};
document.getElementById("create-back").onclick = showLobby;
document.getElementById("create-submit").onclick = async () => {
  const name = document.getElementById("create-name").value.trim();
  const pw = document.getElementById("create-password").value;
  const errEl = document.getElementById("create-error");
  if (!name) { errEl.textContent = "Dê um nome ao cofre."; return; }
  if (!pw || pw.length < 4) { errEl.textContent = "Escolha uma senha com pelo menos 4 caracteres."; return; }
  errEl.textContent = "";
  const id = Math.random().toString(36).slice(2, 8);
  const passwordHash = await hashPassword(pw);
  try {
    await setDoc(doc(db, "vaults", id), { name, passwordHash, createdAt: Date.now() });
  } catch (err) {
    errEl.textContent = "Não foi possível criar o cofre. Confira a configuração do Firebase.";
    console.error(err);
    return;
  }
  localStorage.setItem("vault_unlocked_" + id, "1");
  finalizeBoard(id, name);
};

function finalizeBoard(id, vaultName) {
  boardId = id;
  boardRef = doc(db, "boards", id);
  nodesCol = collection(db, "boards", id, "nodes");
  edgesCol = collection(db, "boards", id, "edges");

  const u = new URL(location.href);
  u.searchParams.set("board", id);
  history.replaceState(null, "", u.toString());

  if (vaultName) boardTitleInput.placeholder = vaultName;

  if (playerName) {
    enterBoard();
  } else {
    nameMode = "enter";
    panels.name.querySelector("h1").textContent = "Entrar no quadro";
    panels.name.querySelector("p").textContent = "Como você quer aparecer para o resto da mesa?";
    showPanel("name");
    document.getElementById("name-input").focus();
  }
}

document.getElementById("name-submit").onclick = submitName;
document.getElementById("name-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitName();
});
function submitName() {
  const v = document.getElementById("name-input").value.trim();
  if (!v) return;
  playerName = v;
  localStorage.setItem("canvas_player_name", v);
  playerNameLabel.textContent = playerName;
  if (nameMode === "rename") {
    authOverlay.classList.add("hidden-overlay");
  } else {
    enterBoard();
  }
}

function enterBoard() {
  authOverlay.classList.add("hidden-overlay");
  playerNameLabel.textContent = playerName;
  getDoc(boardRef).then((snap) => {
    if (snap.exists() && snap.data().title) boardTitleInput.value = snap.data().title;
  });
  subscribeNodes();
  subscribeEdges();
}

// ------------------------------------------------------------------
// Menu do jogador: mudar nome / trocar de cofre (sem recarregar a página)
// ------------------------------------------------------------------
playerMenuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  playerMenu.classList.toggle("open");
});
document.addEventListener("click", () => playerMenu.classList.remove("open"));

document.getElementById("rename-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  playerMenu.classList.remove("open");
  nameMode = "rename";
  panels.name.querySelector("h1").textContent = "Mudar nome";
  panels.name.querySelector("p").textContent = "Como você quer ser chamado agora?";
  document.getElementById("name-input").value = playerName;
  authOverlay.classList.remove("hidden-overlay");
  showPanel("name");
  document.getElementById("name-input").focus();
});

document.getElementById("switch-vault-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  playerMenu.classList.remove("open");
  resetBoardState();
  authOverlay.classList.remove("hidden-overlay");
  showLobby();
});

function resetBoardState() {
  if (unsubNodes) { unsubNodes(); unsubNodes = null; }
  if (unsubEdges) { unsubEdges(); unsubEdges = null; }
  nodesLayer.innerHTML = "";
  edgesGroup.innerHTML = "";
  nodeEls.clear();
  nodeData.clear();
  edgeEls.clear();
  edgeData.clear();
  boardId = null;
  boardRef = null;
  nodesCol = null;
  edgesCol = null;
  boardTitleInput.value = "";
  boardTitleInput.placeholder = "Quadro de Investigação";
}

document.getElementById("share-btn").onclick = async (e) => {
  await navigator.clipboard.writeText(location.href);
  e.target.classList.add("copied");
  e.target.textContent = "Link copiado!";
  setTimeout(() => { e.target.classList.remove("copied"); e.target.textContent = "Copiar link"; }, 1500);
};

let titleTimer;
boardTitleInput.addEventListener("input", () => {
  if (!boardRef) return;
  clearTimeout(titleTimer);
  titleTimer = setTimeout(() => {
    setDoc(boardRef, { title: boardTitleInput.value }, { merge: true });
  }, 400);
});

// ------------------------------------------------------------------
// Viewport state (pan & zoom) — mouse, trackpad e toque (com pinça)
// ------------------------------------------------------------------
const view = { x: 400, y: 250, scale: 1 };
const MIN_SCALE = 0.15, MAX_SCALE = 2.5;

function applyTransform() {
  content.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  zoomLevelLabel.textContent = Math.round(view.scale * 100) + "%";
}
function screenToCanvas(clientX, clientY) {
  const r = viewport.getBoundingClientRect();
  return {
    x: (clientX - r.left - view.x) / view.scale,
    y: (clientY - r.top - view.y) / view.scale
  };
}
function zoomAt(clientX, clientY, factor) {
  const before = screenToCanvas(clientX, clientY);
  view.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const r = viewport.getBoundingClientRect();
  view.x = clientX - r.left - before.x * view.scale;
  view.y = clientY - r.top - before.y * view.scale;
  applyTransform();
}
applyTransform();

// --- Zoom com scroll/trackpad (desktop) ---
viewport.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    const factor = Math.exp(-e.deltaY * 0.01);
    zoomAt(e.clientX, e.clientY, factor);
  } else {
    view.x -= e.deltaX;
    view.y -= e.deltaY;
    applyTransform();
  }
}, { passive: false });

document.getElementById("zoom-in").onclick = () => {
  const r = viewport.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2);
};
document.getElementById("zoom-out").onclick = () => {
  const r = viewport.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2);
};
document.getElementById("zoom-reset").onclick = () => {
  view.x = 400; view.y = 250; view.scale = 1; applyTransform();
};

// --- Pan (mouse/toque) + pinça (toque com 2 dedos) ---
function isBackgroundTarget(t) {
  return t === viewport || t === content || t === edgeLayer || t === nodesLayer;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

const activePointers = new Map();
let panState = null;
let pinchState = null;

viewport.addEventListener("pointerdown", (e) => {
  if (!isBackgroundTarget(e.target)) return;
  if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;

  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  viewport.setPointerCapture(e.pointerId);
  hint.classList.add("hide");

  if (activePointers.size === 1) {
    panState = { startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y };
    pinchState = null;
    viewport.classList.add("panning");
  } else if (activePointers.size === 2) {
    panState = null;
    const pts = [...activePointers.values()];
    pinchState = {
      startDist: dist(pts[0], pts[1]) || 1,
      startMid: mid(pts[0], pts[1]),
      startScale: view.scale,
      startVX: view.x,
      startVY: view.y,
    };
  }
});

viewport.addEventListener("pointermove", (e) => {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size >= 2 && pinchState) {
    const pts = [...activePointers.values()];
    const d = dist(pts[0], pts[1]) || 1;
    const m = mid(pts[0], pts[1]);
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchState.startScale * (d / pinchState.startDist)));
    const r = viewport.getBoundingClientRect();
    const worldX = (pinchState.startMid.x - r.left - pinchState.startVX) / pinchState.startScale;
    const worldY = (pinchState.startMid.y - r.top - pinchState.startVY) / pinchState.startScale;
    view.scale = newScale;
    view.x = m.x - r.left - worldX * newScale;
    view.y = m.y - r.top - worldY * newScale;
    applyTransform();
  } else if (activePointers.size === 1 && panState) {
    view.x = panState.vx + (e.clientX - panState.startX);
    view.y = panState.vy + (e.clientY - panState.startY);
    applyTransform();
  }
});

function endPointer(e) {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinchState = null;
  if (activePointers.size === 1) {
    const [remaining] = activePointers.values();
    panState = { startX: remaining.x, startY: remaining.y, vx: view.x, vy: view.y };
  } else if (activePointers.size === 0) {
    panState = null;
    viewport.classList.remove("panning");
  }
}
viewport.addEventListener("pointerup", endPointer);
viewport.addEventListener("pointercancel", endPointer);

// duplo clique / duplo toque no vazio -> criar card
viewport.addEventListener("dblclick", (e) => {
  if (!isBackgroundTarget(e.target)) return;
  const p = screenToCanvas(e.clientX, e.clientY);
  createTextNode(p.x - 110, p.y - 45);
});
document.getElementById("fab-add").onclick = () => {
  const r = viewport.getBoundingClientRect();
  const p = screenToCanvas(r.left + r.width / 2, r.top + r.height / 2);
  createTextNode(p.x - 110, p.y - 45);
};

// ------------------------------------------------------------------
// Nodes: local state + rendering
// ------------------------------------------------------------------
const nodeEls = new Map();
const nodeData = new Map();
const suppressRemote = new Set();
let unsubNodes = null;

function createTextNode(x, y) {
  addDoc(nodesCol, {
    type: "text", x, y, width: 220, height: 120, color: 0,
    text: "", createdBy: playerName, updatedAt: Date.now()
  });
}
async function createImageNode(x, y, dataUrl) {
  await addDoc(nodesCol, {
    type: "image", x, y, width: 220, height: 220, color: 0,
    imageUrl: dataUrl, createdBy: playerName, updatedAt: Date.now()
  });
}

function subscribeNodes() {
  unsubNodes = onSnapshot(nodesCol, (snap) => {
    snap.docChanges().forEach((change) => {
      const id = change.doc.id;
      if (change.type === "removed") {
        nodeEls.get(id)?.remove();
        nodeEls.delete(id);
        nodeData.delete(id);
        renderAllEdges();
        return;
      }
      const data = change.doc.data();
      nodeData.set(id, data);
      if (suppressRemote.has(id)) return;
      let el = nodeEls.get(id);
      if (!el) {
        el = buildNodeEl(id);
        nodesLayer.appendChild(el);
        nodeEls.set(id, el);
      }
      paintNode(el, data);
    });
    renderAllEdges();
  });
}

function buildNodeEl(id) {
  const el = nodeTemplate.content.firstElementChild.cloneNode(true);
  el.dataset.id = id;

  const bar = el.querySelector(".node-bar");
  const colorToggle = el.querySelector(".node-color-toggle");
  const colorMenu = el.querySelector(".color-menu");
  const delBtn = el.querySelector(".node-delete");
  const textEl = el.querySelector(".node-text");
  const connectHandle = el.querySelector(".connect-handle");
  const resizeHandle = el.querySelector(".resize-handle");

  textEl.dataset.placeholder = "Escreva algo…";

  bar.addEventListener("pointerdown", (e) => startDragNode(e, id, el));

  // impede que o pointerdown desses controles borbulhe até a barra
  // (senão o navegador entende como "começou a arrastar o card")
  colorToggle.addEventListener("pointerdown", (e) => e.stopPropagation());
  delBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
  colorMenu.addEventListener("pointerdown", (e) => e.stopPropagation());

  colorToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".color-menu.open").forEach((m) => { if (m !== colorMenu) m.classList.remove("open"); });
    colorMenu.classList.toggle("open");
  });
  colorMenu.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const c = Number(btn.dataset.color);
      el.dataset.color = c;
      colorMenu.classList.remove("open");
      updateDoc(doc(nodesCol, id), { color: c });
    });
  });
  document.addEventListener("click", () => colorMenu.classList.remove("open"));

  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm("Excluir este card?")) {
      deleteDoc(doc(nodesCol, id));
      edgeData.forEach((ed, eid) => {
        if (ed.fromNode === id || ed.toNode === id) deleteDoc(doc(edgesCol, eid));
      });
    }
  });

  let textTimer;
  textEl.addEventListener("input", () => {
    clearTimeout(textTimer);
    const val = textEl.innerText;
    textTimer = setTimeout(() => updateDoc(doc(nodesCol, id), { text: val }), 350);
  });
  textEl.addEventListener("pointerdown", (e) => e.stopPropagation());

  resizeHandle.addEventListener("pointerdown", (e) => startResizeNode(e, id, el));
  connectHandle.addEventListener("pointerdown", (e) => startConnect(e, id, el));

  return el;
}

function paintNode(el, data) {
  el.style.left = data.x + "px";
  el.style.top = data.y + "px";
  el.style.width = (data.width || 220) + "px";
  el.style.height = (data.height || 140) + "px";
  el.dataset.color = data.color ?? 0;
  el.classList.toggle("is-image", data.type === "image");
  const textEl = el.querySelector(".node-text");
  const imgEl = el.querySelector(".node-image");
  if (data.type === "image") {
    if (imgEl.src !== data.imageUrl) imgEl.src = data.imageUrl;
  } else if (document.activeElement !== textEl && textEl.innerText !== (data.text || "")) {
    textEl.innerText = data.text || "";
  }
}

function startDragNode(e, id, el) {
  e.stopPropagation();
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  const data = nodeData.get(id);
  const startCanvas = screenToCanvas(e.clientX, e.clientY);
  const origin = { x: data.x, y: data.y };
  suppressRemote.add(id);
  el.classList.add("dragging");

  function move(ev) {
    const cur = screenToCanvas(ev.clientX, ev.clientY);
    const nx = origin.x + (cur.x - startCanvas.x);
    const ny = origin.y + (cur.y - startCanvas.y);
    el.style.left = nx + "px";
    el.style.top = ny + "px";
    nodeData.set(id, { ...nodeData.get(id), x: nx, y: ny });
    renderAllEdges();
  }
  function up() {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    el.classList.remove("dragging");
    const d = nodeData.get(id);
    updateDoc(doc(nodesCol, id), { x: d.x, y: d.y }).finally(() => suppressRemote.delete(id));
  }
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

function startResizeNode(e, id, el) {
  e.stopPropagation();
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  const data = nodeData.get(id);
  const start = { x: e.clientX, y: e.clientY };
  const origin = { w: data.width || 220, h: data.height || 140 };
  suppressRemote.add(id);

  function move(ev) {
    const dx = (ev.clientX - start.x) / view.scale;
    const dy = (ev.clientY - start.y) / view.scale;
    const nw = Math.max(140, origin.w + dx);
    const nh = Math.max(80, origin.h + dy);
    el.style.width = nw + "px";
    el.style.height = nh + "px";
    nodeData.set(id, { ...nodeData.get(id), width: nw, height: nh });
    renderAllEdges();
  }
  function up() {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    const d = nodeData.get(id);
    updateDoc(doc(nodesCol, id), { width: d.width, height: d.height }).finally(() => suppressRemote.delete(id));
  }
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

function startConnect(e, fromId, el) {
  e.stopPropagation();
  e.preventDefault();
  pendingEdgePath.style.display = "block";

  function move(ev) {
    const from = nodeCenter(fromId);
    const to = screenToCanvas(ev.clientX, ev.clientY);
    pendingEdgePath.setAttribute("d", bezier(from, to));
  }
  function up(ev) {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    pendingEdgePath.style.display = "none";
    const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".node");
    if (target && target.dataset.id !== fromId) {
      addDoc(edgesCol, { fromNode: fromId, toNode: target.dataset.id, label: "", createdBy: playerName });
    }
  }
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

function nodeCenter(id) {
  const d = nodeData.get(id);
  if (!d) return { x: 0, y: 0 };
  return { x: d.x + (d.width || 220) / 2, y: d.y + (d.height || 140) / 2 };
}

// ------------------------------------------------------------------
// Edges
// ------------------------------------------------------------------
const edgeEls = new Map();
const edgeData = new Map();
let unsubEdges = null;

function subscribeEdges() {
  unsubEdges = onSnapshot(edgesCol, (snap) => {
    snap.docChanges().forEach((change) => {
      const id = change.doc.id;
      if (change.type === "removed") {
        edgeData.delete(id);
        edgeEls.get(id)?.g.remove();
        edgeEls.delete(id);
        return;
      }
      edgeData.set(id, change.doc.data());
    });
    renderAllEdges();
  });
}

function rectEdgePoint(data, towards) {
  const cx = data.x + (data.width || 220) / 2;
  const cy = data.y + (data.height || 140) / 2;
  const hw = (data.width || 220) / 2, hh = (data.height || 140) / 2;
  const dx = towards.x - cx, dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scaleX = hw / Math.abs(dx || 1e-6);
  const scaleY = hh / Math.abs(dy || 1e-6);
  const s = Math.min(scaleX, scaleY);
  return { x: cx + dx * s, y: cy + dy * s };
}
function bezier(a, b) {
  const dx = (b.x - a.x) * 0.5;
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function renderAllEdges() {
  edgeData.forEach((data, id) => {
    const from = nodeData.get(data.fromNode);
    const to = nodeData.get(data.toNode);
    if (!from || !to) return;
    const toCenter = { x: to.x + (to.width || 220) / 2, y: to.y + (to.height || 140) / 2 };
    const fromCenter = { x: from.x + (from.width || 220) / 2, y: from.y + (from.height || 140) / 2 };
    const p1 = rectEdgePoint(from, toCenter);
    const p2 = rectEdgePoint(to, fromCenter);
    const d = bezier(p1, p2);

    let entry = edgeEls.get(id);
    if (!entry) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "edge-line");
      path.style.pointerEvents = "stroke";
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "edge-label");
      label.setAttribute("text-anchor", "middle");
      g.appendChild(path);
      g.appendChild(label);
      edgesGroup.appendChild(g);
      entry = { g, path, label };
      edgeEls.set(id, entry);
      path.addEventListener("click", () => onEdgeClick(id));
    }
    entry.path.setAttribute("d", d);
    const m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    entry.label.setAttribute("x", m.x);
    entry.label.setAttribute("y", m.y - 6);
    entry.label.textContent = data.label || "";
  });
}

function onEdgeClick(id) {
  const data = edgeData.get(id);
  const action = confirm("OK = editar rótulo · Cancelar = excluir conexão");
  if (action) {
    const label = prompt("Rótulo da conexão:", data.label || "");
    if (label !== null) updateDoc(doc(edgesCol, id), { label });
  } else {
    deleteDoc(doc(edgesCol, id));
  }
}

// ------------------------------------------------------------------
// Paste image
// ------------------------------------------------------------------
document.addEventListener("paste", async (e) => {
  if (!nodesCol) return;
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      const dataUrl = await compressImage(file);
      const r = viewport.getBoundingClientRect();
      const p = screenToCanvas(r.left + r.width / 2, r.top + r.height / 2);
      createImageNode(p.x - 110, p.y - 110, dataUrl);
    }
  }
});

function compressImage(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width *= scale; height *= scale;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    reader.readAsDataURL(file);
  });
}
