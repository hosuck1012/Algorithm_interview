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
const solarSystems = [];
const deepSpaceObjects = [];
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
      caption: captionInput.value.trim() || "A moment worth remembering",
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
    setPhotoDateHint("The date you selected will be saved.");
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
    playButton.textContent = "Stop cruise";
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
      "Delete all uploaded and sample photos from this browser?"
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
  assignSolarSystems();
  assignDeepSpaceObjects();
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

function assignSolarSystems() {
  solarSystems.length = 0;
  if (!memories.length) return;

  const anchor = memories[Math.min(Math.floor(memories.length * 0.34), memories.length - 1)].world;

  solarSystems.push({
    x: anchor.x + 1900,
    y: anchor.y - 560,
    z: anchor.z - 960,
    sunRadius: 138,
    planets: [
      { orbit: 330, radius: 22, angle: 0.35, color: "#61d8ff", highlight: "#d8fbff" },
      { orbit: 540, radius: 36, angle: 2.05, color: "#d5a66f", highlight: "#ffe1a8" },
      { orbit: 760, radius: 28, angle: 3.55, color: "#76c98a", highlight: "#d6ffd9" },
      { orbit: 1010, radius: 44, angle: 5.05, color: "#c6a277", highlight: "#f1d9ad", ring: true },
    ],
  });
}
function assignDeepSpaceObjects() {
  deepSpaceObjects.length = 0;
  if (!memories.length) return;

  const firstZ = memories[0].world.z;
  const lastZ = memories[memories.length - 1].world.z;
  const span = lastZ - firstZ;
  const placements = [
    { type: "pillar", x: -2700, y: 1500, depth: 0.08, radius: 820, rotation: -0.28, colorA: "81, 229, 213", colorB: "255, 190, 102" },
    { type: "spiral", x: 2600, y: 1380, depth: 0.22, radius: 880, rotation: 0.22, colorA: "176, 205, 255", colorB: "255, 226, 155" },
    { type: "nebula", x: 2380, y: -1380, depth: 0.38, radius: 860, rotation: 0.16, colorA: "255, 126, 202", colorB: "87, 221, 231" },
    { type: "barred", x: -2920, y: -1220, depth: 0.56, radius: 840, rotation: -0.42, colorA: "174, 198, 255", colorB: "255, 216, 139" },
    { type: "elliptical", x: -280, y: 1800, depth: 0.74, radius: 920, rotation: 0.38, colorA: "222, 232, 255", colorB: "139, 178, 255" },
    { type: "nebula", x: 460, y: -1720, depth: 0.9, radius: 820, rotation: 0.08, colorA: "83, 236, 209", colorB: "255, 152, 117" },
  ];

  placements.forEach((placement) => {
    deepSpaceObjects.push({
      ...placement,
      z: firstZ + span * placement.depth - 850,
    });
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
    date.textContent = `${formatOrbitDate(memory.date)} · ${memory.owner}`;
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
    title.textContent = `Coordinate ${index + 1}`;
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
  drawDeepSpaceObjects();
  drawConstellationLines();
  drawSolarSystems();
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

function drawDeepSpaceObjects() {
  if (!deepSpaceObjects.length) return;

  lineContext.save();
  lineContext.globalCompositeOperation = "screen";

  deepSpaceObjects.forEach((object) => {
    const point = projectWorld(object);
    if (!point.visible || !isNearScreen(point, 620) || point.depth > 28000) return;

    const scale = clamp(point.scale * 1.85, 0.22, 1.22);

    if (object.type === "spiral") {
      drawSpiralGalaxy(object, point, scale);
    } else if (object.type === "barred") {
      drawBarredGalaxy(object, point, scale);
    } else if (object.type === "elliptical") {
      drawEllipticalGalaxy(object, point, scale);
    } else if (object.type === "pillar") {
      drawPillarNebula(object, point, scale);
    } else {
      drawNebula(object, point, scale);
    }
  });

  lineContext.restore();
}

function drawSpiralGalaxy(object, point, scale) {
  const radius = clamp(object.radius * scale, 96, 320);
  const core = lineContext.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 0.78);
  core.addColorStop(0, "rgba(255, 246, 210, 0.72)");
  core.addColorStop(0.22, `rgba(${object.colorB}, 0.34)`);
  core.addColorStop(1, `rgba(${object.colorA}, 0)`);

  lineContext.fillStyle = core;
  lineContext.beginPath();
  lineContext.arc(point.x, point.y, radius * 0.78, 0, Math.PI * 2);
  lineContext.fill();

  for (let arm = 0; arm < 3; arm += 1) {
    lineContext.beginPath();
    for (let step = 0; step <= 28; step += 1) {
      const progress = step / 28;
      const angle = object.rotation + arm * ((Math.PI * 2) / 3) + progress * Math.PI * 1.52;
      const armRadius = radius * (0.14 + progress * 0.86);
      const x = point.x + Math.cos(angle) * armRadius;
      const y = point.y + Math.sin(angle) * armRadius * 0.44;

      if (step === 0) {
        lineContext.moveTo(x, y);
      } else {
        lineContext.lineTo(x, y);
      }
    }

    lineContext.strokeStyle = `rgba(${arm === 1 ? object.colorB : object.colorA}, 0.34)`;
    lineContext.lineWidth = Math.max(1.2, radius * 0.018);
    lineContext.shadowColor = `rgba(${arm === 1 ? object.colorB : object.colorA}, 0.42)`;
    lineContext.shadowBlur = 16;
    lineContext.stroke();
  }
}

function drawBarredGalaxy(object, point, scale) {
  const radius = clamp(object.radius * scale, 96, 310);
  lineContext.save();
  lineContext.translate(point.x, point.y);
  lineContext.rotate(object.rotation);

  const halo = lineContext.createRadialGradient(0, 0, 0, 0, 0, radius);
  halo.addColorStop(0, "rgba(255, 240, 190, 0.5)");
  halo.addColorStop(0.44, `rgba(${object.colorA}, 0.18)`);
  halo.addColorStop(1, `rgba(${object.colorA}, 0)`);
  lineContext.fillStyle = halo;
  lineContext.beginPath();
  lineContext.ellipse(0, 0, radius, radius * 0.52, 0, 0, Math.PI * 2);
  lineContext.fill();

  lineContext.strokeStyle = `rgba(${object.colorB}, 0.46)`;
  lineContext.lineWidth = Math.max(3, radius * 0.045);
  lineContext.shadowColor = `rgba(${object.colorB}, 0.42)`;
  lineContext.shadowBlur = 18;
  lineContext.beginPath();
  lineContext.moveTo(-radius * 0.42, 0);
  lineContext.lineTo(radius * 0.42, 0);
  lineContext.stroke();

  for (let side = -1; side <= 1; side += 2) {
    lineContext.beginPath();
    lineContext.moveTo(side * radius * 0.16, 0);
    lineContext.bezierCurveTo(side * radius * 0.38, -radius * 0.34, side * radius * 0.68, -radius * 0.22, side * radius * 0.94, -radius * 0.06);
    lineContext.strokeStyle = `rgba(${object.colorA}, 0.34)`;
    lineContext.lineWidth = Math.max(1.4, radius * 0.018);
    lineContext.stroke();
  }

  lineContext.restore();
}

function drawEllipticalGalaxy(object, point, scale) {
  const radius = clamp(object.radius * scale, 110, 340);
  lineContext.save();
  lineContext.translate(point.x, point.y);
  lineContext.rotate(object.rotation);

  const gradient = lineContext.createRadialGradient(0, 0, 0, 0, 0, radius);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.48)");
  gradient.addColorStop(0.24, `rgba(${object.colorA}, 0.24)`);
  gradient.addColorStop(0.72, `rgba(${object.colorB}, 0.09)`);
  gradient.addColorStop(1, `rgba(${object.colorB}, 0)`);
  lineContext.fillStyle = gradient;
  lineContext.beginPath();
  lineContext.ellipse(0, 0, radius, radius * 0.58, 0, 0, Math.PI * 2);
  lineContext.fill();
  lineContext.restore();
}

function drawPillarNebula(object, point, scale) {
  const radius = clamp(object.radius * scale, 120, 360);
  lineContext.save();
  lineContext.translate(point.x, point.y);
  lineContext.rotate(object.rotation);

  const clouds = [
    { x: -0.18, y: -0.18, r: 0.62, color: object.colorA, alpha: 0.2 },
    { x: 0.16, y: 0.12, r: 0.56, color: object.colorB, alpha: 0.16 },
    { x: -0.04, y: 0.02, r: 0.78, color: "255, 255, 255", alpha: 0.08 },
  ];

  clouds.forEach((cloud) => {
    const gradient = lineContext.createRadialGradient(cloud.x * radius, cloud.y * radius, 0, cloud.x * radius, cloud.y * radius, radius * cloud.r);
    gradient.addColorStop(0, `rgba(${cloud.color}, ${cloud.alpha})`);
    gradient.addColorStop(0.5, `rgba(${cloud.color}, ${cloud.alpha * 0.34})`);
    gradient.addColorStop(1, `rgba(${cloud.color}, 0)`);
    lineContext.fillStyle = gradient;
    lineContext.beginPath();
    lineContext.ellipse(cloud.x * radius, cloud.y * radius, radius * cloud.r * 0.7, radius * cloud.r, 0, 0, Math.PI * 2);
    lineContext.fill();
  });

  lineContext.strokeStyle = "rgba(30, 21, 38, 0.22)";
  lineContext.lineWidth = Math.max(7, radius * 0.05);
  lineContext.shadowBlur = 0;
  for (let pillar = 0; pillar < 3; pillar += 1) {
    const x = (pillar - 1) * radius * 0.15;
    lineContext.beginPath();
    lineContext.moveTo(x, -radius * 0.42);
    lineContext.bezierCurveTo(x - radius * 0.18, -radius * 0.1, x + radius * 0.12, radius * 0.22, x - radius * 0.04, radius * 0.54);
    lineContext.stroke();
  }

  lineContext.restore();
}

function drawNebula(object, point, scale) {
  const radius = clamp(object.radius * scale, 110, 340);
  const clouds = [
    { x: -0.26, y: -0.06, r: 0.72, color: object.colorA, alpha: 0.18 },
    { x: 0.24, y: 0.1, r: 0.62, color: object.colorB, alpha: 0.15 },
    { x: 0.02, y: -0.18, r: 0.5, color: "255, 255, 255", alpha: 0.08 },
  ];

  clouds.forEach((cloud) => {
    const x = point.x + cloud.x * radius;
    const y = point.y + cloud.y * radius;
    const gradient = lineContext.createRadialGradient(x, y, 0, x, y, radius * cloud.r);
    gradient.addColorStop(0, `rgba(${cloud.color}, ${cloud.alpha})`);
    gradient.addColorStop(0.48, `rgba(${cloud.color}, ${cloud.alpha * 0.38})`);
    gradient.addColorStop(1, `rgba(${cloud.color}, 0)`);

    lineContext.fillStyle = gradient;
    lineContext.beginPath();
    lineContext.arc(x, y, radius * cloud.r, 0, Math.PI * 2);
    lineContext.fill();
  });
}
function drawSolarSystems() {
  if (!solarSystems.length) return;

  lineContext.save();
  lineContext.globalCompositeOperation = "screen";

  solarSystems.forEach((system) => {
    const point = projectWorld(system);
    if (!point.visible || !isNearScreen(point, 520) || point.depth > 16000) return;

    const scale = clamp(point.scale * 3.5, 0.72, 3.35);
    const sunRadius = clamp(system.sunRadius * scale, 86, 260);
    const sunGradient = lineContext.createRadialGradient(
      point.x - sunRadius * 0.28,
      point.y - sunRadius * 0.28,
      0,
      point.x,
      point.y,
      sunRadius * 3.6
    );
    sunGradient.addColorStop(0, "rgba(255, 255, 232, 1)");
    sunGradient.addColorStop(0.16, "rgba(255, 229, 131, 0.9)");
    sunGradient.addColorStop(0.35, "rgba(255, 151, 52, 0.34)");
    sunGradient.addColorStop(1, "rgba(255, 151, 52, 0)");

    lineContext.fillStyle = sunGradient;
    lineContext.beginPath();
    lineContext.arc(point.x, point.y, sunRadius * 3.6, 0, Math.PI * 2);
    lineContext.fill();

    system.planets.forEach((planet) => {
      const orbitX = planet.orbit * scale;
      const orbitY = orbitX * 0.42;
      lineContext.shadowBlur = 0;
      lineContext.strokeStyle = "rgba(185, 231, 255, 0.17)";
      lineContext.lineWidth = Math.max(0.8, scale * 1.2);
      lineContext.beginPath();
      lineContext.ellipse(point.x, point.y, orbitX, orbitY, 0, 0, Math.PI * 2);
      lineContext.stroke();
    });

    lineContext.fillStyle = "rgba(255, 221, 111, 0.98)";
    lineContext.shadowColor = "rgba(255, 198, 74, 0.78)";
    lineContext.shadowBlur = 26;
    lineContext.beginPath();
    lineContext.arc(point.x, point.y, sunRadius, 0, Math.PI * 2);
    lineContext.fill();

    system.planets.forEach((planet) => {
      const orbitX = planet.orbit * scale;
      const orbitY = orbitX * 0.42;
      const planetX = point.x + Math.cos(planet.angle) * orbitX;
      const planetY = point.y + Math.sin(planet.angle) * orbitY;
      const radius = clamp(planet.radius * scale, 16, 72);
      drawRealisticPlanet(planetX, planetY, radius, planet);
    });
  });

  lineContext.restore();
}

function drawRealisticPlanet(x, y, radius, planet) {
  if (planet.ring) {
    lineContext.save();
    lineContext.strokeStyle = "rgba(230, 215, 185, 0.52)";
    lineContext.lineWidth = Math.max(1.2, radius * 0.11);
    lineContext.beginPath();
    lineContext.ellipse(x, y, radius * 1.9, radius * 0.58, -0.28, 0, Math.PI * 2);
    lineContext.stroke();
    lineContext.restore();
  }

  const gradient = lineContext.createRadialGradient(
    x - radius * 0.42,
    y - radius * 0.45,
    radius * 0.08,
    x,
    y,
    radius
  );
  gradient.addColorStop(0, planet.highlight);
  gradient.addColorStop(0.34, planet.color);
  gradient.addColorStop(1, "rgba(3, 8, 18, 0.86)");

  lineContext.fillStyle = gradient;
  lineContext.shadowColor = planet.color;
  lineContext.shadowBlur = radius * 0.75;
  lineContext.beginPath();
  lineContext.arc(x, y, radius, 0, Math.PI * 2);
  lineContext.fill();
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
  memoryCount.textContent = `${memories.length} photo signals`;
  activeDate.textContent = memories.length
    ? formatDate(memories[activeIndex].date)
    : "Standby";
}

function renderCurrentMemory() {
  if (!memories.length) {
    currentMemory.innerHTML = `
      <p class="eyebrow">Current Signal</p>
      <h2>No nearby photo signal.</h2>
      <p>Fly toward a photo to see the memory you are facing here.</p>
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
    <p>WASD move · mouse drag to look · wheel forward/back · double-click to warp</p>
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
    fileName.textContent = "Choose or drag a photo";
    setPhotoDateHint("If the photo includes a capture date, it will be filled automatically.");
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

  setPhotoDateHint("Checking the photo capture date.");

  try {
    const takenDate = await extractImageTakenDate(file);
    if (photoToken !== selectedPhotoToken) return;

    if (!takenDate) {
      setPhotoDateHint("No capture date found, so the current date is kept.");
      return;
    }

    if (dateWasManuallyEdited) {
      setPhotoDateHint("A capture date was found, but your manually selected date is kept.");
      return;
    }

    dateInput.value = takenDate;
    setPhotoDateHint("The date was set from the photo capture date. You can still change it.");
  } catch {
    if (photoToken === selectedPhotoToken) {
      setPhotoDateHint("Could not read the capture date, so the current date is kept.");
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
  fileName.textContent = "Choose or drag a photo";
  dateWasManuallyEdited = false;
  selectedPhotoToken += 1;
  setPhotoDateHint("If the photo includes a capture date, it will be filled automatically.");
}

function loadMemories(rawValue = localStorage.getItem(storageKey)) {
  try {
    const saved = JSON.parse(rawValue) ?? [];
    return saved
      .filter((item) => item.imageData && item.date)
      .map((item) => ({
        id: item.id || createId(),
        owner: item.owner || "Us",
        date: item.date,
        caption: item.caption || "A moment worth remembering",
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
    window.alert("Browser storage is full, so some photos could not be saved.");
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
      owner: ["Choi Ho-seok", "Jung Hye-jun"][index % 2],
      date: toDateInputValue(date),
      caption: `Sample constellation ${String(index + 1).padStart(3, "0")}`,
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
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatOrbitDate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
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
  playButton.textContent = "Auto cruise";
}