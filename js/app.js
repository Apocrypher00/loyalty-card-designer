/* ====== Top-level state ====== */
const CARD_W = 1050, CARD_H = 600, HANDLE = 12, ROTATE_R = 8, ROTATE_OFFSET = 26;
const canvas = document.getElementById('cardCanvas'); const ctx = canvas.getContext('2d');

let csvData = [], logoImg = null;
// Editor state (declared once here)
let selected = null;   // currently selected element object
let dragging = null;   // {type:'move'|'resize'|'rotate', el, ...}

/* ====== Template & history ====== */
let template = {
    meta: { version: "1.4.0", created: new Date().toISOString() },
    page: { cardWidthPx: CARD_W, cardHeightPx: CARD_H },
    style: { pattern: { type: "none", color1: "#ffffff", color2: "#e2e8f0" }, border: { on: true, color: "#222222", thickness: 2 }, dropShadow: true, cornerRadius: 6 },
    editor: { showGrid: true, gridSize: 20, snapToGrid: true },
    elements: []
};

let history = [], hIndex = -1;
const undoBtn = document.getElementById('undoBtn'), redoBtn = document.getElementById('redoBtn');
const snapshot = () => JSON.stringify(template);
function updateHistoryButtons() { undoBtn.disabled = !(hIndex > 0); redoBtn.disabled = !(hIndex < history.length - 1); }
function pushHistory() {
    const snap = snapshot();
    history = history.slice(0, hIndex + 1);
    if (history[hIndex] !== snap) { history.push(snap); if (history.length > 60) history.shift(); hIndex = history.length - 1; }
    updateHistoryButtons();
    saveSession();
}
function resetHistory() { history = [snapshot()]; hIndex = 0; updateHistoryButtons(); }
function restoreHistory(dir) {
    const n = hIndex + dir; if (n < 0 || n >= history.length) return;
    hIndex = n; template = JSON.parse(history[hIndex]); selected = null; syncStyleInputs(); redraw(); refreshInspector(); updateHistoryButtons();
}

/* ====== Defaults ====== */
function ensureDefaults() {
    if (template.elements.length) return;
    template.elements.push(
        { id: "logo", type: "image", src: "your-logo.png", x: CARD_W / 2, y: 120, w: 520, h: 160, scale: 1, rotation: 0, name: "Logo" },
        {
            id: "barcode", type: "barcode", value: "5551234567", x: CARD_W / 2, y: 470, w: 520, h: 70, scale: 1, rotation: 0, format: "CODE128",
            showText: true, linkedText: true, textColor: "#000000", fontSize: 20, name: "Barcode"
        },
        { id: "name", type: "text", text: "Sample Name", x: CARD_W / 2, y: 330, fontSize: 48, fontFamily: "Arial", weight: 700, align: "center", rotation: 0, color: "#111111", name: "Name" }
    );
}

/* ====== Sessions ====== */
const AUTOSAVE_KEY = "lcd_autosave_v1";
function saveSession() {
  try { localStorage.setItem(AUTOSAVE_KEY, snapshot()); } catch {}
}
function clearSession(){
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch {}
}
function loadSessionIfAny() {
  try {
    const s = localStorage.getItem(AUTOSAVE_KEY);
    if (!s) return false;
    const t = JSON.parse(s);
    // quick sanity checks
    if (!t || !t.elements || !t.style || !t.page) return false;
    template = t;
    selected = null;
    syncStyleInputs();
    redraw();
    refreshInspector();
    // Seed internal history from this restored snapshot
    history = [snapshot()];
    hIndex = 0;
    updateHistoryButtons();
    // Seed browser history too
    try { window.history.replaceState({ idx: hIndex }, "", location.href); } catch {}
    return true;
  } catch {
    return false;
  }
}

/* ====== Utils ====== */
const deg2rad = d => d * Math.PI / 180;
const snap = v => template.editor.snapToGrid ? Math.round(v / template.editor.gridSize) * template.editor.gridSize : v;

/* ====== Background / grid / border ====== */
function drawBackground() {
    const p = template.style.pattern;
    if (p.type === "solid") { ctx.fillStyle = p.color1; ctx.fillRect(0, 0, CARD_W, CARD_H); }
    else if (p.type === "gradient") { const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H); g.addColorStop(0, p.color1); g.addColorStop(1, p.color2); ctx.fillStyle = g; ctx.fillRect(0, 0, CARD_W, CARD_H); }
    else if (p.type === "stripes") { ctx.fillStyle = p.color1; ctx.fillRect(0, 0, CARD_W, CARD_H); ctx.strokeStyle = p.color2; ctx.lineWidth = 18; for (let i = -CARD_H; i < CARD_W; i += 36) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + CARD_H, CARD_H); ctx.stroke(); } }
    else if (p.type === "dots") { ctx.fillStyle = p.color1; ctx.fillRect(0, 0, CARD_W, CARD_H); ctx.fillStyle = p.color2; for (let y = 10; y < CARD_H; y += 24) { for (let x = (y % 48 ? 0 : 12); x < CARD_W; x += 24) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); } } }
    else { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, CARD_W, CARD_H); }
}
function drawGrid() {
    if (!template.editor.showGrid) return;
    const g = template.editor.gridSize; ctx.save(); ctx.globalAlpha = .28; ctx.strokeStyle = "#d1d5db"; ctx.lineWidth = .6;
    for (let x = 0; x <= CARD_W; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CARD_H); ctx.stroke(); }
    for (let y = 0; y <= CARD_H; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CARD_W, y); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.strokeStyle = "#111827"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(CARD_W / 2, 0); ctx.lineTo(CARD_W / 2, CARD_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, CARD_H / 2); ctx.lineTo(CARD_W, CARD_H / 2); ctx.stroke();
    ctx.restore();
}
function roundRectPath(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function drawBorder() { if (!template.style.border.on) return; ctx.save(); ctx.strokeStyle = template.style.border.color; ctx.lineWidth = template.style.border.thickness; roundRectPath(ctx, 0, 0, CARD_W, CARD_H, template.style.cornerRadius); ctx.stroke(); ctx.restore(); }

/* ====== Barcode rendering ====== */
// Code128: render synchronously to offscreen canvas, then draw to main ctx
function drawCode128ToCtx(value, w, h) {
    const oc = document.createElement('canvas'); const scale = 2;
    oc.width = w * scale; oc.height = h * scale;
    try { JsBarcode(oc, value || "", { format: "CODE128", displayValue: false, width: 2 * scale, height: h * scale }); } catch (e) { }
    ctx.drawImage(oc, -w / 2, -h / 2, w, h);
}
// QR: cache async image
function ensureQRCache(el) {
    return new Promise(res => {
        const side = Math.max((el.w || 420) * (el.scale || 1), (el.h || 60) * (el.scale || 1));
        if (el._qr && el._qrSide === side && el._qrVal === el.value) { return res(); }
        const tmp = document.createElement('canvas'); tmp.width = tmp.height = side;
        QRCode.toCanvas(tmp, el.value || "", { width: side }, err => {
            const img = new Image(); img.onload = () => { el._qr = img; el._qrSide = side; el._qrVal = el.value; res(); }; img.src = tmp.toDataURL();
        });
    });
}

/* ====== Elements ====== */
function drawHandlesRect(w, h) {
    ctx.save(); ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 1.5; ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = "#fff"; const hs = HANDLE; const cs = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    for (const [cx, cy] of cs) { ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs); ctx.strokeRect(cx - hs / 2, cy - hs / 2, hs, hs); }
    ctx.beginPath(); ctx.arc(0, -h / 2 - ROTATE_OFFSET, 8, 0, Math.PI * 2); ctx.fillStyle = "#ef4444"; ctx.fill(); ctx.stroke(); ctx.restore();
}
function drawElement(el, outline = false) {
    ctx.save(); ctx.translate(el.x, el.y); ctx.rotate(deg2rad(el.rotation || 0));
    if (template.style.dropShadow) { ctx.shadowColor = "rgba(0,0,0,.18)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 5; }
    if (el.type === "image") {
        const w = (el.w || 300) * (el.scale || 1), h = (el.h || 150) * (el.scale || 1);
        if (logoImg && el.src === (logoImg.__filename || "")) ctx.drawImage(logoImg, -w / 2, -h / 2, w, h);
        else { ctx.fillStyle = "#f8fafc"; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeStyle = "#cbd5e1"; ctx.strokeRect(-w / 2, -h / 2, w, h); ctx.fillStyle = "#64748b"; ctx.font = "14px Arial"; ctx.textAlign = "center"; ctx.fillText(el.src || "Your logo", 0, 0); }
        if (outline) drawHandlesRect(w, h);
    } else if (el.type === "text") {
        ctx.fillStyle = el.color || "#000"; ctx.textAlign = el.align || "center"; ctx.font = `${el.weight || 400} ${el.fontSize || 20}px ${el.fontFamily || "Arial"}`;
        const lines = (el.text || "").split("\n"), lh = (el.fontSize || 20) * 1.2; for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], 0, (i - (lines.length - 1) / 2) * lh);
        if (outline) { const w = Math.max(80, (el.text || "").length * ((el.fontSize || 20) * 0.45) + 32), h = (el.fontSize || 20) * 1.4; drawHandlesRect(w, h); }
    } else if (el.type === "barcode") {
        const w = (el.w || 420) * (el.scale || 1), h = (el.h || 60) * (el.scale || 1);
        if (el.format === "QR") { if (el._qr) ctx.drawImage(el._qr, -w / 2, -w / 2, w, w); else { ensureQRCache(el).then(() => redraw(selected ? selected.id : null)); } }
        else { drawCode128ToCtx(el.value || "", w, h); }
        if (el.showText && el.linkedText) {
            ctx.fillStyle = el.textColor || "#000"; ctx.textAlign = "center"; ctx.font = `${el.fontSize || 20}px Arial`;
            const offset = (el.format === "QR") ? (w / 2 + (el.fontSize || 20) + 4) : (h / 2 + (el.fontSize || 20) + 4);
            ctx.fillText(el.value || "", 0, offset);
        }
        if (outline) {
            const textExtra = (el.showText && el.linkedText) ? ((el.fontSize || 20) + 8) : 0;
            const boxH = (el.format === "QR") ? (w + textExtra) : (h + textExtra);
            drawHandlesRect(w, boxH);
        }
    }
    ctx.restore();
}

/* ====== Redraw ====== */
function redraw(selId = null) {
    ctx.clearRect(0, 0, CARD_W, CARD_H);
    drawBackground(); drawGrid();
    for (const el of template.elements) drawElement(el, selId && el.id === selId);
    drawBorder();
}

/* ====== Hit testing ====== */
function toCanvas(ev) { const r = canvas.getBoundingClientRect(); return { x: (ev.clientX - r.left) * (canvas.width / r.width), y: (ev.clientY - r.top) * (canvas.height / r.height) }; }
function hitTest(x, y) {
    for (let i = template.elements.length - 1; i >= 0; i--) {
        const el = template.elements[i], dx = x - el.x, dy = y - el.y, a = -deg2rad(el.rotation || 0);
        const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
        let w, h;
        if (el.type === "text") { w = Math.max(80, (el.text || "").length * ((el.fontSize || 20) * 0.45) + 32); h = (el.fontSize || 20) * 1.4; }
        else if (el.type === "barcode") {
            const bw = (el.w || 420) * (el.scale || 1), bh = (el.h || 60) * (el.scale || 1);
            const textExtra = (el.showText && el.linkedText) ? ((el.fontSize || 20) + 8) : 0;
            w = bw; h = (el.format === "QR") ? (bw + textExtra) : (bh + textExtra);
        } else { w = (el.w || 420) * (el.scale || 1); h = (el.h || 60) * (el.scale || 1); }
        if (Math.hypot(rx, ry - (-h / 2 - ROTATE_OFFSET)) <= 8 + 2) return { el, kind: "rotate", box: [w, h] };
        const cs = [{ k: "nw", x: -w / 2, y: -h / 2 }, { k: "ne", x: w / 2, y: -h / 2 }, { k: "se", x: w / 2, y: h / 2 }, { k: "sw", x: -w / 2, y: h / 2 }];
        for (const c of cs) { if (Math.abs(rx - c.x) <= HANDLE / 2 && Math.abs(ry - c.y) <= HANDLE / 2) return { el, kind: "resize", corner: c.k, box: [w, h] }; }
        if (rx >= -w / 2 && rx <= w / 2 && ry >= -h / 2 && ry <= h / 2) return { el, kind: "move", box: [w, h] };
    }
    return null;
}

/* ====== Interaction ====== */
canvas.addEventListener('mousedown', ev => {
    const p = toCanvas(ev), hit = hitTest(p.x, p.y);
    if (!hit) { selected = null; redraw(); refreshInspector(); return; }
    selected = hit.el; refreshInspector(); redraw(selected.id);
    if (hit.kind === "rotate") dragging = { type: "rotate", el: selected, start: {}, startMouse: p };
    else if (hit.kind === "resize") dragging = { type: "resize", el: selected, corner: hit.corner, start: { w: selected.w || hit.box[0], h: selected.h || hit.box[1], font: selected.fontSize || 20 }, startMouse: p };
    else dragging = { type: "move", el: selected, start: { x: selected.x, y: selected.y }, startMouse: p };
});
window.addEventListener('mousemove', ev => {
    if (!dragging) return;
    const p = toCanvas(ev), el = dragging.el;
    if (dragging.type === "move") {
        el.x = snap(dragging.start.x + (p.x - dragging.startMouse.x));
        el.y = snap(dragging.start.y + (p.y - dragging.startMouse.y));
        redraw(el.id);
    } else if (dragging.type === "resize") {
        const a = -deg2rad(el.rotation || 0);
        const rx = (p.x - el.x) * Math.cos(a) - (p.y - el.y) * Math.sin(a);
        const ry = (p.x - el.x) * Math.sin(a) + (p.y - el.y) * Math.cos(a);
        let newW = Math.max(20, Math.abs(rx) * 2), newH = Math.max(20, Math.abs(ry) * 2);
        if (el.type === "text") { el.fontSize = Math.max(8, Math.round(newH / 1.4)); }
        else { el.w = newW; el.h = newH; }
        redraw(el.id);
    } else if (dragging.type === "rotate") {
        const ang = Math.atan2(p.y - el.y, p.x - el.x);
        el.rotation = Math.round(ang * 180 / Math.PI + 90);
        redraw(el.id);
    }
});
window.addEventListener('mouseup', () => { if (dragging) { dragging = null; pushHistory(); } });

/* ====== Inspector ====== */
const ins = document.getElementById('inspector'), linkBtn = document.getElementById('linkToggle');
function refreshInspector() {
    if (!selected) { ins.innerHTML = "No element selected"; linkBtn.style.display = "none"; return; }
    let html = `<div><strong>${selected.name || selected.id}</strong> <span class="muted">(${selected.type})</span></div>`;
    if (selected.type === "text") {
        html += `<label>Text <input id="iText" type="text" value="${(selected.text || "").replace(/"/g, '&quot;')}"/></label>
           <div class="btnRow" style="margin-top:6px">
             <label style="flex:1">Font size <input id="iFont" type="number" value="${selected.fontSize || 20}"/></label>
             <label style="flex:1">Color <input id="iColor" type="color" value="${selected.color || "#000000"}"/></label>
           </div>`;
    } else if (selected.type === "image") {
        html += `<div class="btnRow" style="margin-top:6px">
             <label style="flex:1">Width <input id="iW" type="number" value="${selected.w || 300}"/></label>
             <label style="flex:1">Height <input id="iH" type="number" value="${selected.h || 150}"/></label>
           </div>`;
    } else if (selected.type === "barcode") {
        html += `<div class="btnRow" style="margin-top:6px">
             <label style="flex:1">Width <input id="iW" type="number" value="${selected.w || 420}"/></label>
             <label style="flex:1">Height <input id="iH" type="number" value="${selected.h || 60}"/></label>
           </div>
           <label>Value <input id="iVal" type="text" value="${selected.value || ""}"/></label>
           <label>Format
             <select id="iFmt">
               <option value="CODE128" ${selected.format === "CODE128" ? "selected" : ""}>Code 128</option>
               <option value="QR" ${selected.format === "QR" ? "selected" : ""}>QR Code</option>
             </select>
           </label>
           <label style="margin-top:6px"><input id="iShowText" type="checkbox" ${selected.showText ? "checked" : ""}/> Show human-readable text</label>
           <div class="btnRow" style="margin-top:6px">
             <label style="flex:1">Text size <input id="iTxtSize" type="number" value="${selected.fontSize || 20}"/></label>
             <label style="flex:1">Text color <input id="iTxtColor" type="color" value="${selected.textColor || "#000000"}"/></label>
           </div>`;
    }
    ins.innerHTML = html;
    linkBtn.style.display = (selected.type === "barcode") ? "block" : "none";

    // wire live controls
    setTimeout(() => {
        const $ = id => document.getElementById(id);
        if (selected.type === "text") {
            $('iText').oninput = e => { selected.text = e.target.value; redraw(selected.id); };
            $('iFont').oninput = e => { selected.fontSize = parseInt(e.target.value) || 20; redraw(selected.id); };
            $('iColor').oninput = e => { selected.color = e.target.value; redraw(selected.id); };
        } else if (selected.type === "image") {
            $('iW').oninput = e => { selected.w = Math.max(10, parseInt(e.target.value) || selected.w); redraw(selected.id); };
            $('iH').oninput = e => { selected.h = Math.max(10, parseInt(e.target.value) || selected.h); redraw(selected.id); };
        } else if (selected.type === "barcode") {
            $('iW').oninput = e => { selected.w = Math.max(40, parseInt(e.target.value) || selected.w); redraw(selected.id); };
            $('iH').oninput = e => { selected.h = Math.max(20, parseInt(e.target.value) || selected.h); redraw(selected.id); };
            $('iVal').oninput = e => { selected.value = e.target.value; selected._qr = null; redraw(selected.id); };
            $('iFmt').onchange = e => { selected.format = e.target.value; selected._qr = null; redraw(selected.id); };
            $('iShowText').onchange = e => { selected.showText = e.target.checked; redraw(selected.id); };
            $('iTxtSize').oninput = e => { selected.fontSize = parseInt(e.target.value) || 20; redraw(selected.id); };
            $('iTxtColor').oninput = e => { selected.textColor = e.target.value; redraw(selected.id); };
        }
    }, 0);
}
function bindInspectorButtons() {
    const step = () => template.editor.gridSize || 20;
    const map = {
        nudgeUp: () => { if (!selected) return; selected.y = snap(selected.y - step()); redraw(selected.id); pushHistory(); },
        nudgeDown: () => { if (!selected) return; selected.y = snap(selected.y + step()); redraw(selected.id); pushHistory(); },
        nudgeLeft: () => { if (!selected) return; selected.x = snap(selected.x - step()); redraw(selected.id); pushHistory(); },
        nudgeRight: () => { if (!selected) return; selected.x = snap(selected.x + step()); redraw(selected.id); pushHistory(); },
        rotMinus: () => { if (!selected) return; selected.rotation = (selected.rotation || 0) - 5; redraw(selected.id); pushHistory(); },
        rotPlus: () => { if (!selected) return; selected.rotation = (selected.rotation || 0) + 5; redraw(selected.id); pushHistory(); }
    };
    for (const id in map) document.getElementById(id).onclick = map[id];
    document.getElementById('deleteEl').onclick = () => { if (!selected) return; if (!confirm('Delete selected element?')) return; template.elements = template.elements.filter(e => e !== selected); selected = null; redraw(); refreshInspector(); pushHistory(); };
    document.getElementById('linkToggle').onclick = () => { if (selected && selected.type === "barcode") { selected.linkedText = !selected.linkedText; redraw(selected.id); pushHistory(); refreshInspector(); } };
}
bindInspectorButtons();

/* ====== Keyboard ====== */
window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) restoreHistory(+1); else restoreHistory(-1); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); restoreHistory(+1); }
    if (e.key === "Delete") { const btn = document.getElementById('deleteEl'); if (btn) btn.click(); }
});

/* ====== Controls & IO ====== */
function updatePatternUI() {
  const type = document.getElementById('patternType').value;
  const color1Row = document.getElementById('color1Row');
  const color2Row = document.getElementById('color2Row');

  if (type === 'none') {
    // Hide both color pickers
    color1Row.style.display = 'none';
    color2Row.style.display = 'none';
  } else if (type === 'solid') {
    // Show only Color 1
    color1Row.style.display = '';
    color2Row.style.display = 'none';
  } else {
    // gradient/stripes/dots → show both
    color1Row.style.display = '';
    color2Row.style.display = '';
  }
}
function syncStyleInputs() {
    document.getElementById('patternType').value = template.style.pattern.type;
    document.getElementById('color1').value = template.style.pattern.color1;
    document.getElementById('color2').value = template.style.pattern.color2;
    document.getElementById('borderOn').checked = template.style.border.on;
    document.getElementById('borderColor').value = template.style.border.color;
    document.getElementById('borderThickness').value = template.style.border.thickness;
    document.getElementById('dropShadow').checked = template.style.dropShadow;
    document.getElementById('cornerRadius').value = template.style.cornerRadius;
    document.getElementById('gridSize').value = template.editor.gridSize;
    document.getElementById('snapToGrid').checked = template.editor.snapToGrid;
    document.getElementById('showGrid').checked = template.editor.showGrid;
    updatePatternUI();
}
['patternType', 'color1', 'color2', 'borderOn', 'borderColor', 'borderThickness', 'dropShadow', 'cornerRadius', 'gridSize', 'snapToGrid', 'showGrid']
    .forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('change', () => {
            if (id === 'patternType') {
                template.style.pattern.type = el.value;
                updatePatternUI();
            }
            else if (id === 'color1') template.style.pattern.color1 = el.value;
            else if (id === 'color2') template.style.pattern.color2 = el.value;
            else if (id === 'borderOn') template.style.border.on = el.checked;
            else if (id === 'borderColor') template.style.border.color = el.value;
            else if (id === 'borderThickness') template.style.border.thickness = parseFloat(el.value) || 2;
            else if (id === 'dropShadow') template.style.dropShadow = el.checked;
            else if (id === 'cornerRadius') template.style.cornerRadius = parseFloat(el.value) || 0;
            else if (id === 'gridSize') template.editor.gridSize = parseInt(el.value) || 20;
            else if (id === 'snapToGrid') template.editor.snapToGrid = el.checked;
            else if (id === 'showGrid') { template.editor.showGrid = el.checked; redraw(selected ? selected.id : null); }
            redraw(selected ? selected.id : null); pushHistory();
        });
    });
document.getElementById('logoFile').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
        logoImg = new Image(); logoImg.__filename = f.name;
        logoImg.onload = () => { for (const el of template.elements) if (el.type === "image") el.src = f.name; redraw(selected ? selected.id : null); pushHistory(); };
        logoImg.src = ev.target.result;
    };
    reader.readAsDataURL(f);
});
document.getElementById('loadTemplate').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
        try { template = JSON.parse(ev.target.result); selected = null; syncStyleInputs(); redraw(); refreshInspector(); resetHistory(); alert("Template loaded. If logo is missing, select it via Logo image."); }
        catch (err) { alert("Invalid template JSON: " + err.message); }
    };
    r.readAsText(f);
});
document.getElementById('saveTemplate').onclick = () => {
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'template.json'; a.click(); URL.revokeObjectURL(url);
};
document.getElementById('resetTemplate').onclick = () => {
  if (!confirm("Reset to default layout and styles?")) return;

  // Rebuild defaults (your existing code)
  template = {
    meta: { version: "1.4.x", created: new Date().toISOString() },
    page: { cardWidthPx: CARD_W, cardHeightPx: CARD_H },
    style: {
      pattern: { type: "none", color1: "#ffffff", color2: "#e2e8f0" },
      border: { on: true, color: "#222222", thickness: 2 },
      dropShadow: true,
      cornerRadius: 6
    },
    editor: { showGrid: true, gridSize: 20, snapToGrid: true },
    elements: []
  };
  ensureDefaults();           // keep your sample elements
  selected = null;
  syncStyleInputs();
  redraw();
  refreshInspector();
  resetHistory();

  // 🔄 wipe autosaved session and (optionally) save the clean default
  clearSession();
  saveSession();              // keep this if you want reload to match the just-reset state
};

document.getElementById('addText').onclick = () => {
    const el = { id: "text_" + Date.now(), type: "text", text: "New Text", x: CARD_W / 2, y: CARD_H / 2, fontSize: 24, fontFamily: "Arial", weight: 400, align: "center", rotation: 0, color: "#111" };
    template.elements.push(el); selected = el; redraw(el.id); refreshInspector(); pushHistory();
};
document.getElementById('addBarcode').onclick = () => {
    const el = { id: "barcode_" + Date.now(), type: "barcode", value: "5550000000", x: CARD_W / 2, y: CARD_H / 2, w: 420, h: 60, scale: 1, rotation: 0, format: "CODE128", showText: true, linkedText: true, textColor: "#000", fontSize: 20 };
    template.elements.push(el); selected = el; redraw(el.id); refreshInspector(); pushHistory();
};

undoBtn.onclick = () => restoreHistory(-1);
redoBtn.onclick = () => restoreHistory(+1);

/* ====== CSV ====== */
document.getElementById('loadCSV').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
        const t = ev.target.result.replace(/\r/g, '').trim(), rows = t.split('\n');
        const head = rows[0].split(',').map(s => s.trim().toLowerCase());
        const iN = head.indexOf('name'), iP = head.indexOf('phone');
        if (iN < 0 || iP < 0) { alert("CSV needs headers: Name,Phone"); return; }
        csvData = rows.slice(1).map(line => { const c = line.split(','); return { name: c[iN]?.trim() || "", phone: c[iP]?.trim() || "" }; });
        const nameEl = template.elements.find(e => e.type === "text" && (e.id === "name" || (e.name || "").toLowerCase().includes("name")));
        const bcEl = template.elements.find(e => e.type === "barcode");
        if (csvData[0]) { if (nameEl) nameEl.text = csvData[0].name; if (bcEl) { bcEl.value = csvData[0].phone; bcEl._qr = null; } redraw(selected ? selected.id : null); }
        alert(`CSV loaded: ${csvData.length} rows. Export when ready.`);
    };
    r.readAsText(f);
});

/* ====== Export PDF ====== */
document.getElementById('exportPDF').onclick = async () => {
    const { jsPDF } = window.jspdf;

    // Hide editor-only visuals during export (grid, etc.)
    const prevShowGrid = template.editor.showGrid;
    template.editor.showGrid = false;
    const restore = () => { template.editor.showGrid = prevShowGrid; redraw(selected ? selected.id : null); };

    try {
        // ----- PAGE & CARD METRICS (Portrait Letter) -----
        const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
        const pageW = pdf.internal.pageSize.getWidth();   // 612 pt
        const pageH = pdf.internal.pageSize.getHeight();  // 792 pt

        // Business card size (3.5" x 2")
        const cardWpt = 3.5 * 72;
        const cardHpt = 2.0 * 72;

        // Margins (0.5")
        const margin = 36;

        // How many columns/rows fit (without grid)
        const usableW = pageW - 2 * margin;
        const usableH = pageH - 2 * margin;
        const fitCols = Math.max(1, Math.floor(usableW / cardWpt));
        const fitRows = Math.max(1, Math.floor(usableH / cardHpt));
        const perPage = fitCols * fitRows;

        // Distribute extra space as gutters across (fit+1) gaps for equal outer margins
        const extraW = usableW - fitCols * cardWpt;
        const extraH = usableH - fitRows * cardHpt;
        const gutterX = extraW / (fitCols + 1);
        const gutterY = extraH / (fitRows + 1);

        // Data (fallback sample)
        const records = csvData.length
            ? csvData
            : [{ name: "Sample Name", phone: "5551234567" }];

        for (let i = 0; i < records.length; i++) {
            if (i > 0 && i % perPage === 0) pdf.addPage();

            // Apply record into template
            const backup = JSON.parse(JSON.stringify(template.elements));
            const nameEl = template.elements.find(e => e.type === "text" && (e.id === "name" || (e.name || "").toLowerCase().includes("name")));
            const bcEl = template.elements.find(e => e.type === "barcode");
            if (nameEl) nameEl.text = records[i].name;
            if (bcEl) { bcEl.value = records[i].phone; bcEl._qr = null; }

            // Pre-render QR caches if needed (Code128 is instant)
            for (const b of template.elements.filter(e => e.type === "barcode" && e.format === "QR")) {
                await ensureQRCache(b);
            }

            // Redraw without grid and snapshot card
            redraw();
            const cardPng = canvas.toDataURL("image/png");

            // Position on page with equal margins (portrait)
            const idx = i % perPage;
            const c = idx % fitCols;
            const r = Math.floor(idx / fitCols);
            const x = margin + (c + 1) * gutterX + c * cardWpt;
            const y = margin + (r + 1) * gutterY + r * cardHpt;

            pdf.addImage(cardPng, "PNG", x, y, cardWpt, cardHpt);

            // Crop marks
            pdf.setDrawColor(0); pdf.setLineWidth(.5);
            const mm = 6;
            pdf.line(x - mm, y, x - mm - 10, y); pdf.line(x, y - mm, x, y - mm - 10);
            pdf.line(x + cardWpt + mm, y, x + cardWpt + mm + 10, y); pdf.line(x + cardWpt, y - mm, x + cardWpt, y - mm - 10);
            pdf.line(x - mm, y + cardHpt, x - mm - 10, y + cardHpt); pdf.line(x, y + cardHpt + mm, x, y + cardHpt + mm + 10);
            pdf.line(x + cardWpt + mm, y + cardHpt, x + cardWpt + mm + 10, y + cardHpt); pdf.line(x + cardWpt, y + cardHpt + mm, x + cardWpt, y + cardHpt + mm + 10);

            // Restore for next record
            template.elements = backup;
            redraw(); // grid still off during export
        }

        pdf.save("cards.pdf");
    } finally {
        restore(); // put grid back as the user had it
    }
};

/* ====== Init ====== */
function init(){
  if (!loadSessionIfAny()) {
    ensureDefaults();
    syncStyleInputs();
    redraw();
    resetHistory();
    // seed browser history for the initial state
    try { window.history.replaceState({ idx: hIndex }, "", location.href); } catch {}
    saveSession();
  }
}
init();
