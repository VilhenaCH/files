import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ------------------------------------------------------------------
// Firebase
// ------------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ------------------------------------------------------------------
// Board / player identity
// ------------------------------------------------------------------
const url = new URL(location.href);
let boardId = url.searchParams.get("board");
if (!boardId) {
  boardId = Math.random().toString(36).slice(2, 8);
  url.searchParams.set("board", boardId);
  history.replaceState(null, "", url.toString());
}
const boardRef = doc(db, "boards", boardId);
const nodesCol = collection(db, "boards", boardId, "nodes");
const edgesCol = collection(db, "boards", boardId, "edges");

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
const playerBadge = document.getElementById("player-badge");
const nameOverlay = document.getElementById("name-overlay");
const nameInput = document.getElementById("name-input");

// ------------------------------------------------------------------
// Viewport state (pan & zoom)
// ------------------------------------------------------------------
const view = { x: 0, y: 0, scale: 1 };
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
view.x = 400; view.y = 250;
applyTransform();

// wheel = pan; ctrl/cmd+wheel = zoom (trackpad pinch sends ctrlKey too)
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

// Pan by dragging empty background (left-click) or middle-click anywhere
let panState = null;
viewport.addEventListener("pointerdown", (e) => {
  if (e.target !== viewport && e.target !== content && e.target !== edgeLayer && e.target !== nodesLayer) return;
  if (e.button !== 0 && e.button !== 1) return;
  panState = { startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y };
  viewport.classList.add("panning");
  viewport.setPointerCapture(e.pointerId);
});
viewport.addEventListener("pointermove", (e) => {
  if (!panState) return;
  view.x = panState.vx + (e.clientX - panState.startX);
  view.y = panState.vy + (e.clientY - panState.startY);
  applyTransform();
});
viewport.addEventListener("pointerup", () => { panState = null; viewport.classList.remove("panning"); });

// double-click empty canvas -> create card
viewport.addEventListener("dblclick", (e) => {
  if (e.target !== viewport && e.target !== content && e.target !== edgeLayer && e.target !== nodesLayer) return;
  const p = screenToCanvas(e.clientX, e.clientY);
  createTextNode(p.x - 110, p.y - 45);
});
document.getElementById("fab-add").onclick = () => {
  const r = viewport.getBoundingClientRect();
  const p = screenToCanvas(r.left + r.width / 2, r.top + r.height / 2);
  createTextNode(p.x - 110, p.y - 45);
};

// hide the hint after first interaction
["pointerdown", "dblclick"].forEach(evt =>
  viewport.addEventListener(evt, () => hint.classList.add("hide"), { once: true })
);

// ------------------------------------------------------------------
// Player name overlay
// ------------------------------------------------------------------
function startApp() {
  playerBadge.textContent = "Você: " + playerName;
  nameOverlay.classList.add("hidden");
  subscribeNodes();
  subscribeEdges();
}
if (playerName) {
  startApp();
} else {
  nameInput.focus();
}
document.getElementById("name-submit").onclick = submitName;
nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitName(); });
function submitName() {
  const v = nameInput.value.trim();
  if (!v) return;
  playerName = v;
  localStorage.setItem("canvas_player_name", v);
  startApp();
}

// board title (shared)
getDoc(boardRef).then((snap) => {
  if (snap.exists() && snap.data().title) boardTitleInput.value = snap.data().title;
});
let titleTimer;
boardTitleInput.addEventListener("input", () => {
  clearTimeout(titleTimer);
  titleTimer = setTimeout(() => {
    setDoc(boardRef, { title: boardTitleInput.value }, { merge: true });
  }, 400);
});

document.getElementById("share-btn").onclick = async (e) => {
  await navigator.clipboard.writeText(url.toString());
  e.target.classList.add("copied");
  e.target.textContent = "Link copiado!";
  setTimeout(() => { e.target.classList.remove("copied"); e.target.textContent = "Copiar link"; }, 1500);
};

// ------------------------------------------------------------------
// Nodes: local state + rendering
// ------------------------------------------------------------------
const nodeEls = new Map();     // id -> element
const nodeData = new Map();    // id -> latest known data
const suppressRemote = new Set(); // ids currently being dragged/resized locally

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
  onSnapshot(nodesCol, (snap) => {
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
      if (suppressRemote.has(id)) return; // don't fight local drag/resize
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

  // drag
  bar.addEventListener("pointerdown", (e) => startDragNode(e, id, el));

  // color menu
  colorToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".color-menu.open").forEach(m => { if (m !== colorMenu) m.classList.remove("open"); });
    colorMenu.classList.toggle("open");
  });
  colorMenu.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const c = Number(btn.dataset.color);
      el.dataset.color = c;
      colorMenu.classList.remove("open");
      updateDoc(doc(nodesCol, id), { color: c });
    });
  });
  document.addEventListener("click", () => colorMenu.classList.remove("open"));

  // delete
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm("Excluir este card?")) {
      deleteDoc(doc(nodesCol, id));
      // remove edges connected to it
      edgeData.forEach((ed, eid) => {
        if (ed.fromNode === id || ed.toNode === id) deleteDoc(doc(edgesCol, eid));
      });
    }
  });

  // text edit
  let textTimer;
  textEl.addEventListener("input", () => {
    clearTimeout(textTimer);
    const val = textEl.innerText;
    textTimer = setTimeout(() => updateDoc(doc(nodesCol, id), { text: val }), 350);
  });
  textEl.addEventListener("pointerdown", (e) => e.stopPropagation());

  // resize
  resizeHandle.addEventListener("pointerdown", (e) => startResizeNode(e, id, el));

  // connect
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

// ---- drag ----
function startDragNode(e, id, el) {
  e.stopPropagation();
  e.preventDefault();
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
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    el.classList.remove("dragging");
    const d = nodeData.get(id);
    updateDoc(doc(nodesCol, id), { x: d.x, y: d.y }).finally(() => suppressRemote.delete(id));
  }
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

// ---- resize ----
function startResizeNode(e, id, el) {
  e.stopPropagation();
  e.preventDefault();
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
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    const d = nodeData.get(id);
    updateDoc(doc(nodesCol, id), { width: d.width, height: d.height }).finally(() => suppressRemote.delete(id));
  }
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

// ---- connect ----
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

function subscribeEdges() {
  onSnapshot(edgesCol, (snap) => {
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
  // returns the point on the rectangle border closest to "towards", for a nicer arrow landing
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
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    entry.label.setAttribute("x", mid.x);
    entry.label.setAttribute("y", mid.y - 6);
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
