const storageKey = "our-time-gallery:v1";

const starCanvas = document.querySelector("#starCanvas");
const uploadForm = document.querySelector("#uploadForm");
const photoInput = document.querySelector("#photoInput");
const ownerInput = document.querySelector("#ownerInput");
const dateInput = document.querySelector("#dateInput");
const captionInput = document.querySelector("#captionInput");
const dropZone = document.querySelector("#dropZone");
const photoPreview = document.querySelector("#photoPreview");
const fileName = document.querySelector("#fileName");
const timeSlider = document.querySelector("#timeSlider");
const playButton = document.querySelector("#playButton");
const clearButton = document.querySelector("#clearButton");
const spaceViewport = document.querySelector("#spaceViewport");
const memorySpace = document.querySelector("#memorySpace");
const emptyState = document.querySelector("#emptyState");
const currentMemory = document.querySelector("#currentMemory");
const memoryCount = document.querySelector("#memoryCount");
const activeDate = document.querySelector("#activeDate");
const timeline = document.querySelector("#timeline");
const nodeTemplate = document.querySelector("#memoryNodeTemplate");
const timelineTemplate = document.querySelector("#timelineItemTemplate");

let memories = loadMemories();
let activeIndex = 0;
let playTimer = null;
let previewUrl = null;

const view = {
  x: 0,
  y: 0,
  pointerX: 0,
  pointerY: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  baseX: 0,
  baseY: 0,
};

const stars = [];
const starContext = starCanvas.getContext("2d");

dateInput.valueAsDate = new Date();
setupStarfield();
bindEvents();
render();

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
    };

    memories = [...memories, memory].sort(compareByDate);
    activeIndex = memories.findIndex((item) => item.id === memory.id);
    resetUploadForm();
    saveMemories();
    render();
  });

  photoInput.addEventListener("change", updatePhotoPreview);

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
    updatePhotoPreview();
  });

  timeSlider.addEventListener("input", () => {
    stopPlayback();
    setActiveIndex(Number(timeSlider.value));
  });

  playButton.addEventListener("click", () => {
    if (playTimer) {
      stopPlayback();
      return;
    }

    if (memories.length <= 1) return;

    playButton.textContent = "정지";
    playTimer = window.setInterval(() => {
      const nextIndex = (activeIndex + 1) % memories.length;
      setActiveIndex(nextIndex);
    }, 2300);
  });

  clearButton.addEventListener("click", () => {
    if (!memories.length) return;

    const confirmed = window.confirm(
      "올린 사진 기록을 이 브라우저에서 모두 삭제할까요?"
    );
    if (!confirmed) return;

    memories = [];
    activeIndex = 0;
    stopPlayback();
    saveMemories();
    render();
  });

  spaceViewport.addEventListener("pointerdown", (event) => {
    view.isDragging = true;
    view.dragStartX = event.clientX;
    view.dragStartY = event.clientY;
    view.baseX = view.x;
    view.baseY = view.y;
    spaceViewport.classList.add("is-dragging");
    spaceViewport.setPointerCapture(event.pointerId);
  });

  spaceViewport.addEventListener("pointermove", (event) => {
    const bounds = spaceViewport.getBoundingClientRect();
    view.pointerX = (event.clientX - bounds.left) / bounds.width - 0.5;
    view.pointerY = (event.clientY - bounds.top) / bounds.height - 0.5;

    if (view.isDragging) {
      view.x = view.baseX + event.clientX - view.dragStartX;
      view.y = view.baseY + event.clientY - view.dragStartY;
      renderSpace();
    }
  });

  spaceViewport.addEventListener("pointerup", endDrag);
  spaceViewport.addEventListener("pointercancel", endDrag);

  spaceViewport.addEventListener(
    "wheel",
    (event) => {
      if (!memories.length) return;
      event.preventDefault();
      stopPlayback();
      const direction = event.deltaY > 0 ? 1 : -1;
      setActiveIndex(activeIndex + direction);
    },
    { passive: false }
  );

  spaceViewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      stopPlayback();
      setActiveIndex(activeIndex + 1);
    }

    if (event.key === "ArrowLeft") {
      stopPlayback();
      setActiveIndex(activeIndex - 1);
    }
  });

  window.addEventListener("resize", () => {
    resizeCanvas();
    renderSpace();
  });
}

function render() {
  memories = memories.sort(compareByDate);
  activeIndex = clamp(activeIndex, 0, Math.max(memories.length - 1, 0));
  timeSlider.max = String(Math.max(memories.length - 1, 0));
  timeSlider.value = String(activeIndex);

  renderStats();
  renderSpace();
  renderCurrentMemory();
  renderTimeline();
}

function renderStats() {
  memoryCount.textContent = `${memories.length}개의 순간`;
  activeDate.textContent = memories.length
    ? formatDate(memories[activeIndex].date)
    : "대기 중";
}

function renderSpace() {
  memorySpace.innerHTML = "";
  emptyState.classList.toggle("is-hidden", memories.length > 0);

  if (!memories.length) return;

  memories.forEach((memory, index) => {
    const node = nodeTemplate.content.firstElementChild.cloneNode(true);
    const image = node.querySelector("img");
    const date = node.querySelector(".node-date");
    const caption = node.querySelector("strong");
    const position = getMemoryPosition(index);

    image.src = memory.imageData;
    image.alt = memory.caption;
    date.textContent = `${formatShortDate(memory.date)} · ${memory.owner}`;
    caption.textContent = memory.caption;
    node.classList.toggle("is-active", index === activeIndex);
    node.style.setProperty("--x", `${position.x}px`);
    node.style.setProperty("--y", `${position.y}px`);
    node.style.setProperty("--depth", `${position.depth}px`);
    node.style.setProperty("--scale", position.scale.toFixed(3));
    node.style.setProperty("--opacity", position.opacity.toFixed(3));
    node.style.setProperty("--tilt", `${position.tilt}deg`);
    node.style.setProperty("--z", String(position.zIndex));

    node.addEventListener("click", () => {
      stopPlayback();
      setActiveIndex(index);
    });

    node.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      stopPlayback();
      setActiveIndex(index);
    });

    memorySpace.append(node);
  });
}

function renderCurrentMemory() {
  if (!memories.length) {
    currentMemory.innerHTML = `
      <p class="eyebrow">Current Memory</p>
      <h2>아직 선택된 사진이 없습니다.</h2>
      <p>왼쪽에서 사진을 업로드해 첫 번째 별을 만들어보세요.</p>
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
    <p>드래그하면 주변 궤도를 둘러보고, 휠을 굴리면 다음 시간으로 이동합니다.</p>
  `;
}

function renderTimeline() {
  timeline.innerHTML = "";

  memories.forEach((memory, index) => {
    const item = timelineTemplate.content.firstElementChild.cloneNode(true);
    const selectButton = item.querySelector(".memory-card__select");
    const deleteButton = item.querySelector(".memory-card__delete");
    const image = item.querySelector("img");
    const date = item.querySelector(".memory-card__date");
    const title = item.querySelector("strong");
    const caption = item.querySelector("em");

    item.classList.toggle("is-active", index === activeIndex);
    image.src = memory.imageData;
    image.alt = memory.caption;
    date.textContent = `${formatDate(memory.date)} · ${memory.owner}`;
    title.textContent = `${index + 1}번째 궤도`;
    caption.textContent = memory.caption;

    selectButton.addEventListener("click", () => {
      stopPlayback();
      setActiveIndex(index);
      spaceViewport.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    deleteButton.addEventListener("click", () => {
      memories = memories.filter((item) => item.id !== memory.id);
      activeIndex = clamp(activeIndex, 0, Math.max(memories.length - 1, 0));
      saveMemories();
      render();
    });

    timeline.append(item);
  });
}

function getMemoryPosition(index) {
  const distance = index - activeIndex;
  const orbit = getOrbitSeed(index);
  const pull = clamp(Math.abs(distance), 0, 5);
  const side = distance === 0 ? 0 : distance / Math.abs(distance);
  const x =
    distance * 250 +
    orbit.x +
    view.x * (0.5 + pull * 0.08) +
    view.pointerX * 34;
  const y =
    orbit.y +
    side * 28 +
    view.y * (0.42 + pull * 0.06) +
    view.pointerY * 30;
  const depth = -Math.abs(distance) * 150 + 90;
  const scale = clamp(1 - Math.abs(distance) * 0.16, 0.34, 1.08);
  const opacity = clamp(1 - Math.abs(distance) * 0.15, 0.2, 1);
  const tilt = orbit.tilt + distance * 2;
  const zIndex = 100 - Math.abs(distance);

  return { x, y, depth, scale, opacity, tilt, zIndex };
}

function getOrbitSeed(index) {
  return {
    x: Math.sin(index * 1.71) * 110,
    y: Math.cos(index * 1.23) * 118,
    tilt: Math.sin(index * 0.91) * 4,
  };
}

function setActiveIndex(nextIndex) {
  if (!memories.length) return;
  activeIndex = clamp(nextIndex, 0, memories.length - 1);
  timeSlider.value = String(activeIndex);
  renderStats();
  renderSpace();
  renderCurrentMemory();
  renderTimeline();
}

function endDrag(event) {
  if (!view.isDragging) return;
  view.isDragging = false;
  spaceViewport.classList.remove("is-dragging");
  if (spaceViewport.hasPointerCapture(event.pointerId)) {
    spaceViewport.releasePointerCapture(event.pointerId);
  }
}

function updatePhotoPreview() {
  const file = photoInput.files[0];

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  if (!file) {
    dropZone.classList.remove("has-preview");
    photoPreview.style.backgroundImage = "";
    fileName.textContent = "사진 선택 또는 드래그";
    return;
  }

  previewUrl = URL.createObjectURL(file);
  dropZone.classList.add("has-preview");
  photoPreview.style.backgroundImage = `url("${previewUrl}")`;
  fileName.textContent = file.name;
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
}

function setupStarfield() {
  resizeCanvas();

  for (let index = 0; index < 220; index += 1) {
    const star = {};
    resetStar(star, true);
    stars.push(star);
  }

  window.requestAnimationFrame(drawStars);
}

function resizeCanvas() {
  const pixelRatio = window.devicePixelRatio || 1;
  starCanvas.width = Math.floor(window.innerWidth * pixelRatio);
  starCanvas.height = Math.floor(window.innerHeight * pixelRatio);
  starCanvas.style.width = `${window.innerWidth}px`;
  starCanvas.style.height = `${window.innerHeight}px`;
  starContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function drawStars() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  starContext.clearRect(0, 0, width, height);

  stars.forEach((star) => {
    const speed = playTimer ? 0.007 : 0.0025;
    star.z -= speed;

    if (star.z <= 0.05) {
      resetStar(star, false);
    }

    const perspective = 1 / star.z;
    const x = star.x * width * perspective + width / 2 + view.pointerX * 28;
    const y = star.y * height * perspective + height / 2 + view.pointerY * 28;
    const radius = Math.max(0.35, (1 - star.z) * star.size * 2.3);

    if (x < -60 || x > width + 60 || y < -60 || y > height + 60) {
      return;
    }

    starContext.beginPath();
    starContext.fillStyle = star.color;
    starContext.globalAlpha = clamp(1 - star.z + 0.18, 0.22, 0.95);
    starContext.arc(x, y, radius, 0, Math.PI * 2);
    starContext.fill();
  });

  starContext.globalAlpha = 1;
  window.requestAnimationFrame(drawStars);
}

function resetStar(star, randomDepth) {
  star.x = Math.random() * 2 - 1;
  star.y = Math.random() * 2 - 1;
  star.z = randomDepth ? Math.random() * 0.95 + 0.05 : 1;
  star.size = Math.random() * 1.5 + 0.5;
  star.color = ["#ffffff", "#69e4ff", "#ffd166", "#ffb6d5"][
    Math.floor(Math.random() * 4)
  ];
}

function loadMemories() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey)) ?? [];
    return saved
      .filter((item) => item.imageData && item.date)
      .map((item) => ({
        id: item.id || createId(),
        owner: item.owner || "우리",
        date: item.date,
        caption: item.caption || "오래 기억될 순간",
        imageData: item.imageData,
      }));
  } catch {
    return [];
  }
}

function saveMemories() {
  localStorage.setItem(storageKey, JSON.stringify(memories));
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stopPlayback() {
  window.clearInterval(playTimer);
  playTimer = null;
  playButton.textContent = "자동 항해";
}
