// ==========================================================================
// Gráfico de Crochê Pixel — lógica principal (v4)
// Interface em "telas cheias" (carrossel), navegação por swipe e por botões
// Voltar/Avançar fixos no rodapé. Fluxo:
//   Tela 0: upload da imagem já pixelada
//   Tela 1: informar colunas x linhas, gerar/testar quantas vezes quiser
//   Tela 2: ajustar bordas (linhas/colunas extras)
//   Tela 3: contador de carreiras
// Tudo roda no navegador. Projeto salvo automaticamente no localStorage.
// ==========================================================================

const STORAGE_KEY = 'croche_pixel_projeto_v3';
const CELL_PX = 22;
const MAX_PALETTE_COLORS = 6;
const TOTAL_SCREENS = 4;

const state = {
  width: 39,
  height: 28,
  grid: null,
  palette: [],
  uploadedImage: null,
  currentRowFromBottom: 1,
  currentScreen: 0,
  hasGeneratedOnce: false, // controla se pode avançar da tela 1 para a 2
};

function $(id) { return document.getElementById(id); }

// ---------- Navegação entre telas ----------
const carousel = $('carousel');
const dots = document.querySelectorAll('.dot');
const btnNavBack = $('btnNavBack');
const btnNavNext = $('btnNavNext');

function maxUnlockedScreen() {
  if (state.grid) return 3; // grade já existe (gerada ou restaurada) -> tudo liberado
  if (!state.uploadedImage) return 0;
  return 1; // imagem enviada, mas ainda não gerou grade
}

function goToScreen(n, { instant = false } = {}) {
  n = Math.max(0, Math.min(TOTAL_SCREENS - 1, n));
  n = Math.min(n, maxUnlockedScreen());
  state.currentScreen = n;
  const target = $('screen' + n);
  target.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', inline: 'start', block: 'nearest' });
  updateNavUI();
}

function updateNavUI() {
  const n = state.currentScreen;
  dots.forEach((d, i) => d.classList.toggle('active', i === n));

  btnNavBack.style.visibility = n === 0 ? 'hidden' : 'visible';

  // Texto e estado do botão avançar dependem da tela atual
  if (n === 0) {
    btnNavNext.textContent = 'Avançar →';
    btnNavNext.disabled = !state.uploadedImage;
  } else if (n === 1) {
    btnNavNext.textContent = 'Avançar →';
    btnNavNext.disabled = !state.hasGeneratedOnce;
  } else if (n === 2) {
    btnNavNext.textContent = 'Ir para o contador →';
    btnNavNext.disabled = !state.grid;
  } else if (n === 3) {
    btnNavNext.textContent = '✓ Fim do fluxo';
    btnNavNext.disabled = true;
  }
}

btnNavNext.addEventListener('click', () => {
  if (state.currentScreen === 1 && !state.hasGeneratedOnce) return;
  if (state.currentScreen === 2) {
    // Ao ir da tela 2 (bordas) pra 3 (contador), garante que o contador renderize com dados atuais
    renderCounter();
  }
  goToScreen(state.currentScreen + 1);
});
btnNavBack.addEventListener('click', () => {
  goToScreen(state.currentScreen - 1);
});

// Detecta a tela visível quando o usuário arrasta (swipe) manualmente.
// Se a pessoa arrastar além do que está liberado, "empurra" de volta ao limite.
let scrollDebounce = null;
carousel.addEventListener('scroll', () => {
  clearTimeout(scrollDebounce);
  scrollDebounce = setTimeout(() => {
    const idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
    const maxAllowed = maxUnlockedScreen();
    if (idx > maxAllowed) {
      goToScreen(maxAllowed);
      return;
    }
    if (idx !== state.currentScreen) {
      state.currentScreen = idx;
      updateNavUI();
      if (idx === 3) renderCounter();
    }
  }, 80);
});

dots.forEach((dot, i) => {
  dot.style.cursor = 'pointer';
  dot.addEventListener('click', () => {
    if (i <= maxUnlockedScreen()) {
      goToScreen(i);
      if (i === 3) renderCounter();
    }
  });
});

// ---------- Persistência ----------
function saveProject() {
  try {
    const payload = {
      width: state.width,
      height: state.height,
      grid: state.grid,
      palette: state.palette,
      currentRowFromBottom: state.currentRowFromBottom,
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    flashSaveIndicator();
  } catch (e) {
    console.warn('Não foi possível salvar o projeto:', e);
  }
}

function loadProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function clearProject() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

let saveFlashTimeout = null;
function flashSaveIndicator() {
  const el = $('saveIndicator');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(saveFlashTimeout);
  saveFlashTimeout = setTimeout(() => el.classList.remove('show'), 1200);
}

// ---------- Inicialização: retomar projeto salvo, se houver ----------
window.addEventListener('DOMContentLoaded', () => {
  const saved = loadProject();
  if (saved && saved.grid && saved.grid.length) {
    state.width = saved.width;
    state.height = saved.height;
    state.grid = saved.grid;
    state.palette = saved.palette || [];
    state.currentRowFromBottom = saved.currentRowFromBottom || 1;
    state.hasGeneratedOnce = true;

    $('projectNote').classList.remove('hidden');
    $('projectNote').textContent = `Projeto retomado: ${state.width} × ${state.height} pontos`;

    renderGridEditor();
    goToScreen(3, { instant: true });
    renderCounter();
  } else {
    updateNavUI();
  }
});

$('btnNewProject').addEventListener('click', () => {
  if (confirm('Isso vai apagar o projeto atual salvo neste navegador. Quer começar um novo?')) {
    clearProject();
    location.reload();
  }
});

// ---------- Tela 0: Upload ----------
const dropzone = $('dropzone');
const fileInput = $('fileInput');

dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Por favor, envie um arquivo de imagem.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (evt) => {
    const img = new Image();
    img.onload = () => {
      state.uploadedImage = img;
      $('uploadPreviewImg').src = evt.target.result;
      $('uploadPreviewWrap').classList.remove('hidden');
      updateNavUI();
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

// ---------- Tela 1: definir colunas/linhas + preview rápido ----------
const widthInput = $('widthInput');
const heightInput = $('heightInput');
const btnStartGrid = $('btnStartGrid');
const quickPreviewCanvas = $('quickPreviewCanvas');
const qctx = quickPreviewCanvas.getContext('2d');

btnStartGrid.addEventListener('click', () => {
  if (!state.uploadedImage) return;
  const w = Math.max(1, Math.min(200, parseInt(widthInput.value || '39', 10)));
  const h = Math.max(1, Math.min(200, parseInt(heightInput.value || '28', 10)));
  state.width = w;
  state.height = h;

  const { grid, palette } = sampleImageToGrid(state.uploadedImage, w, h);
  state.grid = grid;
  state.palette = palette;
  state.currentRowFromBottom = 1;
  state.hasGeneratedOnce = true;

  $('quickPreviewWrap').classList.remove('hidden');
  renderQuickPreview();
  renderGridEditor();
  saveProject();
  updateNavUI();
});

function renderQuickPreview() {
  const grid = state.grid;
  const gh = grid.length;
  const gw = grid[0].length;
  quickPreviewCanvas.width = gw * CELL_PX;
  quickPreviewCanvas.height = gh * CELL_PX;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      qctx.fillStyle = colorForIndex(grid[y][x]);
      qctx.fillRect(x*CELL_PX, y*CELL_PX, CELL_PX, CELL_PX);
      qctx.strokeStyle = 'rgba(0,0,0,0.15)';
      qctx.lineWidth = 1;
      qctx.strokeRect(x*CELL_PX+0.5, y*CELL_PX+0.5, CELL_PX-1, CELL_PX-1);
    }
  }
}

// ---------- Amostragem de cor ----------
function sampleImageToGrid(img, w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const fullData = ctx.getImageData(0, 0, img.width, img.height).data;

  const cellW = img.width / w;
  const cellH = img.height / h;

  const avgColors = [];
  for (let ry = 0; ry < h; ry++) {
    const row = [];
    for (let rx = 0; rx < w; rx++) {
      const x0 = Math.floor(rx * cellW);
      const y0 = Math.floor(ry * cellH);
      const x1 = Math.max(x0 + 1, Math.floor((rx + 1) * cellW));
      const y1 = Math.max(y0 + 1, Math.floor((ry + 1) * cellH));

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      const stepX = Math.max(1, Math.floor((x1 - x0) / 6));
      const stepY = Math.max(1, Math.floor((y1 - y0) / 6));
      for (let y = y0; y < y1; y += stepY) {
        for (let x = x0; x < x1; x += stepX) {
          const idx = (y * img.width + x) * 4;
          rSum += fullData[idx];
          gSum += fullData[idx + 1];
          bSum += fullData[idx + 2];
          count++;
        }
      }
      if (count === 0) { rSum = 255; gSum = 255; bSum = 255; count = 1; }
      row.push([rSum / count, gSum / count, bSum / count]);
    }
    avgColors.push(row);
  }

  const flatColors = [];
  for (let ry = 0; ry < h; ry++) for (let rx = 0; rx < w; rx++) flatColors.push(avgColors[ry][rx]);

  const k = Math.min(MAX_PALETTE_COLORS, estimateDistinctColors(flatColors));
  const { centers, assignments } = kMeans(flatColors, k);

  const order = centers.map((c, i) => ({ i, light: c[0]+c[1]+c[2] }))
                        .sort((a, b) => b.light - a.light)
                        .map(o => o.i);
  const remap = new Array(centers.length);
  order.forEach((origIdx, newIdx) => { remap[origIdx] = newIdx; });
  const palette = order.map(i => rgbToHex(centers[i][0], centers[i][1], centers[i][2]));

  const grid = [];
  let flatIdx = 0;
  for (let ry = 0; ry < h; ry++) {
    const row = [];
    for (let rx = 0; rx < w; rx++) {
      row.push(remap[assignments[flatIdx]]);
      flatIdx++;
    }
    grid.push(row);
  }

  return { grid, palette };
}

function estimateDistinctColors(colors) {
  const seen = new Set();
  for (const c of colors) {
    const key = [Math.round(c[0]/24), Math.round(c[1]/24), Math.round(c[2]/24)].join(',');
    seen.add(key);
    if (seen.size >= MAX_PALETTE_COLORS) break;
  }
  return Math.max(2, Math.min(MAX_PALETTE_COLORS, seen.size));
}

function kMeans(pixels, k) {
  if (pixels.length === 0) return { centers: [[255,255,255]], assignments: [] };
  let centers = [];
  const sorted = [...pixels].sort((a, b) => (a[0]+a[1]+a[2]) - (b[0]+b[1]+b[2]));
  for (let i = 0; i < k; i++) {
    centers.push(sorted[Math.floor(i * (sorted.length - 1) / Math.max(1, k - 1))].slice());
  }
  let assignments = new Array(pixels.length).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    for (let i = 0; i < pixels.length; i++) {
      let best = 0, bestDist = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const dr = pixels[i][0]-centers[c][0], dg = pixels[i][1]-centers[c][1], db = pixels[i][2]-centers[c][2];
        const d = dr*dr+dg*dg+db*db;
        if (d < bestDist) { bestDist = d; best = c; }
      }
      assignments[i] = best;
    }
    const sums = centers.map(() => [0,0,0,0]);
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      sums[c][3] += 1;
    }
    for (let c = 0; c < centers.length; c++) {
      if (sums[c][3] > 0) {
        centers[c] = [sums[c][0]/sums[c][3], sums[c][1]/sums[c][3], sums[c][2]/sums[c][3]];
      }
    }
  }
  return { centers, assignments };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

// ---------- Tela 2: ajuste de bordas ----------
const gridCanvas = $('gridCanvas');
const gctx = gridCanvas.getContext('2d');

function colorForIndex(idx) {
  return state.palette[idx] || '#cccccc';
}

function renderGridEditor() {
  if (!state.grid) return;
  const grid = state.grid;
  const gh = grid.length;
  const gw = grid[0].length;
  gridCanvas.width = gw * CELL_PX;
  gridCanvas.height = gh * CELL_PX;

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      gctx.fillStyle = colorForIndex(grid[y][x]);
      gctx.fillRect(x*CELL_PX, y*CELL_PX, CELL_PX, CELL_PX);
      gctx.strokeStyle = 'rgba(0,0,0,0.15)';
      gctx.lineWidth = 1;
      gctx.strokeRect(x*CELL_PX+0.5, y*CELL_PX+0.5, CELL_PX-1, CELL_PX-1);
    }
  }
  gctx.strokeStyle = 'rgba(178,58,46,0.6)';
  gctx.lineWidth = 2;
  for (let x = 0; x <= gw; x += 10) {
    gctx.beginPath(); gctx.moveTo(x*CELL_PX, 0); gctx.lineTo(x*CELL_PX, gh*CELL_PX); gctx.stroke();
  }
  for (let y = 0; y <= gh; y += 10) {
    gctx.beginPath(); gctx.moveTo(0, y*CELL_PX); gctx.lineTo(gw*CELL_PX, y*CELL_PX); gctx.stroke();
  }

  updateGridStats();
}

function updateGridStats() {
  const grid = state.grid;
  const gh = grid.length;
  const gw = grid[0].length;
  $('gridStats').innerHTML = `<span><strong>${gw}</strong> pontos por carreira</span><span><strong>${gh}</strong> carreiras</span><span>Corrente de base sugerida: <strong>${gw + 1}</strong></span>`;
}

function bgIndex() {
  if (!state.palette.length) return 0;
  let lightestIdx = 0, lightestVal = -1;
  state.palette.forEach((hex, i) => {
    const n = parseInt(hex.replace('#',''), 16);
    const light = ((n>>16)&255) + ((n>>8)&255) + (n&255);
    if (light > lightestVal) { lightestVal = light; lightestIdx = i; }
  });
  return lightestIdx;
}

$('btnAddRowTop').addEventListener('click', () => {
  state.grid.unshift(new Array(state.grid[0].length).fill(bgIndex()));
  afterGridStructureChange();
});
$('btnAddRowBottom').addEventListener('click', () => {
  state.grid.push(new Array(state.grid[0].length).fill(bgIndex()));
  afterGridStructureChange();
});
$('btnRemoveRowTop').addEventListener('click', () => {
  if (state.grid.length > 1) state.grid.shift();
  afterGridStructureChange();
});
$('btnRemoveRowBottom').addEventListener('click', () => {
  if (state.grid.length > 1) state.grid.pop();
  afterGridStructureChange();
});
$('btnAddColLeft').addEventListener('click', () => {
  state.grid.forEach(row => row.unshift(bgIndex()));
  afterGridStructureChange();
});
$('btnAddColRight').addEventListener('click', () => {
  state.grid.forEach(row => row.push(bgIndex()));
  afterGridStructureChange();
});
$('btnRemoveColLeft').addEventListener('click', () => {
  if (state.grid[0].length > 1) state.grid.forEach(row => row.shift());
  afterGridStructureChange();
});
$('btnRemoveColRight').addEventListener('click', () => {
  if (state.grid[0].length > 1) state.grid.forEach(row => row.pop());
  afterGridStructureChange();
});

function afterGridStructureChange() {
  state.width = state.grid[0].length;
  state.height = state.grid.length;
  renderGridEditor();
  saveProject();
}

$('btnDownloadChart').addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'grafico-croche.png';
  link.href = gridCanvas.toDataURL('image/png');
  link.click();
});

// ---------- Tela 3: Contador ----------
const counterCanvas = $('counterCanvas');
const cctx = counterCanvas.getContext('2d');

function renderCounter() {
  if (!state.grid) return;
  const grid = state.grid;
  const gh = grid.length;
  const gw = grid[0].length;
  counterCanvas.width = gw * CELL_PX + 40;
  counterCanvas.height = gh * CELL_PX;

  $('counterTotal').textContent = gh;

  cctx.clearRect(0, 0, counterCanvas.width, counterCanvas.height);

  const currentFromBottom = state.currentRowFromBottom;
  const currentTopIndex = gh - currentFromBottom;

  for (let y = 0; y < gh; y++) {
    const rowFromBottom = gh - y;
    const isCurrent = rowFromBottom === currentFromBottom;
    const isDone = rowFromBottom < currentFromBottom;
    for (let x = 0; x < gw; x++) {
      cctx.globalAlpha = isDone ? 0.3 : 1;
      cctx.fillStyle = colorForIndex(grid[y][x]);
      cctx.fillRect(x*CELL_PX, y*CELL_PX, CELL_PX, CELL_PX);
      cctx.globalAlpha = 1;
      cctx.strokeStyle = 'rgba(0,0,0,0.12)';
      cctx.lineWidth = 1;
      cctx.strokeRect(x*CELL_PX+0.5, y*CELL_PX+0.5, CELL_PX-1, CELL_PX-1);
    }
    if (isCurrent) {
      cctx.strokeStyle = '#B23A2E';
      cctx.lineWidth = 3;
      cctx.strokeRect(0, y*CELL_PX+1.5, gw*CELL_PX, CELL_PX-3);
    }
  }

  cctx.font = '12px JetBrains Mono, monospace';
  cctx.fillStyle = '#6b6459';
  cctx.textBaseline = 'middle';
  for (let y = 0; y < gh; y++) {
    const rowFromBottom = gh - y;
    cctx.fillText(String(rowFromBottom), gw*CELL_PX + 8, y*CELL_PX + CELL_PX/2);
  }

  const row = grid[currentTopIndex] || [];
  const counts = {};
  row.forEach(idx => { counts[idx] = (counts[idx]||0) + 1; });
  const parts = Object.keys(counts).map(idx => `${counts[idx]} de ${colorForIndex(idx)}`);
  $('counterRowStats').innerHTML = `Carreira ${currentFromBottom}: <strong>${row.length} pontos</strong> (${parts.join(', ')})`;
  $('counterCurrent').textContent = currentFromBottom;

  saveProject();
}

$('btnCounterNext').addEventListener('click', () => {
  state.currentRowFromBottom = Math.min(state.grid.length, state.currentRowFromBottom + 1);
  renderCounter();
});
$('btnCounterPrev').addEventListener('click', () => {
  state.currentRowFromBottom = Math.max(1, state.currentRowFromBottom - 1);
  renderCounter();
});
$('btnCounterReset').addEventListener('click', () => {
  if (confirm('Reiniciar o contador para a carreira 1?')) {
    state.currentRowFromBottom = 1;
    renderCounter();
  }
});
