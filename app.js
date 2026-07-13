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

// Registra o service worker (necessário para o app ser instalável como PWA)
// e força a checagem por uma versão nova sempre que o app é aberto, recarregando
// automaticamente quando essa versão nova assumir o controle da página.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.update(); // verifica ativamente por uma versão nova agora
    }).catch((err) => {
      console.warn('Falha ao registrar service worker:', err);
    });
  });

  let hasReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloaded) return;
    hasReloaded = true;
    window.location.reload();
  });
}

const CELL_PX = 22;
const TOTAL_SCREENS = 5;

const state = {
  projectId: null,
  projectName: '',
  width: 39,
  height: 28,
  grid: null,
  palette: [],
  uploadedImage: null,
  currentRowFromBottom: 1,
  currentScreen: 0,
  hasGeneratedOnce: false, // controla se pode avançar da tela 2 para a 3
};

function $(id) { return document.getElementById(id); }

// ---------- Navegação entre telas ----------
const carousel = $('carousel');
const dots = document.querySelectorAll('.dot');
const btnNavBack = $('btnNavBack');
const btnNavNext = $('btnNavNext');

function maxUnlockedScreen() {
  if (!state.projectId) return 0; // nenhum projeto aberto -> só a lista
  if (state.grid) return 4; // grade já existe (gerada ou restaurada) -> tudo liberado
  if (!state.uploadedImage) return 1; // projeto aberto, mas nada enviado ainda
  return 2; // imagem enviada, mas ainda não gerou grade
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
    btnNavNext.disabled = true; // navegação a partir da lista é por toque no projeto/botão novo
  } else if (n === 1) {
    btnNavNext.textContent = 'Avançar →';
    btnNavNext.disabled = !state.uploadedImage;
  } else if (n === 2) {
    btnNavNext.textContent = 'Avançar →';
    btnNavNext.disabled = !state.hasGeneratedOnce;
  } else if (n === 3) {
    btnNavNext.textContent = 'Ir para o contador →';
    btnNavNext.disabled = !state.grid;
  } else if (n === 4) {
    btnNavNext.textContent = '✓ Fim do fluxo';
    btnNavNext.disabled = true;
  }
}

btnNavNext.addEventListener('click', () => {
  if (state.currentScreen === 2 && !state.hasGeneratedOnce) return;
  if (state.currentScreen === 3) {
    // Ao ir da tela 3 (bordas) pra 4 (contador), garante que o contador renderize com dados atuais
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
      if (idx === 4) renderCounter();
    }
  }, 80);
});

dots.forEach((dot, i) => {
  dot.style.cursor = 'pointer';
  dot.addEventListener('click', () => {
    if (i <= maxUnlockedScreen()) {
      goToScreen(i);
      if (i === 4) renderCounter();
      if (i === 0) renderProjectsList();
    }
  });
});

// ---------- Persistência (múltiplos projetos) ----------
const PROJECTS_INDEX_KEY = 'croche_pixel_projetos_index';
const PROJECT_PREFIX = 'croche_pixel_projeto_';

function getProjectsIndex() {
  try {
    const raw = localStorage.getItem(PROJECTS_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveProjectsIndex(index) {
  try {
    localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(index));
  } catch (e) {
    console.warn('Não foi possível salvar o índice de projetos:', e);
  }
}

function generateProjectId() {
  return 'p' + Date.now() + Math.random().toString(36).slice(2, 8);
}

function saveProject() {
  if (!state.projectId) return;
  try {
    const payload = {
      id: state.projectId,
      name: state.projectName,
      width: state.width,
      height: state.height,
      grid: state.grid,
      palette: state.palette,
      currentRowFromBottom: state.currentRowFromBottom,
      savedAt: Date.now(),
    };
    localStorage.setItem(PROJECT_PREFIX + state.projectId, JSON.stringify(payload));

    // Atualiza o índice (nome, data, id) para a lista de projetos
    const index = getProjectsIndex();
    const existing = index.find(p => p.id === state.projectId);
    if (existing) {
      existing.name = state.projectName;
      existing.savedAt = payload.savedAt;
      existing.width = state.width;
      existing.height = state.height;
    } else {
      index.push({ id: state.projectId, name: state.projectName, savedAt: payload.savedAt, width: state.width, height: state.height });
    }
    saveProjectsIndex(index);
    flashSaveIndicator();
  } catch (e) {
    console.warn('Não foi possível salvar o projeto:', e);
  }
}

function loadProjectById(id) {
  try {
    const raw = localStorage.getItem(PROJECT_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function deleteProjectById(id) {
  try {
    localStorage.removeItem(PROJECT_PREFIX + id);
    const index = getProjectsIndex().filter(p => p.id !== id);
    saveProjectsIndex(index);
  } catch (e) {
    console.warn('Não foi possível excluir o projeto:', e);
  }
}

let saveFlashTimeout = null;
function flashSaveIndicator() {
  const el = $('saveIndicator');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(saveFlashTimeout);
  saveFlashTimeout = setTimeout(() => el.classList.remove('show'), 1200);
}

// ---------- Inicialização: mostra a lista de projetos ----------
window.addEventListener('DOMContentLoaded', () => {
  renderProjectsList();
  updateNavUI();
});

function renderProjectsList() {
  const index = getProjectsIndex().sort((a, b) => b.savedAt - a.savedAt);
  const listEl = $('projectsList');
  const emptyEl = $('projectsEmpty');
  if (!listEl) return;

  listEl.innerHTML = '';
  if (index.length === 0) {
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');

  index.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'project-item';
    const date = new Date(p.savedAt);
    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    item.innerHTML = `
      <div class="project-item-info">
        <div class="project-item-name">${escapeHtml(p.name || 'Projeto sem nome')}</div>
        <div class="project-item-meta">${p.width} × ${p.height} pontos · ${dateStr}</div>
      </div>
      <button class="project-item-delete" aria-label="Excluir projeto" data-id="${p.id}">🗑</button>
    `;
    item.querySelector('.project-item-info').addEventListener('click', () => openProject(p.id));
    item.querySelector('.project-item-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Excluir o projeto "${p.name || 'sem nome'}"? Essa ação não pode ser desfeita.`)) {
        deleteProjectById(p.id);
        renderProjectsList();
      }
    });
    listEl.appendChild(item);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openProject(id) {
  const saved = loadProjectById(id);
  if (!saved || !saved.grid) return;
  state.projectId = saved.id;
  state.projectName = saved.name;
  state.width = saved.width;
  state.height = saved.height;
  state.grid = saved.grid;
  state.palette = saved.palette || [];
  state.currentRowFromBottom = saved.currentRowFromBottom || 1;
  state.hasGeneratedOnce = true;
  undoStack = [];

  $('projectNote').classList.remove('hidden');
  $('projectNote').textContent = `Projeto: ${state.projectName}`;

  renderGridEditor();
  goToScreen(4, { instant: true });
  renderCounter();
}

$('btnNewProjectFromList').addEventListener('click', () => {
  startNewProject();
});

function startNewProject() {
  state.projectId = generateProjectId();
  state.projectName = suggestProjectName();
  state.grid = null;
  state.palette = [];
  state.uploadedImage = null;
  state.hasGeneratedOnce = false;
  state.currentRowFromBottom = 1;
  undoStack = [];
  $('uploadPreviewWrap').classList.add('hidden');
  $('quickPreviewWrap').classList.add('hidden');
  $('projectNote').classList.add('hidden');
  $('fileInput').value = '';
  goToScreen(1, { instant: true });
}

function suggestProjectName() {
  const index = getProjectsIndex();
  let n = index.length + 1;
  let name = `Projeto ${n}`;
  const existingNames = new Set(index.map(p => p.name));
  while (existingNames.has(name)) {
    n++;
    name = `Projeto ${n}`;
  }
  return name;
}

$('btnNewProject').addEventListener('click', () => {
  if (confirm('Voltar para a lista de projetos? O projeto atual já está salvo.')) {
    renderProjectsList();
    goToScreen(0, { instant: true });
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

const colorCountSelect = $('colorCountSelect');

btnStartGrid.addEventListener('click', () => {
  if (!state.uploadedImage) return;
  const w = Math.max(1, Math.min(200, parseInt(widthInput.value || '39', 10)));
  const h = Math.max(1, Math.min(200, parseInt(heightInput.value || '28', 10)));
  const numColors = Math.max(2, Math.min(6, parseInt(colorCountSelect.value || '2', 10)));
  state.width = w;
  state.height = h;

  const { grid, palette } = sampleImageToGrid(state.uploadedImage, w, h, numColors);
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
function sampleImageToGrid(img, w, h, numColors) {
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

  const k = Math.max(2, Math.min(6, numColors || 2));
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
const LABEL_MARGIN = 26; // espaço reservado para os números clicáveis

// Seleção atual: { type: 'row'|'col', index: number } ou null
let selectedLine = null;

function colorForIndex(idx) {
  return state.palette[idx] || '#cccccc';
}

function renderGridEditor() {
  if (!state.grid) return;
  const grid = state.grid;
  const gh = grid.length;
  const gw = grid[0].length;
  gridCanvas.width = gw * CELL_PX + LABEL_MARGIN;
  gridCanvas.height = gh * CELL_PX + LABEL_MARGIN;

  gctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);

  // Destaque de fundo da linha/coluna selecionada (desenhado antes das células)
  if (selectedLine) {
    gctx.fillStyle = 'rgba(178,58,46,0.18)';
    if (selectedLine.type === 'row') {
      gctx.fillRect(0, selectedLine.index * CELL_PX, gw * CELL_PX, CELL_PX);
    } else {
      gctx.fillRect(selectedLine.index * CELL_PX, 0, CELL_PX, gh * CELL_PX);
    }
  }

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

  // Área dos números: linhas à direita, colunas embaixo
  gctx.font = '11px JetBrains Mono, monospace';
  gctx.textAlign = 'center';
  gctx.textBaseline = 'middle';

  for (let y = 0; y < gh; y++) {
    const rowNumber = y + 1;
    const isSelected = selectedLine && selectedLine.type === 'row' && selectedLine.index === y;
    gctx.fillStyle = isSelected ? '#B23A2E' : '#6b6459';
    gctx.font = isSelected ? 'bold 11px JetBrains Mono, monospace' : '11px JetBrains Mono, monospace';
    gctx.fillText(String(rowNumber), gw*CELL_PX + LABEL_MARGIN/2, y*CELL_PX + CELL_PX/2);
  }
  for (let x = 0; x < gw; x++) {
    const colNumber = x + 1;
    const isSelected = selectedLine && selectedLine.type === 'col' && selectedLine.index === x;
    gctx.fillStyle = isSelected ? '#B23A2E' : '#6b6459';
    gctx.font = isSelected ? 'bold 11px JetBrains Mono, monospace' : '11px JetBrains Mono, monospace';
    gctx.fillText(String(colNumber), x*CELL_PX + CELL_PX/2, gh*CELL_PX + LABEL_MARGIN/2);
  }

  updateGridStats();
}

gridCanvas.addEventListener('click', (e) => {
  const rect = gridCanvas.getBoundingClientRect();
  const scaleX = gridCanvas.width / rect.width;
  const scaleY = gridCanvas.height / rect.height;
  const clickX = (e.clientX - rect.left) * scaleX;
  const clickY = (e.clientY - rect.top) * scaleY;

  const gw = state.grid[0].length;
  const gh = state.grid.length;
  const gridPixelW = gw * CELL_PX;
  const gridPixelH = gh * CELL_PX;

  // Clique na área de números de coluna (embaixo da grade)
  if (clickY > gridPixelH && clickX < gridPixelW) {
    const col = Math.floor(clickX / CELL_PX);
    if (col >= 0 && col < gw) {
      selectedLine = { type: 'col', index: col };
      showSelectionBar();
      renderGridEditor();
    }
    return;
  }
  // Clique na área de números de linha (à direita da grade)
  if (clickX > gridPixelW && clickY < gridPixelH) {
    const row = Math.floor(clickY / CELL_PX);
    if (row >= 0 && row < gh) {
      selectedLine = { type: 'row', index: row };
      showSelectionBar();
      renderGridEditor();
    }
    return;
  }
  // Clique dentro da grade (numa célula específica) -> abre o seletor de cor
  if (clickX < gridPixelW && clickY < gridPixelH) {
    const col = Math.floor(clickX / CELL_PX);
    const row = Math.floor(clickY / CELL_PX);
    if (row >= 0 && row < gh && col >= 0 && col < gw) {
      openCellColorModal(row, col);
    }
    return;
  }
});

// ---------- Modal de cor de célula específica ----------
let cellBeingEdited = null; // { row, col }

function openCellColorModal(row, col) {
  cellBeingEdited = { row, col };
  $('cellColorModalTitle').textContent = `Carreira ${row + 1}, ponto ${col + 1}`;

  const swatchesEl = $('cellColorSwatches');
  swatchesEl.innerHTML = '';
  const currentColorIndex = state.grid[row][col];

  state.palette.forEach((hex, idx) => {
    const swatch = document.createElement('div');
    swatch.className = 'cell-color-swatch' + (idx === currentColorIndex ? ' current' : '');
    swatch.style.background = hex;
    if (idx === currentColorIndex) swatch.textContent = '✓';
    swatch.addEventListener('click', () => applyCellColor(idx));
    swatchesEl.appendChild(swatch);
  });

  $('cellColorModal').classList.remove('hidden');
}

function closeCellColorModal() {
  $('cellColorModal').classList.add('hidden');
  cellBeingEdited = null;
}

function applyCellColor(colorIndex) {
  if (!cellBeingEdited) return;
  const { row, col } = cellBeingEdited;
  if (state.grid[row][col] !== colorIndex) {
    pushUndoSnapshot();
    state.grid[row][col] = colorIndex;
    renderGridEditor();
    saveProject();
  }
  closeCellColorModal();
}

$('btnCancelCellColor').addEventListener('click', closeCellColorModal);
$('cellColorModalBackdrop').addEventListener('click', closeCellColorModal);

function showSelectionBar() {
  if (!selectedLine) {
    $('selectionBar').classList.add('hidden');
    return;
  }
  const label = selectedLine.type === 'row'
    ? `Carreira ${selectedLine.index + 1} selecionada`
    : `Coluna ${selectedLine.index + 1} selecionada`;
  $('selectionLabel').textContent = label;
  $('selectionBar').classList.remove('hidden');
}

$('btnCancelSelection').addEventListener('click', () => {
  selectedLine = null;
  $('selectionBar').classList.add('hidden');
  renderGridEditor();
});

$('btnDeleteSelection').addEventListener('click', () => {
  if (!selectedLine) return;
  const grid = state.grid;
  if (selectedLine.type === 'row') {
    if (grid.length <= 1) { alert('Não é possível excluir a única carreira restante.'); return; }
    pushUndoSnapshot();
    grid.splice(selectedLine.index, 1);
  } else {
    if (grid[0].length <= 1) { alert('Não é possível excluir a única coluna restante.'); return; }
    pushUndoSnapshot();
    grid.forEach(row => row.splice(selectedLine.index, 1));
  }
  selectedLine = null;
  $('selectionBar').classList.add('hidden');
  afterGridStructureChange();
});

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

// ---------- Desfazer (undo) ----------
// Guarda uma cópia da grade antes de cada alteração estrutural, para poder reverter.
let undoStack = [];
const UNDO_LIMIT = 10;

function pushUndoSnapshot() {
  undoStack.push(JSON.parse(JSON.stringify(state.grid)));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  updateUndoButton();
}

function updateUndoButton() {
  const btn = $('btnUndo');
  if (!btn) return;
  btn.disabled = undoStack.length === 0;
}

$('btnUndo').addEventListener('click', () => {
  if (undoStack.length === 0) return;
  state.grid = undoStack.pop();
  state.width = state.grid[0].length;
  state.height = state.grid.length;
  selectedLine = null;
  $('selectionBar').classList.add('hidden');
  renderGridEditor();
  saveProject();
  updateUndoButton();
});

$('btnAddRowTop').addEventListener('click', () => {
  pushUndoSnapshot();
  state.grid.unshift(new Array(state.grid[0].length).fill(bgIndex()));
  afterGridStructureChange();
});
$('btnAddRowBottom').addEventListener('click', () => {
  pushUndoSnapshot();
  state.grid.push(new Array(state.grid[0].length).fill(bgIndex()));
  afterGridStructureChange();
});
$('btnRemoveRowTop').addEventListener('click', () => {
  if (state.grid.length > 1) {
    pushUndoSnapshot();
    state.grid.shift();
  }
  afterGridStructureChange();
});
$('btnRemoveRowBottom').addEventListener('click', () => {
  if (state.grid.length > 1) {
    pushUndoSnapshot();
    state.grid.pop();
  }
  afterGridStructureChange();
});
$('btnAddColLeft').addEventListener('click', () => {
  pushUndoSnapshot();
  state.grid.forEach(row => row.unshift(bgIndex()));
  afterGridStructureChange();
});
$('btnAddColRight').addEventListener('click', () => {
  pushUndoSnapshot();
  state.grid.forEach(row => row.push(bgIndex()));
  afterGridStructureChange();
});
$('btnRemoveColLeft').addEventListener('click', () => {
  if (state.grid[0].length > 1) {
    pushUndoSnapshot();
    state.grid.forEach(row => row.shift());
  }
  afterGridStructureChange();
});
$('btnRemoveColRight').addEventListener('click', () => {
  if (state.grid[0].length > 1) {
    pushUndoSnapshot();
    state.grid.forEach(row => row.pop());
  }
  afterGridStructureChange();
});

function afterGridStructureChange() {
  state.width = state.grid[0].length;
  state.height = state.grid.length;
  selectedLine = null;
  $('selectionBar').classList.add('hidden');
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
