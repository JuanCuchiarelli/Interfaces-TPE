// ============================================================
// Deep Dive (TPE 5) — configuración de assets y de balance.
//
// TODO lo que depende de los dibujos vive acá: rutas, tamaño de
// cada frame, cantidad de frames y hitboxes. Para cambiar un sprite
// (otro personaje, otro enemigo...) se reemplaza el archivo en
// img/runner/ y se ajustan estos números; runner.js no se toca.
//
//  fw / fh : ancho y alto de UN frame en la imagen original (px)
//  frames  : cantidad de frames de la tira horizontal
//  dur     : segundos que tarda un ciclo completo de la animación
//  escala  : cuánto se agranda al dibujarlo (pixel art, sin suavizado)
// ============================================================

const RUNNER = {
  // Tamaño lógico del escenario (después se escala al ancho de la página)
  ancho: 960,
  alto: 540,
  sueloAlto: 90, // alto de la franja del suelo (capa 4)

  // ---------- Física (px, px/s, px/s²) ----------
  fisica: {
    gravedad: 1000,
    impulso: 380,      // velocidad hacia arriba que se ASIGNA al nadar
    rebote: 260,       // rebote al tocar el suelo
    velIni: 240,       // velocidad horizontal del mundo: CONSTANTE (la consigna lo pide)
    velMax: 240,
    aceleracion: 0,    // 0 = no acelera; la dificultad sube solo achicando el hueco
  },

  // ---------- Obstáculos (rocas) ----------
  pilares: {
    ancho: 120,
    huecoIni: 235,     // hueco vertical inicial por donde pasa el buzo
    huecoMin: 170,     // el hueco se achica con el tiempo hasta este valor
    huecoRed: 2,     // px que se achica por segundo
    variacion: 18,     // el hueco varía ±esto en cada par
    distMin: 300,      // distancia horizontal entre pares (varía al azar)
    distMax: 440,
    margenV: 70,       // el centro del hueco nunca queda a menos de esto de techo/suelo
    saltoMax: 240,     // cuánto puede cambiar la altura del hueco entre pares
    insetX: 20,        // hitbox más angosta que el dibujo
    sprites: [
      "img/runner/obstaculos/pilar-1.png",
      "img/runner/obstaculos/pilar-2.png",
      "img/runner/obstaculos/pilar-3.png",
      "img/runner/obstaculos/pilar-4.png",
    ],
  },

  // ---------- Reglas ----------
  vidas: 5,
  gemaCuraVida: true,  // cada gema también devuelve una vida (si falta alguna)
  invulnerable: 2.0,   // segundos sin recibir daño después de un golpe
  puntosPilar: 1,      // por cada par de rocas superado
  puntosPez: 3,       // los peces restan estos puntos (nunca terminan la partida)
  puntosGema: 5,       // la gema SUMA puntos…
  musica: { src: "audio/musica.mp3", volumen: 0.35 }, // música de fondo en loop
  gemas: { distMin: 260, distMax: 760, separacion: 70, maxPorTramo: 1 }, // distancia entre apariciones y entre gemas de un grupo
  // cada elemento hace algo distinto: la gema suma puntos y devuelve vida, el pez resta puntos
  peces: { cadaMin: 4.5, cadaMax: 8 },

  // ---------- Personaje: el buzo ----------
  buzo: {
    x: 200,                     // posición horizontal fija
    fw: 80, fh: 80, escala: 2,
    ancla: { x: 41, y: 40 },    // centro del cuerpo dentro del frame (px originales)
    caja: { w: 44, h: 26 },     // hitbox (más chica que el dibujo, en px del escenario)
    estados: {
      quieto: { src: "img/runner/buzo/quieto.png", frames: 6, dur: 0.9 },
      nadar:  { src: "img/runner/buzo/nadar.png",  frames: 7, dur: 0.45 }, // al dar impulso
      planear:{ src: "img/runner/buzo/rapido.png", frames: 5, dur: 0.6 },  // avanzando
      golpe:  { src: "img/runner/buzo/golpe.png",  frames: 5, dur: 0.6 },  // al chocar
      turbo:  { src: "img/runner/buzo/turbo.png",  frames: 7, dur: 0.7 },  // al juntar una gema
    },
  },

  // ---------- Elemento que suma puntos ----------
  gema: {
    src: "img/runner/items/gema.png",
    fw: 32, fh: 32, frames: 12, dur: 1.1, escala: 1.75,
    caja: { w: 40, h: 40 },     // hitbox en px del escenario
  },

  // ---------- Elemento que resta vidas: peces enemigos ----------
  // vx extra: cuánto más rápido que el mundo nadan hacia la izquierda
  enemigos: [
    { id: "pez",        src: "img/runner/enemigos/pez.png",        fw: 32, fh: 32, frames: 4, dur: 0.5, escala: 2,   vx: [40, 110],  caja: { w: 46, h: 30 } },
    { id: "pez-grande", src: "img/runner/enemigos/pez-grande.png", fw: 54, fh: 49, frames: 4, dur: 0.7, escala: 1.7, vx: [20, 70],   caja: { w: 70, h: 56 } },
    { id: "pez-dardo",  src: "img/runner/enemigos/pez-dardo.png",  fw: 39, fh: 20, frames: 4, dur: 0.4, escala: 2,   vx: [130, 220], caja: { w: 62, h: 24 } },
  ],

  // ---------- Efectos (se reproducen una vez y desaparecen) ----------
  fx: {
    explosion:      { src: "img/runner/fx/explosion.png",        fw: 60, fh: 82, frames: 11, dur: 0.75, escala: 1.7 },
    muerteEnemigo:  { src: "img/runner/fx/muerte-enemigo.png",   fw: 52, fh: 53, frames: 6,  dur: 0.6,  escala: 2 },
    burbujas:       { src: "img/runner/fx/burbujas.png",         fw: 23, fh: 40, frames: 4,  dur: 0.8,  escala: 1.5 },
    explosionChica: { src: "img/runner/fx/explosion-chica.png",   fw: 44, fh: 53, frames: 11, dur: 0.5,  escala: 1.6 },
  },

  // ---------- Parallax: 4 capas, de la más lejana a la más cercana ----------
  // factor: fracción de la velocidad del mundo (la última, el suelo, va igual que las rocas)
  // alto / abajo: tamaño y posición en el escenario. El ancho del mosaico se calcula solo.
  capas: [
    { src: "img/runner/capas/capa1-fondo.png",  factor: 0.10, alto: 540, abajo: 0 },
    { src: "img/runner/capas/capa2-cueva.png",  factor: 0.25, alto: 540, abajo: 0 },
    { src: "img/runner/capas/capa3-ruinas.png", factor: 0.50, alto: 360, abajo: 90 },
    { src: "img/runner/capas/capa4-suelo.png",  factor: 1.00, alto: 90,  abajo: 0, alFrente: true },
  ],
};
