// ============================================================
// blocka.html — Juego BLOCKA
//
// La imagen se dibuja en un <canvas>, se lee con getImageData y se
// corta en 4 piezas. A cada pieza se le aplica un filtro recorriendo
// la imagen pixel por pixel (en el setup del nivel) y se la rota al azar.
// Clic izquierdo gira la pieza a la izquierda, clic derecho a la derecha.
// ============================================================

// ---------- Configuración ----------

// Banco de imágenes: en cada nivel se elige una al azar.
const BLOCKA_IMAGES = [
  "img/blocka/img-1.jpg",
  "img/blocka/img-2.jpg",
  "img/blocka/img-3.jpg",
  "img/blocka/img-4.jpg",
  "img/blocka/img-5.jpg",
  "img/blocka/img-6.jpg",
];

// Niveles: el último usa un filtro distinto en cada pieza.
// maxTime (segundos): tiempo máximo para resolver el nivel. Sin maxTime = sin límite.
const BLOCKA_LEVELS = [
  { name: "Escala de grises", filter: "grayscale" },
  { name: "Brillo 30%", filter: "brightness" },
  { name: "Negativo", filter: "negative", maxTime: 30 },
  { name: "Un filtro por pieza", filter: "mixed", maxTime: 20 },
];

const GRID = 2; // 2 x 2 = 4 piezas
const BRIGHTNESS = Math.round(255 * 0.3); // valor fijo que suma el filtro de brillo (77)
const HELP_PENALTY = 5; // segundos que suma usar la Ayudita

// ---------- Estado del juego ----------

let canvas, ctx;
let pieces = [];        // { x, y, size, rotation, fixed, original, filtered }
let levelIndex = 0;
let lastImage = null;   // para no repetir la misma imagen dos veces seguidas
let state = "menu";     // "menu" | "ready" | "playing" | "won" | "lost"
let startTime = 0;
let timerId = null;
let helpUsed = false;   // la Ayudita se puede usar una sola vez por nivel
let records = loadRecords();

document.addEventListener("DOMContentLoaded", () => {
  canvas = document.getElementById("blocka-canvas");
  if (!canvas) return;
  ctx = canvas.getContext("2d");

  canvas.addEventListener("click", (e) => onPieceClick(e, -1));  // izquierda
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault(); // que no aparezca el menú del navegador
    onPieceClick(e, 1); // derecha
  });

  document.getElementById("btn-play").addEventListener("click", () => setupLevel(0));
  document.getElementById("btn-start").addEventListener("click", startLevel);
  document.getElementById("btn-next").addEventListener("click", () => {
    const next = levelIndex + 1 < BLOCKA_LEVELS.length ? levelIndex + 1 : 0;
    setupLevel(next);
  });
  document.getElementById("btn-win-menu").addEventListener("click", showMenu);
  document.getElementById("btn-menu").addEventListener("click", showMenu);
  document.getElementById("btn-error-menu").addEventListener("click", showMenu);
  document.getElementById("btn-help").addEventListener("click", useHelp);
  document.getElementById("btn-retry").addEventListener("click", () => setupLevel(levelIndex));
  document.getElementById("btn-lose-menu").addEventListener("click", showMenu);

  showMenu();
});

// ============================================================
// Pantallas (overlays HTML sobre el canvas)
// ============================================================

function showScreen(id) {
  document.querySelectorAll(".blocka__screen").forEach((s) => {
    s.hidden = s.id !== id;
  });
}

function showMenu() {
  stopTimer();
  state = "menu";
  pieces = [];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updateHud();
  setText("blocka-timer", "");
  renderRecordList();
  showScreen("screen-menu");
}

function showError(message) {
  stopTimer();
  state = "menu";
  document.getElementById("error-text").textContent = message;
  showScreen("screen-error");
}

// ============================================================
// Setup del nivel: imagen al azar + filtros + rotaciones
// ============================================================

function setupLevel(index) {
  stopTimer();
  levelIndex = index;
  helpUsed = false;
  state = "loading";
  updateHud();
  setText("blocka-timer", "00:00");
  showScreen("screen-loading");

  const img = new Image();
  const src = pickRandomImage();
  img.onload = () => {
    try {
      buildPieces(img);
    } catch (err) {
      // getImageData falla si la página se abre con doble clic (file://)
      showError("No se pudo leer la imagen. Abrí el juego con Live Server o desde GitHub Pages.");
      return;
    }
    state = "ready";
    updateHud();
    draw();
    const level = BLOCKA_LEVELS[levelIndex];
    setText("ready-title", "Nivel " + (levelIndex + 1));
    setText("ready-filter", "Filtro: " + level.name);
    setText("ready-limit", level.maxTime ? "⏳ Tenés " + formatTime(level.maxTime) + " para armarla" : "");
    showScreen("screen-ready");
  };
  img.onerror = () => showError("No se encontró la imagen " + src);
  img.src = src;
}

function pickRandomImage() {
  let src;
  do {
    src = BLOCKA_IMAGES[Math.floor(Math.random() * BLOCKA_IMAGES.length)];
  } while (src === lastImage && BLOCKA_IMAGES.length > 1);
  lastImage = src;
  return src;
}

function buildPieces(img) {
  const size = canvas.width;

  // 1) Dibujar la imagen recortada al centro como un cuadrado
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

  // 2) Elegir el filtro de cada pieza
  const level = BLOCKA_LEVELS[levelIndex];
  let filters;
  if (level.filter === "mixed") {
    filters = shuffle(["grayscale", "brightness", "negative", "sepia"]);
  } else {
    filters = [level.filter, level.filter, level.filter, level.filter];
  }

  // 3) Cortar en 4 piezas con getImageData y aplicar el filtro
  const pieceSize = size / GRID;
  pieces = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const x = col * pieceSize;
      const y = row * pieceSize;

      const originalData = ctx.getImageData(x, y, pieceSize, pieceSize);
      const filteredData = ctx.getImageData(x, y, pieceSize, pieceSize);
      applyFilter(filteredData, filters[pieces.length]);

      pieces.push({
        x: x,
        y: y,
        size: pieceSize,
        rotation: randomRotation(),
        fixed: false, // true cuando la Ayudita la deja en su lugar
        original: toCanvas(originalData),
        filtered: toCanvas(filteredData),
      });
    }
  }
}

// Rotación inicial: 1, 2 o 3 cuartos de vuelta (nunca 0, así ninguna arranca bien)
function randomRotation() {
  return 1 + Math.floor(Math.random() * 3);
}

// Pasa un ImageData a un canvas propio para poder dibujarlo rotado con drawImage
function toCanvas(imageData) {
  const c = document.createElement("canvas");
  c.width = imageData.width;
  c.height = imageData.height;
  c.getContext("2d").putImageData(imageData, 0, 0);
  return c;
}

// ============================================================
// Filtros: recorren la imagen pixel por pixel
// ============================================================

function applyFilter(imageData, filter) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const i = (x + y * width) * 4; // posición del pixel: r, g, b, a
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (filter === "grayscale") {
        const gray = (r + g + b) / 3;
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      } else if (filter === "brightness") {
        // Brillo 30%: se suma un valor fijo (30% de 255 ≈ 77) a cada canal
        data[i] = Math.min(255, r + BRIGHTNESS);
        data[i + 1] = Math.min(255, g + BRIGHTNESS);
        data[i + 2] = Math.min(255, b + BRIGHTNESS);
      } else if (filter === "negative") {
        data[i] = 255 - r;
        data[i + 1] = 255 - g;
        data[i + 2] = 255 - b;
      } else if (filter === "sepia") {
        data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }
      // data[i + 3] (alpha) no se toca
    }
  }
}

// ============================================================
// Dibujo
// ============================================================

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const solved = state === "won";

  pieces.forEach((p) => {
    const source = solved ? p.original : p.filtered;
    const half = p.size / 2;

    ctx.save();
    ctx.translate(p.x + half, p.y + half);          // centro de la pieza
    ctx.rotate((p.rotation * 90 * Math.PI) / 180);   // rotación en radianes
    ctx.drawImage(source, -half, -half, p.size, p.size);
    ctx.restore();

    // Pieza fijada por la Ayudita: borde dorado
    if (p.fixed && !solved) {
      ctx.strokeStyle = "#f7b928";
      ctx.lineWidth = 8;
      ctx.strokeRect(p.x + 4, p.y + 4, p.size - 8, p.size - 8);
    }
  });

  // Líneas que separan las piezas (desaparecen al ganar)
  if (!solved) {
    ctx.strokeStyle = "#1a1f35";
    ctx.lineWidth = 4;
    for (let i = 1; i < GRID; i++) {
      const pos = (canvas.width / GRID) * i;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvas.height);
      ctx.moveTo(0, pos);
      ctx.lineTo(canvas.width, pos);
      ctx.stroke();
    }
  }
}

// ============================================================
// Interacción
// ============================================================

// direction: -1 = izquierda (antihorario), 1 = derecha (horario)
function onPieceClick(e, direction) {
  if (state !== "playing") return;

  // Pasar la posición del mouse a coordenadas del canvas (puede estar escalado por CSS)
  const rect = canvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
  const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

  const piece = pieces.find(
    (p) => mouseX >= p.x && mouseX < p.x + p.size && mouseY >= p.y && mouseY < p.y + p.size
  );
  if (!piece || piece.fixed) return; // las piezas de la Ayudita no se mueven

  piece.rotation = (piece.rotation + direction + 4) % 4;
  draw();
  checkWin();
}

function checkWin() {
  const solved = pieces.every((p) => p.rotation === 0);
  if (!solved) return;

  stopTimer();
  state = "won";
  draw(); // se quitan los filtros: imagen original en RGB

  const seconds = (Date.now() - startTime) / 1000;
  const key = "level" + (levelIndex + 1);
  const isRecord = !records[key] || seconds < records[key];
  if (isRecord) {
    records[key] = seconds;
    saveRecords();
  }
  updateHud();

  const isLast = levelIndex === BLOCKA_LEVELS.length - 1;
  setText("win-title", isLast ? "¡Completaste todos los niveles!" : "¡Nivel " + (levelIndex + 1) + " completado!");
  setText("win-time", "Tu tiempo: " + formatTime(seconds) + (isRecord ? " · ¡Nuevo récord!" : ""));
  setText("btn-next", isLast ? "Jugar de nuevo" : "Siguiente nivel →");

  // Pequeña pausa para que se vea la imagen original antes del cartel
  setTimeout(() => {
    if (state === "won") showScreen("screen-win");
  }, 1200);
}

// ============================================================
// Extra: Ayudita (una por nivel, suma 5 segundos)
// ============================================================

function useHelp() {
  if (state !== "playing" || helpUsed) return;

  // Elegir al azar una pieza que todavía esté girada
  const wrong = pieces.filter((p) => p.rotation !== 0);
  if (wrong.length === 0) return;
  const piece = wrong[Math.floor(Math.random() * wrong.length)];

  piece.rotation = 0;
  piece.fixed = true;
  helpUsed = true;

  // Sumar 5 segundos: el reloj calcula Date.now() - startTime,
  // así que mover el inicio 5 s hacia atrás suma 5 s al contador
  startTime -= HELP_PENALTY * 1000;
  showPenalty();
  updateHud();
  draw();

  // Si era la última pieza, el nivel se completa
  checkWin();
  if (state === "playing") tick(); // actualiza reloj y revisa el tiempo máximo
}

// Cartelito "+5 s" que aparece al lado del reloj
function showPenalty() {
  const el = document.getElementById("blocka-penalty");
  el.hidden = false;
  el.classList.remove("is-showing");
  void el.offsetWidth; // reinicia la animación
  el.classList.add("is-showing");
}

// ============================================================
// Extra: Tiempo máximo (si se acaba, se pierde el nivel)
// ============================================================

function loseLevel() {
  stopTimer();
  state = "lost";
  updateHud();
  draw();
  showScreen("screen-lose");
}

// ============================================================
// Temporizador
// ============================================================

function startLevel() {
  state = "playing";
  showScreen(null); // oculta todos los carteles
  startTime = Date.now();
  updateHud();
  tick();
  timerId = setInterval(tick, 250);
}

// Se ejecuta varias veces por segundo mientras se juega
function tick() {
  const elapsed = (Date.now() - startTime) / 1000;
  setText("blocka-timer", formatTime(elapsed));

  const level = BLOCKA_LEVELS[levelIndex];
  if (!level.maxTime) return;

  const remaining = Math.max(0, level.maxTime - elapsed);
  const limitEl = document.getElementById("blocka-limit");
  limitEl.textContent = "⏳ Quedan " + formatTime(Math.ceil(remaining));
  limitEl.classList.toggle("is-warning", remaining <= 10); // rojo en los últimos 10 s

  if (remaining <= 0) loseLevel();
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
}

function formatTime(totalSeconds) {
  const s = Math.floor(totalSeconds);
  const min = String(Math.floor(s / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return min + ":" + sec;
}

// ============================================================
// HUD y récords
// ============================================================

function updateHud() {
  const level = BLOCKA_LEVELS[levelIndex];
  const inMenu = state === "menu";
  setText("blocka-level", inMenu ? "" : "Nivel " + (levelIndex + 1) + " de " + BLOCKA_LEVELS.length);
  setText("blocka-filter", inMenu ? "" : level.name);

  const record = records["level" + (levelIndex + 1)];
  setText("blocka-record", inMenu ? "" : "Récord: " + (record ? formatTime(record) : "--:--"));
  // El botón de abajo se oculta en el menú y al ganar/perder (ahí el cartel ya tiene su botón)
  document.getElementById("btn-menu").hidden = inMenu || state === "won" || state === "lost";

  // Ayudita: visible solo mientras se juega, deshabilitada después de usarla
  const help = document.getElementById("btn-help");
  help.hidden = state !== "playing";
  help.disabled = helpUsed;
  help.textContent = helpUsed ? "💡 Ayudita usada" : "💡 Ayudita (+" + HELP_PENALTY + " s)";

  // Tiempo máximo: solo en los niveles que lo tienen
  const limitEl = document.getElementById("blocka-limit");
  limitEl.hidden = inMenu || !level.maxTime;
  if (!level.maxTime || state !== "playing") {
    limitEl.classList.remove("is-warning");
    if (level.maxTime && state === "ready") limitEl.textContent = "⏳ Límite " + formatTime(level.maxTime);
  }
}

function renderRecordList() {
  const list = document.getElementById("record-list");
  if (!list) return; // la portada ya no muestra la lista de récords
  list.innerHTML = "";
  BLOCKA_LEVELS.forEach((level, i) => {
    const record = records["level" + (i + 1)];
    const li = document.createElement("li");
    li.textContent = "Nivel " + (i + 1) + " · " + level.name + ": " + (record ? formatTime(record) : "--:--");
    list.appendChild(li);
  });
}

// Los récords se guardan en el navegador (si está disponible)
function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem("blocka-records")) || {};
  } catch (err) {
    return {};
  }
}

function saveRecords() {
  try {
    localStorage.setItem("blocka-records", JSON.stringify(records));
  } catch (err) {
    // sin localStorage los récords duran solo mientras la página está abierta
  }
}

// ============================================================
// Utilidades
// ============================================================

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
