const storageKey = "our-time-gallery:v1";

const starCanvas = document.querySelector("#starCanvas");
const constellationCanvas = document.querySelector("#constellationCanvas");
const uploadForm = document.querySelector("#uploadForm");
const photoInput = document.querySelector("#photoInput");
const ownerInput = document.querySelector("#ownerInput");
const dateInput = document.querySelector("#dateInput");
const photoDateHint = document.querySelector("#photoDateHint");
const captionInput = document.querySelector("#captionInput");
const dropZone = document.querySelector("#dropZone");
const photoPreview = document.querySelector("#photoPreview");
const fileName = document.querySelector("#fileName");
const timeSlider = document.querySelector("#timeSlider");
const playButton = document.querySelector("#playButton");
const seedButton = document.querySelector("#seedButton");
const clearButton = document.querySelector("#clearButton");
const spaceViewport = document.querySelector("#spaceViewport");
const memorySpace = document.querySelector("#memorySpace");
const emptyState = document.querySelector("#emptyState");
const currentMemory = document.querySelector("#currentMemory");
const memoryCount = document.querySelector("#memoryCount");
const activeDate = document.querySelector("#activeDate");
const shipPosition = document.querySelector("#shipPosition");
const timeline = document.querySelector("#timeline");
const nodeTemplate = document.querySelector("#memoryNodeTemplate");
const timelineTemplate = document.querySelector("#timelineItemTemplate");

const storedMemories = localStorage.getItem(storageKey);
let memories = storedMemories === null ? createTestMemories(100) : loadMemories(storedMemories);
let activeIndex = 0;
let playTimer = null;
let previewUrl = null;
let dateWasManuallyEdited = false;
let selectedPhotoToken = 0;
let autoTour = false;
let tourIndex = 0;
let lastFrameTime = 0;

const scene = {
  width: 0,
  height: 0,
  centerX: 0,
  centerY: 0,
  focal: 800,
};

const camera = {
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
};

const pointer = {
  isLooking: false,
};

const keys = new Set();
const stars = [];
const starContext = starCanvas.getContext("2d");
const lineContext = constellationCanvas.getContext("2d");
let memoryNodes = [];
let logRows = [];
let projectedMemories = [];

dateInput.valueAsDate = new Date();
setupCanvases();
createStars();
bindEvents();
renderData({ warpToActive: true });

if (storedMemories === null) {
  saveMemories();
}

window.requestAnimationFrame(renderFrame);

function bindEvents() {
  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const file = photoInput.files[0];
    if (!file) return;

    const imageData = await readImage(file);
    const memory = {
      id: createId(),
      owner: ownerInput.value,
      date: dateInput.value,
      caption: captionInput.value.trim() || "말없이도 오래 기억될 순간",
      imageData,
      isTestMemory: false,
    };

    memories = [...memories, memory].sort(compareByDate);
    activeIndex = memories.findIndex((item) => item.id === memory.id);
    resetUploadForm();
    saveMemories();
    renderData({ warpToActive: true });
  });

  photoInput.addEventListener("change", handlePhotoSelection);

  dateInput.addEventListener("input", () => {
    dateWasManuallyEdited = true;
    setPhotoDateHint("직접 설정한 날짜가 저장됩니다.");
  });

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
  });

  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("is-dragging");
  });

  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");

    const file = [...event.dataTransfer.files].find((item) =>
      item.type.startsWith("image/")
    );
    if (!file) return;

    const transfer = new DataTransfer();
    transfer.items.add(file);
    photoInput.files = transfer.files;
    handlePhotoSelection();
  });

  timeSlider.addEventListener("input", () => {
    stopAutoTour();
    setActiveIndex(Number(timeSlider.value), { warp: true });
  });

  playButton.addEventListener("click", () => {
    if (autoTour) {
      stopAutoTour();
      return;
    }

    if (!memories.length) return;

    autoTour = true;
    tourIndex = activeIndex;
    playButton.textContent = "순항 정지";
  });

  seedButton.addEventListener("click", () => {
    stopAutoTour();
    const generatedMemories = createTestMemories(100);
    memories = [
      ...memories.filter((memory) => !memory.isTestMemory),
      ...generatedMemories,
    ].sort(compareByDate);
    activeIndex = memories.findIndex((memory) => memory.id === generatedMemories[0].id);
    saveMemories();
    renderData({ warpToActive: true });
  });

  clearButton.addEventListener("click", () => {
    if (!memories.length) return;

    const confirmed = window.confirm(
      "올린 사진 기록과 테스트 사진을 이 브라우저에서 모두 삭제할까요?"
    );
    if (!confirmed) return;

    memories = [];
    activeIndex = 0;
    stopAutoTour();
    saveMemories();
    renderData();
  });

  spaceViewport.addEventListener("pointerdown", (event) => {
    if (isInteractiveTarget(event.target)) return;

    pointer.isLooking = true;
    stopAutoTour();
    spaceViewport.focus({ preventScroll: true });
    spaceViewport.classList.add("is-dragging");
    spaceViewport.setPointerCapture(event.pointerId);
  });

  spaceViewport.addEventListener("pointermove", (event) => {
    if (!pointer.isLooking) return;

    camera.yaw += event.movementX * 0.0026;
    camera.pitch = clamp(camera.pitch - event.movementY * 0.0024, -1.08, 1.08);
  });

  spaceViewport.addEventListener("pointerup", endLook);
  spaceViewport.addEventListener("pointercancel", endLook);

  spaceViewport.addEventListener(
    "wheel",
    (event) => {
      if (isInteractiveTarget(event.target)) return;

      event.preventDefault();
      stopAutoTour();
      moveAlongForward(event.deltaY > 0 ? 520 : -520);
    },
    { passive: false }
  );

  window.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) return;

    const key = normalizeKey(event);
    if (!key) return;

    keys.add(key);
    if (isFlightKey(key)) {
      event.preventDefault();
      stopAutoTour();
      spaceViewport.focus({ preventScroll: true });
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = normalizeKey(event);
    if (key) keys.delete(key);
  });

  window.addEventListener("resize", setupCanvases);
}

function renderData({ warpToActive = false } = {}) {
  memories = memories.sort(compareByDate);
  activeIndex = clamp(activeIndex, 0, Math.max(memories.length - 1, 0));
  timeSlider.max = String(Math.max(memories.length - 1, 0));
  timeSlider.value = String(activeIndex);

  assignWorldPositions();
  renderMemoryNodes();
  renderTimeline();
  emptyState.classList.toggle("is-hidden", memories.length > 0);

  if (memories.length && warpToActive) {
    warpToMemory(activeIndex);
  }

  updateActiveViews();
}

function assignWorldPositions() {
  memories.forEach((memory, index) => {
    const angle = index * 0.72;
    const drift = Math.sin(index * 0.17) * 260;
    const verticalBand = ((index % 9) - 4) * 165;
    const verticalWave = Math.sin(index * 0.43) * 180 + Math.cos(index * 0.19) * 90;

    memory.world = {
      x: Math.sin(angle) * 820 + drift,
      y: verticalBand + verticalWave,
      z: -900 - index * 330,
    };
  });
}

function renderMemoryNodes() {
  memorySpace.innerHTML = "";
  memoryNodes = [];

  memories.forEach((memory, index) => {
    const node = nodeTemplate.content.firstElementChild.cloneNode(true);
    const image = node.querySelector("img");
    const date = node.querySelector(".node-date");
    const caption = node.querySelector("strong");

    image.src = memory.imageData;
    image.alt = memory.caption;
    date.textContent = `${formatShortDate(memory.date)} · ${memory.owner}`;
    caption.textContent = memory.caption;

    node.addEventListener("click", (event) => {
      event.stopPropagation();
      stopAutoTour();
      setActiveIndex(index);
    });

    node.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      stopAutoTour();
      setActiveIndex(index, { warp: true });
    });

    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      stopAutoTour();
      setActiveIndex(index, { warp: true });
    });

    memorySpace.append(node);
    memoryNodes[index] = node;
  });
}

function renderTimeline() {
  timeline.innerHTML = "";
  logRows = [];

  memories.forEach((memory, index) => {
    const item = timelineTemplate.content.firstElementChild.cloneNode(true);
    const selectButton = item.querySelector(".log-row__select");
    const deleteButton = item.querySelector(".log-row__delete");
    const image = item.querySelector("img");
    const date = item.querySelector(".memory-card__date");
    const title = item.querySelector("strong");
    const caption = item.querySelector("em");

    image.src = memory.imageData;
    image.alt = memory.caption;
    date.textContent = `${formatDate(memory.date)} · ${memory.owner}`;
    title.textContent = `${index + 1}번째 좌표`;
    caption.textContent = memory.caption;

    selectButton.addEventListener("click", () => {
      stopAutoTour();
      setActiveIndex(index, { warp: true });
    });

    deleteButton.addEventListener("click", () => {
      memories = memories.filter((item) => item.id !== memory.id);
      activeIndex = clamp(activeIndex, 0, Math.max(memories.length - 1, 0));
      saveMemories();
      renderData({ warpToActive: true });
    });

    timeline.append(item);
    logRows[index] = item;
  });
}

function renderFrame(timestamp) {
  const deltaSeconds = Math.min((timestamp - lastFrameTime) / 1000 || 0, 0.05);
  lastFrameTime = timestamp;

  updateCamera(deltaSeconds);
  drawScene();
  window.requestAnimationFrame(renderFrame);
}

function updateCamera(deltaSeconds) {
  if (autoTour) {
    updateAutoTour(deltaSeconds);
    return;
  }

  const speed = keys.has("shift") ? 1850 : 760;
  const turnSpeed = 1.75;
  const forward = getForwardVector();
  const right = getRightVector();
  let moved = false;

  if (keys.has("arrowleft")) camera.yaw -= turnSpeed * deltaSeconds;
  if (keys.has("arrowright")) camera.yaw += turnSpeed * deltaSeconds;
  if (keys.has("arrowup")) camera.pitch = clamp(camera.pitch + turnSpeed * deltaSeconds, -1.08, 1.08);
  if (keys.has("arrowdown")) camera.pitch = clamp(camera.pitch - turnSpeed * deltaSeconds, -1.08, 1.08);

  if (keys.has("w")) {
    moveCamera(forward, speed * deltaSeconds);
    moved = true;
  }

  if (keys.has("s")) {
    moveCamera(forward, -speed * deltaSeconds);
    moved = true;
  }

  if (keys.has("d")) {
    moveCamera(right, speed * deltaSeconds);
    moved = true;
  }

  if (keys.has("a")) {
    moveCamera(right, -speed * deltaSeconds);
    moved = true;
  }

  if (keys.has("q")) {
    camera.y -= speed * deltaSeconds;
    moved = true;
  }

  if (keys.has("e")) {
    camera.y += speed * deltaSeconds;
    moved = true;
  }

  if (moved) {
    camera.z = Math.min(camera.z, 1400);
  }
}

function updateAutoTour(deltaSeconds) {
  if (!memories.length) {
    stopAutoTour();
    return;
  }

  const memory = memories[tourIndex];
  const target = {
    x: memory.world.x,
    y: memory.world.y,
    z: memory.world.z + 820,
  };
  const easing = Math.min(deltaSeconds * 1.2, 0.08);

  camera.x += (target.x - camera.x) * easing;
  camera.y += (target.y - camera.y) * easing;
  camera.z += (target.z - camera.z) * easing;
  camera.yaw += (0 - camera.yaw) * easing;
  camera.pitch += (0 - camera.pitch) * easing;

  const distance = getDistance(camera, target);
  if (distance < 36) {
    setActiveIndex(tourIndex);
    tourIndex = (tourIndex + 1) % memories.length;
  }
}

function drawScene() {
  clearCanvases();
  drawStarfield();
  projectedMemories = memories.map((memory) => projectWorld(memory.world));
  updateActiveFromView();
  drawConstellationLines();
  updateMemoryNodePositions();
  updateShipReadout();
}

function clearCanvases() {
  starContext.clearRect(0, 0, scene.width, scene.height);
  lineContext.clearRect(0, 0, scene.width, scene.height);
}

function drawStarfield() {
  starContext.save();

  stars.forEach((star) => {
    const projected = projectWorld(star);
    if (!projected.visible) return;

    const radius = clamp(projected.scale * star.size * 1.2, 0.35, 2.4);
    const alpha = clamp(1 - projected.depth / 52000, 0.08, 0.95);

    starContext.beginPath();
    starContext.fillStyle = star.color;
    starContext.globalAlpha = alpha;
    starContext.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    starContext.fill();
  });

  starContext.restore();
}

function drawConstellationLines() {
  if (projectedMemories.length < 2) return;

  lineContext.save();
  lineContext.lineCap = "round";
  lineContext.lineJoin = "round";

  for (let index = 0; index < projectedMemories.length - 1; index += 1) {
    const from = projectedMemories[index];
    const to = projectedMemories[index + 1];
    if (!from.visible || !to.visible) continue;
    if (!isNearScreen(from, 220) && !isNearScreen(to, 220)) continue;

    const activeSegment = index === activeIndex || index + 1 === activeIndex;
    const alpha = activeSegment ? 0.86 : clamp(Math.min(from.opacity, to.opacity) * 0.42, 0.08, 0.42);
    const width = activeSegment
      ? clamp((from.scale + to.scale) * 1.9, 1.4, 4.2)
      : clamp((from.scale + to.scale) * 1.1, 0.55, 2.4);

    lineContext.strokeStyle = activeSegment
      ? `rgba(255, 224, 138, ${alpha})`
      : `rgba(124, 244, 255, ${alpha})`;
    lineContext.shadowColor = activeSegment ? "rgba(255, 224, 138, 0.8)" : "rgba(124, 244, 255, 0.68)";
    lineContext.shadowBlur = activeSegment ? 24 : 16;
    lineContext.lineWidth = width;
    lineContext.beginPath();
    lineContext.moveTo(from.x, from.y);
    lineContext.lineTo(to.x, to.y);
    lineContext.stroke();
  }

  projectedMemories.forEach((point, index) => {
    if (!point.visible || !isNearScreen(point, 160)) return;

    const active = index === activeIndex;
    const radius = active ? clamp(point.scale * 9, 5, 14) : clamp(point.scale * 4, 2, 7);

    lineContext.beginPath();
    lineContext.fillStyle = active
      ? "rgba(255, 224, 138, 0.95)"
      : `rgba(124, 244, 255, ${clamp(point.opacity, 0.25, 0.75)})`;
    lineContext.shadowColor = active ? "rgba(255, 224, 138, 0.9)" : "rgba(124, 244, 255, 0.75)";
    lineContext.shadowBlur = active ? 30 : 18;
    lineContext.arc(point.x, point.y, radius, 0, Math.PI * 2);
    lineContext.fill();
  });

  lineContext.restore();
}

function updateMemoryNodePositions() {
  memoryNodes.forEach((node, index) => {
    const projected = projectedMemories[index];
    const hidden = !projected.visible || !isNearScreen(projected, 320) || projected.depth > 11000;

    node.classList.toggle("is-hidden", hidden);
    node.classList.toggle("is-active", index === activeIndex);
    if (hidden) return;

    const nodeScale = clamp(projected.scale * 1.28, 0.18, 1.55);
    const opacity = clamp(projected.opacity, 0.16, 1);

    node.style.setProperty("--screen-x", `${projected.x}px`);
    node.style.setProperty("--screen-y", `${projected.y}px`);
    node.style.setProperty("--node-scale", nodeScale.toFixed(3));
    node.style.setProperty("--opacity", opacity.toFixed(3));
    node.style.setProperty("--glow-scale", clamp(projected.scale * 1.35, 0.65, 1.55).toFixed(3));
    node.style.zIndex = String(Math.round(12000 - projected.depth));
  });
}

function updateActiveFromView() {
  if (!memories.length || autoTour) return;

  let bestIndex = activeIndex;
  let bestScore = Infinity;

  projectedMemories.forEach((point, index) => {
    if (!point.visible || !isNearScreen(point, 220)) return;

    const centerDistance = Math.hypot(point.x - scene.centerX, point.y - scene.centerY);
    const score = centerDistance / clamp(point.scale, 0.3, 2.2) + point.depth * 0.018;

    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  if (bestScore < 680 && bestIndex !== activeIndex) {
    setActiveIndex(bestIndex);
  }
}

function setActiveIndex(nextIndex, { warp = false } = {}) {
  if (!memories.length) return;

  activeIndex = clamp(nextIndex, 0, memories.length - 1);
  timeSlider.value = String(activeIndex);

  if (warp) {
    warpToMemory(activeIndex);
  }

  updateActiveViews();
}

function updateActiveViews() {
  updateStats();
  renderCurrentMemory();

  memoryNodes.forEach((node, index) => {
    node.classList.toggle("is-active", index === activeIndex);
  });

  logRows.forEach((row, index) => {
    row.classList.toggle("is-active", index === activeIndex);
  });
}

function updateStats() {
  memoryCount.textContent = `${memories.length}개의 사진 신호`;
  activeDate.textContent = memories.length
    ? formatDate(memories[activeIndex].date)
    : "대기 중";
}

function renderCurrentMemory() {
  if (!memories.length) {
    currentMemory.innerHTML = `
      <p class="eyebrow">Current Signal</p>
      <h2>가까운 사진 신호가 없습니다.</h2>
      <p>사진을 향해 이동하면 이곳에 현재 바라보는 기억이 표시됩니다.</p>
    `;
    return;
  }

  const memory = memories[activeIndex];
  currentMemory.innerHTML = `
    <div class="current-memory__meta">
      <span>${formatDate(memory.date)}</span>
      <span>${escapeHtml(memory.owner)}</span>
      <span>${activeIndex + 1} / ${memories.length}</span>
    </div>
    <h2>${escapeHtml(memory.caption)}</h2>
    <p>WASD 이동 · 마우스 드래그 시점 회전 · 휠 전진/후진 · 더블클릭 워프</p>
  `;
}

function updateShipReadout() {
  shipPosition.textContent = `X ${Math.round(camera.x)} · Y ${Math.round(camera.y)} · Z ${Math.round(camera.z)}`;
}

function warpToMemory(index) {
  const memory = memories[index];
  if (!memory?.world) return;

  camera.x = memory.world.x;
  camera.y = memory.world.y;
  camera.z = memory.world.z + 820;
  camera.yaw = 0;
  camera.pitch = 0;
}

function moveCamera(vector, amount) {
  camera.x += vector.x * amount;
  camera.y += vector.y * amount;
  camera.z += vector.z * amount;
}

function moveAlongForward(amount) {
  moveCamera(getForwardVector(), amount);
}

function getForwardVector() {
  const cosPitch = Math.cos(camera.pitch);

  return {
    x: Math.sin(camera.yaw) * cosPitch,
    y: Math.sin(camera.pitch),
    z: -Math.cos(camera.yaw) * cosPitch,
  };
}

function getRightVector() {
  return {
    x: Math.cos(camera.yaw),
    y: 0,
    z: Math.sin(camera.yaw),
  };
}

function projectWorld(point) {
  const dx = point.x - camera.x;
  const dy = point.y - camera.y;
  const dz = point.z - camera.z;
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);

  const x1 = dx * cosYaw + dz * sinYaw;
  const z1 = -dx * sinYaw + dz * cosYaw;
  const y2 = dy * cosPitch + z1 * sinPitch;
  const z2 = -dy * sinPitch + z1 * cosPitch;
  const depth = -z2;
  const visible = depth > 60;
  const scale = visible ? scene.focal / depth : 0;
  const x = scene.centerX + x1 * scale;
  const y = scene.centerY - y2 * scale;
  const opacity = clamp(1 - depth / 12500, 0.06, 1);

  return { x, y, depth, scale, visible, opacity };
}

function setupCanvases() {
  const pixelRatio = window.devicePixelRatio || 1;
  scene.width = window.innerWidth;
  scene.height = window.innerHeight;
  scene.centerX = scene.width / 2;
  scene.centerY = scene.height / 2;
  scene.focal = Math.min(scene.width, scene.height) * 0.92;

  [starCanvas, constellationCanvas].forEach((canvas) => {
    canvas.width = Math.floor(scene.width * pixelRatio);
    canvas.height = Math.floor(scene.height * pixelRatio);
    canvas.style.width = `${scene.width}px`;
    canvas.style.height = `${scene.height}px`;
  });

  starContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  lineContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function createStars() {
  stars.length = 0;

  for (let index = 0; index < 560; index += 1) {
    stars.push({
      x: Math.random() * 16000 - 8000,
      y: Math.random() * 9000 - 4500,
      z: Math.random() * -62000 + 5000,
      size: index % 53 === 0 ? Math.random() * 2.2 + 2.2 : Math.random() * 1.6 + 0.45,
      color: ["#ffffff", "#7cf4ff", "#ffe08a", "#ffb5eb"][Math.floor(Math.random() * 4)],
    });
  }
}

function endLook(event) {
  if (!pointer.isLooking) return;

  pointer.isLooking = false;
  spaceViewport.classList.remove("is-dragging");

  if (spaceViewport.hasPointerCapture(event.pointerId)) {
    spaceViewport.releasePointerCapture(event.pointerId);
  }
}

function handlePhotoSelection() {
  const file = photoInput.files[0];
  updatePhotoPreview(file);
  updateDateFromPhoto(file);
}

function updatePhotoPreview(file = photoInput.files[0]) {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  if (!file) {
    dropZone.classList.remove("has-preview");
    photoPreview.style.backgroundImage = "";
    fileName.textContent = "사진 선택 또는 드래그";
    setPhotoDateHint("사진 정보에 촬영일이 있으면 자동 입력됩니다.");
    return;
  }

  previewUrl = URL.createObjectURL(file);
  dropZone.classList.add("has-preview");
  photoPreview.style.backgroundImage = `url("${previewUrl}")`;
  fileName.textContent = file.name;
}

async function updateDateFromPhoto(file) {
  selectedPhotoToken += 1;
  const photoToken = selectedPhotoToken;
  dateWasManuallyEdited = false;

  if (!file) return;

  setPhotoDateHint("사진 촬영일을 확인하는 중입니다.");

  try {
    const takenDate = await extractImageTakenDate(file);
    if (photoToken !== selectedPhotoToken) return;

    if (!takenDate) {
      setPhotoDateHint("촬영일 정보가 없어서 현재 날짜를 유지합니다.");
      return;
    }

    if (dateWasManuallyEdited) {
      setPhotoDateHint("촬영일을 찾았지만 직접 설정한 날짜를 유지합니다.");
      return;
    }

    dateInput.value = takenDate;
    setPhotoDateHint("사진 촬영일로 날짜를 자동 설정했습니다. 원하면 직접 바꿀 수 있습니다.");
  } catch {
    if (photoToken === selectedPhotoToken) {
      setPhotoDateHint("촬영일을 읽지 못해 현재 날짜를 유지합니다.");
    }
  }
}

function resetUploadForm() {
  uploadForm.reset();
  dateInput.valueAsDate = new Date();

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  dropZone.classList.remove("has-preview");
  photoPreview.style.backgroundImage = "";
  fileName.textContent = "사진 선택 또는 드래그";
  dateWasManuallyEdited = false;
  selectedPhotoToken += 1;
  setPhotoDateHint("사진 정보에 촬영일이 있으면 자동 입력됩니다.");
}

function loadMemories(rawValue = localStorage.getItem(storageKey)) {
  try {
    const saved = JSON.parse(rawValue) ?? [];
    return saved
      .filter((item) => item.imageData && item.date)
      .map((item) => ({
        id: item.id || createId(),
        owner: item.owner || "우리",
        date: item.date,
        caption: item.caption || "오래 기억될 순간",
        imageData: item.imageData,
        isTestMemory: Boolean(item.isTestMemory),
      }));
  } catch {
    return [];
  }
}

function saveMemories() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(memories));
  } catch {
    window.alert("브라우저 저장 공간이 부족해서 일부 사진을 저장하지 못했습니다.");
  }
}

function setPhotoDateHint(message) {
  if (photoDateHint) {
    photoDateHint.textContent = message;
  }
}

async function extractImageTakenDate(file) {
  const isJpeg =
    file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name || "");
  if (!isJpeg) return null;

  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;

    const marker = view.getUint8(offset + 1);
    const segmentLength = view.getUint16(offset + 2, false);
    const segmentStart = offset + 4;
    const segmentEnd = offset + 2 + segmentLength;

    if (segmentLength < 2 || segmentEnd > view.byteLength) break;

    if (marker === 0xe1 && readAscii(view, segmentStart, 6) === "Exif\u0000\u0000") {
      return readExifDate(view, segmentStart + 6, segmentEnd);
    }

    offset = segmentEnd;
  }

  return null;
}

function readExifDate(view, tiffOffset, tiffEnd) {
  if (tiffOffset + 8 > view.byteLength || tiffOffset + 8 > tiffEnd) return null;

  const byteOrder = readAscii(view, tiffOffset, 2);
  const littleEndian = byteOrder === "II";
  if (!littleEndian && byteOrder !== "MM") return null;
  if (view.getUint16(tiffOffset + 2, littleEndian) !== 42) return null;

  const firstIfdOffset = view.getUint32(tiffOffset + 4, littleEndian);
  const ifd0 = readIfd(view, tiffOffset, firstIfdOffset, littleEndian, tiffEnd);
  const exifPointer = ifd0.entries.find((entry) => entry.tag === 0x8769);

  if (exifPointer) {
    const exifIfdOffset = readEntryNumber(view, tiffOffset, exifPointer, littleEndian, tiffEnd);
    const exifIfd = readIfd(view, tiffOffset, exifIfdOffset, littleEndian, tiffEnd);
    const takenDate = readDateFromEntries(view, tiffOffset, exifIfd.entries, littleEndian, tiffEnd, [0x9003, 0x9004]);
    if (takenDate) return takenDate;
  }

  return readDateFromEntries(view, tiffOffset, ifd0.entries, littleEndian, tiffEnd, [0x0132]);
}

function readIfd(view, tiffOffset, ifdOffset, littleEndian, tiffEnd) {
  const absoluteOffset = tiffOffset + ifdOffset;
  if (!ifdOffset || absoluteOffset + 2 > view.byteLength || absoluteOffset + 2 > tiffEnd) {
    return { entries: [] };
  }

  const entryCount = view.getUint16(absoluteOffset, littleEndian);
  const entries = [];

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = absoluteOffset + 2 + index * 12;
    if (entryOffset + 12 > view.byteLength || entryOffset + 12 > tiffEnd) break;

    entries.push({
      offset: entryOffset,
      tag: view.getUint16(entryOffset, littleEndian),
      type: view.getUint16(entryOffset + 2, littleEndian),
      count: view.getUint32(entryOffset + 4, littleEndian),
    });
  }

  return { entries };
}

function readDateFromEntries(view, tiffOffset, entries, littleEndian, tiffEnd, tags) {
  for (const tag of tags) {
    const entry = entries.find((item) => item.tag === tag);
    if (!entry) continue;

    const value = readEntryAscii(view, tiffOffset, entry, littleEndian, tiffEnd);
    const normalizedDate = normalizeExifDate(value);
    if (normalizedDate) return normalizedDate;
  }

  return null;
}

function readEntryAscii(view, tiffOffset, entry, littleEndian, tiffEnd) {
  if (entry.type !== 2 || entry.count <= 0) return "";

  const valueOffset = entry.count <= 4
    ? entry.offset + 8
    : tiffOffset + view.getUint32(entry.offset + 8, littleEndian);

  if (valueOffset < 0 || valueOffset + entry.count > view.byteLength || valueOffset + entry.count > tiffEnd) {
    return "";
  }

  return readAscii(view, valueOffset, entry.count).replace(/\u0000+$/, "");
}

function readEntryNumber(view, tiffOffset, entry, littleEndian, tiffEnd) {
  if (!entry || entry.count !== 1) return null;

  if (entry.type === 3) {
    return view.getUint16(entry.offset + 8, littleEndian);
  }

  if (entry.type !== 4) return null;

  const value = view.getUint32(entry.offset + 8, littleEndian);
  const absoluteValue = tiffOffset + value;
  if (absoluteValue < tiffOffset || absoluteValue >= tiffEnd) return null;
  return value;
}

function normalizeExifDate(value) {
  const match = String(value).match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

function readAscii(view, offset, length) {
  let value = "";
  for (let index = 0; index < length && offset + index < view.byteLength; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

function createTestMemories(count) {
  const startDate = new Date(2021, 0, 3);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index * 9);

    return {
      id: createId(),
      owner: ["최호석", "정혜준"][index % 2],
      date: toDateInputValue(date),
      caption: `테스트 별자리 ${String(index + 1).padStart(3, "0")}`,
      imageData: createTestImage(index),
      isTestMemory: true,
    };
  });
}

function createTestImage(index) {
  const hue = (index * 37) % 360;
  const nextHue = (hue + 68) % 360;
  const label = String(index + 1).padStart(3, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue}, 88%, 55%)"/>` +
    `<stop offset="1" stop-color="hsl(${nextHue}, 88%, 48%)"/></linearGradient></defs>` +
    `<rect width="1200" height="900" fill="url(#g)"/>` +
    `<circle cx="${180 + (index % 7) * 110}" cy="${170 + (index % 5) * 95}" r="${90 + (index % 4) * 28}" fill="rgba(255,255,255,.22)"/>` +
    `<circle cx="${860 - (index % 6) * 80}" cy="${190 + (index % 4) * 72}" r="${46 + (index % 5) * 14}" fill="rgba(255,255,255,.14)"/>` +
    `<path d="M0 ${680 - (index % 6) * 28} C260 580 420 790 710 650 S1030 520 1200 620 V900 H0 Z" fill="rgba(5,7,13,.28)"/>` +
    `<text x="72" y="120" fill="white" font-family="Segoe UI, Arial, sans-serif" font-size="52" font-weight="800">TEST MEMORY</text>` +
    `<text x="72" y="214" fill="white" font-family="Segoe UI, Arial, sans-serif" font-size="118" font-weight="900">${label}</text>` +
    `<text x="72" y="806" fill="rgba(255,255,255,.82)" font-family="Segoe UI, Arial, sans-serif" font-size="40" font-weight="700">Our Orbit sample photo</text>` +
    `</svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function compareByDate(a, b) {
  return new Date(a.date) - new Date(b.date);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function normalizeKey(event) {
  if (event.key === " ") return "space";
  return event.key.toLowerCase();
}

function isFlightKey(key) {
  return [
    "w",
    "a",
    "s",
    "d",
    "q",
    "e",
    "shift",
    "arrowleft",
    "arrowright",
    "arrowup",
    "arrowdown",
  ].includes(key);
}

function isTypingTarget(target) {
  return Boolean(target instanceof Element && target.closest("input, textarea, select, button"));
}

function isInteractiveTarget(target) {
  return Boolean(target instanceof Element && target.closest("button, input, select, label, .control-dock, .mission-log, .memory-node"));
}

function isNearScreen(point, margin = 0) {
  return (
    point.x >= -margin &&
    point.x <= scene.width + margin &&
    point.y >= -margin &&
    point.y <= scene.height + margin
  );
}

function getDistance(from, to) {
  return Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stopAutoTour() {
  autoTour = false;
  playButton.textContent = "자동 순항";
}