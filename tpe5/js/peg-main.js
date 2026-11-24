// ============================================================
// game.html — arranque del Peg Solitaire.
// Solo se activa en la página de "Pirates Peg Solitaire"; en el resto de
// los juegos (game.html?id=...) se oculta el bloque del juego.
// Depende de js/peg-solitaire.js
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const bloque = document.getElementById("peg-juego");
  if (!bloque) return;

  // Mismo criterio que game.js: el juego se elige con ?id= (por defecto, Pirates)
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id") || document.body.dataset.gameId || DEFAULT_GAME_ID;

  if (id !== "pirates-peg-solitaire") {
    bloque.hidden = true;   // otros juegos: se mantiene el recuadro de siempre
    return;
  }

  // Marco de madera oscura para el juego (game.js ya fijó las clases del recuadro)
  document.getElementById("game-board").classList.add("game-run__board--peg");

  // Crea el juego, carga las imágenes de img/peg/ y arranca
  window.pegSolitaire = new PegSolitaire({ rutaImagenes: "img/peg/" });
  window.pegSolitaire.iniciar();
});
