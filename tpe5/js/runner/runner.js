// ============================================================
// Deep Dive (TPE 5) — juego horizontal scroller estilo Flappy Bird.
// Depende de js/runner/assets.js (objeto RUNNER).
//
// Estructura (como se vio en clase):
//   · UN solo loop con requestAnimationFrame y dt (con tope).
//   · El estado vive en objetos de JS; el DOM solo lo muestra.
//   · Todo se mueve con transform (el parallax, con background-position-x).
//   · Las animaciones las definen los @keyframes de css/runner.css;
//     acá solo se cambian clases según el evento.
//   · Lo que sale de pantalla se borra del DOM y del arreglo.
//   · Una entrada por pulsación (!e.repeat), con clic y con teclado.
//
// ?hitbox en la URL dibuja las cajas de colisión (para desarrollar).
// ============================================================

(() => {
  "use strict";

  const C = RUNNER;
  const F = C.fisica;
  const P = C.pilares;
  const SUELO_Y = C.alto - C.sueloAlto;
  const DEBUG = new URLSearchParams(location.search).has("hitbox");

  /* ---------------- Utilidades ---------------- */
  const $ = (id) => document.getElementById(id);
  const azar = (a, b) => a + Math.random() * (b - a);
  const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
  const elegir = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const choca = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  /* ---------------- Elementos de la página ---------------- */
  const el = {
    marco: $("rn-marco"),
    escala: $("rn-escala"),
    mundo: $("rn-mundo"),
    entidades: $("rn-entidades"),
    debug: $("rn-debug"),
    hud: $("rn-hud"),
    puntos: $("rn-puntos"),
    vidas: $("rn-vidas"),
    record: $("rn-record"),
    menu: $("rn-menu"),
    fin: $("rn-fin"),
    finPuntos: $("rn-fin-puntos"),
    finRecord: $("rn-fin-record"),
    finNuevo: $("rn-fin-nuevo"),
    jugar: $("rn-jugar"),
    reintentar: $("rn-reintentar"),
    aMenu: $("rn-a-menu"),
    mute: $("rn-mute"),
  };
  if (!el.escala) return; // la página no tiene el juego

  /* ---------------- Estado del juego (vive en JS) ---------------- */
  const entrada = { impulso: false };

  const juego = {
    estado: "cargando", // cargando | menu | jugando | fin
    puntos: 0,
    vidas: C.vidas,
    tiempo: 0,          // segundos jugados (hace crecer la dificultad)
    vel: F.velIni,      // velocidad horizontal del mundo (px/s)
    distancia: 0,       // px que faltan para el próximo par de rocas
    gemasTramo: 0,      // gemas que salieron desde el último par de rocas
    proxGema: 0,        // px que faltan para la próxima gema (independiente de las rocas)
    proxPez: 3,         // segundos para el próximo pez
    proxBurbuja: 0,
    ultimoCentro: C.alto / 2,
    record: 0,
    tFin: 0,
  };

  const buzo = {
    x: C.buzo.x,
    y: C.alto / 2,
    vy: 0,
    inv: 0,             // segundos de invulnerabilidad que quedan
    estado: "",
    tEstado: 0,
    el: null,
    spr: null,
  };

  let tubos = [];   // pares de rocas, en el orden en que entraron
  let items = [];   // gemas
  let peces = [];   // enemigos
  let efectos = []; // explosiones, burbujas…
  const capas = []; // parallax

  const imgs = {};  // imágenes precargadas por ruta

  /* ---------------- Récord (localStorage opcional) ---------------- */
  function leerRecord() {
    try { return parseInt(localStorage.getItem("deepdive-record"), 10) || 0; } catch (e) { return 0; }
  }
  function guardarRecord(n) {
    try { localStorage.setItem("deepdive-record", String(n)); } catch (e) { /* sin storage */ }
  }

  /* ---------------- Sprites (spritesheets animados con CSS) ---------------- */
  function aplicarSprite(div, def, una) {
    const e = def.escala || 1;
    div.style.setProperty("--fw", def.fw * e + "px");
    div.style.setProperty("--fh", def.fh * e + "px");
    div.style.setProperty("--n", def.frames);
    div.style.setProperty("--dur", def.dur + "s");
    div.style.setProperty("--rep", una ? "1" : "infinite");
    div.style.backgroundImage = "url(" + def.src + ")";
  }

  function crearSprite(def, clase, una) {
    const d = document.createElement("div");
    d.className = "rn-sprite " + (clase || "");
    aplicarSprite(d, def, una);
    return d;
  }

  function reiniciarAnim(div) {
    div.style.animation = "none";
    void div.offsetWidth; // fuerza el reflow para reiniciar el keyframe
    div.style.animation = "";
  }

  /* ---------------- Precarga ---------------- */
  function rutasDelJuego() {
    const r = [];
    Object.values(C.buzo.estados).forEach((d) => r.push(d.src));
    r.push(C.gema.src);
    C.enemigos.forEach((d) => r.push(d.src));
    Object.values(C.fx).forEach((d) => r.push(d.src));
    P.sprites.forEach((s) => r.push(s));
    C.capas.forEach((c) => r.push(c.src));
    return r;
  }

  function precargar() {
    return Promise.all(
      rutasDelJuego().map(
        (src) =>
          new Promise((ok, mal) => {
            const im = new Image();
            im.onload = () => { imgs[src] = im; ok(); };
            im.onerror = () => mal(new Error("No se pudo cargar " + src));
            im.src = src;
          })
      )
    );
  }

  /* ---------------- Capas de parallax ---------------- */
  function crearCapas() {
    C.capas.forEach((def, i) => {
      const im = imgs[def.src];
      const div = document.createElement("div");
      div.className = "rn-capa rn-capa--" + (i + 1);
      div.style.backgroundImage = "url(" + def.src + ")";
      div.style.height = def.alto + "px";
      div.style.bottom = def.abajo + "px";
      div.style.backgroundSize = "auto " + def.alto + "px";
      // ancho de UN mosaico ya escalado: así el módulo cierra sin saltos
      const ancho = im.naturalWidth * (def.alto / im.naturalHeight);
      if (def.alFrente) el.mundo.appendChild(div);
      else el.mundo.insertBefore(div, el.entidades);
      capas.push({ el: div, x: 0, factor: def.factor, ancho });
    });
  }

  /* ---------------- Buzo ---------------- */
  function crearBuzo() {
    const b = C.buzo;
    const wrap = document.createElement("div");
    wrap.className = "rn-buzo";
    wrap.style.transformOrigin = b.ancla.x * b.escala + "px " + b.ancla.y * b.escala + "px";
    const spr = document.createElement("div");
    spr.className = "rn-sprite";
    wrap.appendChild(spr);
    el.entidades.appendChild(wrap);
    buzo.el = wrap;
    buzo.spr = spr;
    ponerEstadoBuzo("quieto", 0);
  }

  // Cada estado del buzo = una clase (es-nadar, es-golpe…) + su spritesheet
  function ponerEstadoBuzo(nombre, duracion) {
    const def = C.buzo.estados[nombre];
    const b = C.buzo;
    buzo.estado = nombre;
    buzo.tEstado = duracion;
    buzo.spr.className = "rn-sprite es-" + nombre;
    aplicarSprite(buzo.spr, { ...def, fw: b.fw, fh: b.fh, escala: b.escala });
    reiniciarAnim(buzo.spr);
  }

  function cajaBuzo() {
    return { x: buzo.x, y: buzo.y, w: C.buzo.caja.w, h: C.buzo.caja.h };
  }

  /* ---------------- Pares de rocas ---------------- */
  function crearTubo() {
    // si hay una gema justo en la entrada, se espera un poco para no taparla
    if (items.some((it) => it.x > C.ancho - 120)) { juego.distancia = 60; return; }
    juego.gemasTramo = 0;   // empieza un tramo nuevo: vuelve a haber lugar para gemas
    const tiempo = juego.tiempo;
    const hueco = Math.max(P.huecoMin, P.huecoIni - tiempo * P.huecoRed) + azar(-P.variacion, P.variacion);
    // la altura del hueco varía y no queda alineada con la del par anterior
    const minC = P.margenV + hueco / 2;
    const maxC = SUELO_Y - P.margenV - hueco / 2;
    const centro = limitar(
      azar(juego.ultimoCentro - P.saltoMax, juego.ultimoCentro + P.saltoMax),
      minC,
      maxC
    );
    juego.ultimoCentro = centro;

    const arribaH = centro - hueco / 2;
    const abajoY = centro + hueco / 2;
    const abajoH = SUELO_Y - abajoY + 12;
    const img = elegir(P.sprites);

    const mk = (clase, h) => {
      const d = document.createElement("div");
      d.className = "rn-pilar " + clase;
      d.style.width = P.ancho + "px";
      d.style.height = h + "px";
      d.style.backgroundImage = "url(" + img + ")";
      el.entidades.appendChild(d);
      return d;
    };

    const x = C.ancho + 30;
    tubos.push({
      x, centro, hueco, arribaH, abajoY, abajoH, pasado: false,
      elArriba: mk("rn-pilar--arriba", arribaH),
      elAbajo: mk("rn-pilar--abajo", abajoH),
    });

    // distancia hasta el próximo par (distinta cada vez)
    const prox = azar(P.distMin, P.distMax);
    juego.distancia = prox;

  }

  function cajasTubo(t) {
    const w = P.ancho - P.insetX * 2;
    return [
      { x: t.x + P.insetX, y: 0, w, h: t.arribaH - 6 },
      { x: t.x + P.insetX, y: t.abajoY + 6, w, h: t.abajoH },
    ];
  }

  /* ---------------- Gemas (suman puntos) ---------------- */
  function crearGema(x, yCentro) {
    const g = C.gema;
    const d = crearSprite(g, "rn-item");
    el.entidades.appendChild(d);
    items.push({
      x, y: yCentro - (g.fh * g.escala) / 2,
      w: g.fw * g.escala, h: g.fh * g.escala,
      el: d, tomada: false, vida: 0.35,
    });
  }

  // Las gemas tienen su propio temporizador (en px recorridos), independiente de las rocas:
  // aparecen a distancias y alturas al azar, a veces solas y a veces en grupos de 2 o 3.
  function generarGemas() {
    const G = C.gemas;
    juego.proxGema = azar(G.distMin, G.distMax);
    const x = C.ancho + 40;
    // no aparecer encima de una roca
    if (tubos.some((t) => t.x < x + 160 && t.x + P.ancho > x - 60)) { juego.proxGema = 70; return; }
    // como mucho 2 gemas por tramo (entre un par de rocas y el siguiente)
    const libres = G.maxPorTramo - juego.gemasTramo;
    if (libres <= 0) { juego.proxGema = 60; return; }
    const n = Math.min(libres, Math.random() < 0.65 ? 1 : 2);
    juego.gemasTramo += n;
    const y0 = azar(90, SUELO_Y - 90);
    const onda = azar(-40, 40);       // el grupo sube o baja un poco
    for (let i = 0; i < n; i++) {
      crearGema(x + i * G.separacion, limitar(y0 + onda * i, 70, SUELO_Y - 70));
    }
  }

  function cajaGema(it) {
    const c = C.gema.caja;
    return { x: it.x + (it.w - c.w) / 2, y: it.y + (it.h - c.h) / 2, w: c.w, h: c.h };
  }

  /* ---------------- Peces (restan vidas) ---------------- */
  function crearPez() {
    const def = elegir(C.enemigos);
    const d = crearSprite(def, "rn-pez");
    el.entidades.appendChild(d);
    const w = def.fw * def.escala;
    const h = def.fh * def.escala;
    peces.push({
      def, x: C.ancho + 80, y: azar(60, SUELO_Y - h - 30), w, h,
      vx: azar(def.vx[0], def.vx[1]), el: d,
    });
  }

  function cajaPez(p) {
    const c = p.def.caja;
    return { x: p.x + (p.w - c.w) / 2, y: p.y + (p.h - c.h) / 2, w: c.w, h: c.h };
  }

  /* ---------------- Efectos de un solo uso ---------------- */
  function crearFx(def, cx, cy, sigueAlMundo) {
    const d = crearSprite(def, "rn-fx", true);
    el.entidades.appendChild(d);
    const w = def.fw * def.escala;
    const h = def.fh * def.escala;
    efectos.push({ el: d, x: cx - w / 2, y: cy - h / 2, vida: def.dur, mundo: !!sigueAlMundo });
  }

  /* ---------------- Daño y fin ---------------- */
  function sacudir() {
    el.mundo.classList.remove("sacudir");
    void el.mundo.offsetWidth;
    el.mundo.classList.add("sacudir");
  }

  function herir(cx, cy, fxDef) {
    if (buzo.inv > 0 || juego.estado !== "jugando") return;
    juego.vidas -= 1;
    buzo.inv = C.invulnerable;
    ponerEstadoBuzo("golpe", 0.6);
    crearFx(fxDef, cx, cy, false);
    sacudir();
    actualizarVidas(true);
    if (juego.vidas <= 0) terminar();
  }

  function terminar() {
    juego.estado = "fin";
    juego.tFin = 0;
    buzo.inv = 0;
    ponerEstadoBuzo("golpe", 99);
    const nuevo = juego.puntos > juego.record;
    if (nuevo) {
      juego.record = juego.puntos;
      guardarRecord(juego.record);
    }
    el.finPuntos.textContent = juego.puntos;
    el.finRecord.textContent = juego.record;
    el.finNuevo.hidden = !nuevo;
  }

  /* ---------------- Música de fondo ---------------- */
  // El navegador solo deja reproducir audio después de un gesto del usuario:
  // por eso arranca con el clic en "Jugar" y sigue en loop mientras se juega.
  const musica = new Audio(C.musica.src);
  musica.loop = true;
  musica.volume = C.musica.volumen;
  musica.preload = "auto";
  let silenciada = false;
  try { silenciada = localStorage.getItem("deepdive-mute") === "1"; } catch (e) { /* sin storage */ }

  function pintarMute() {
    el.mute.textContent = silenciada ? "🔇" : "🔊";
    el.mute.setAttribute("aria-label", silenciada ? "Activar música" : "Silenciar música");
    el.mute.setAttribute("aria-pressed", String(silenciada));
  }
  function sonarMusica() {
    if (silenciada) return;
    const p = musica.play();
    if (p && p.catch) p.catch(() => { /* bloqueado por el navegador: se reintenta en el próximo gesto */ });
  }
  function alternarMute() {
    silenciada = !silenciada;
    try { localStorage.setItem("deepdive-mute", silenciada ? "1" : "0"); } catch (e) { /* sin storage */ }
    pintarMute();
    if (silenciada) musica.pause();
    else if (juego.estado === "jugando" || juego.estado === "fin") sonarMusica();
  }
  // si se cambia de pestaña, la música se pausa y vuelve al regresar
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) musica.pause();
    else if (juego.estado === "jugando" || juego.estado === "fin") sonarMusica();
  });

  /* ---------------- Inicio / reinicio ---------------- */
  function limpiarEntidades() {
    [...tubos.flatMap((t) => [t.elArriba, t.elAbajo]), ...items.map((i) => i.el),
      ...peces.map((p) => p.el), ...efectos.map((f) => f.el)].forEach((e) => e.remove());
    tubos = []; items = []; peces = []; efectos = [];
  }

  function empezar() {
    if (juego.estado !== "menu" && juego.estado !== "fin") return;
    limpiarEntidades();
    juego.estado = "jugando";
    juego.puntos = 0;
    juego.vidas = C.vidas;
    juego.tiempo = 0;
    juego.vel = F.velIni;
    juego.distancia = 420;     // el primer par llega enseguida
    juego.proxGema = azar(150, 400);
    juego.gemasTramo = 0;
    juego.proxPez = azar(3, 5);
    juego.proxBurbuja = 0;
    juego.ultimoCentro = SUELO_Y / 2;
    buzo.y = SUELO_Y / 2;
    buzo.vy = -F.impulso * 0.6;
    buzo.inv = 0;
    ponerEstadoBuzo("planear", 0);
    el.menu.hidden = true;
    el.fin.hidden = true;
    el.hud.hidden = false;
    sonarMusica();            // gesto del usuario (clic/tecla): ya se puede reproducir
    actualizarVidas(false);
    mostrarPuntos(false);
    el.record.textContent = juego.record;
    entrada.impulso = true;    // el clic que arranca ya da el primer impulso
    el.escala.focus({ preventScroll: true });
  }

  function volverAlMenu() {
    limpiarEntidades();
    juego.estado = "menu";
    musica.pause();
    musica.currentTime = 0;
    el.fin.hidden = true;
    el.hud.hidden = true;
    el.menu.hidden = false;
    ponerEstadoBuzo("quieto", 0);
    el.jugar.focus({ preventScroll: true });
  }

  /* ---------------- Actualizar (lógica) ---------------- */
  function moverCapas(dt, vel) {
    capas.forEach((c) => { c.x = (c.x + vel * c.factor * dt) % c.ancho; });
  }

  function actualizarMenu(dt) {
    moverCapas(dt, 70);
    buzo.y = C.alto * 0.45 + Math.sin(performance.now() / 600) * 14;
    buzo.vy = 0;
  }

  function actualizarFin(dt) {
    juego.tFin += dt;
    // la pantalla de fin aparece a los 0.9 s, decidido por el loop (sin setTimeout)
    if (el.fin.hidden && juego.tFin > 0.9) {
      el.fin.hidden = false;
      el.reintentar.focus({ preventScroll: true });
    }
    // el buzo se hunde hasta el suelo; el resto del mundo se frena
    buzo.vy += F.gravedad * 0.4 * dt;
    buzo.y = Math.min(buzo.y + buzo.vy * dt, SUELO_Y - C.buzo.caja.h);
    moverCapas(dt, 25);
    efectos.forEach((f) => { f.vida -= dt; });
  }

  function actualizar(dt) {
    juego.tiempo += dt;
    // la velocidad sube con el tiempo y el parallax la acompaña
    juego.vel = Math.min(F.velMax, F.velIni + juego.tiempo * F.aceleracion);
    const vel = juego.vel;

    /* --- buzo: gravedad e impulso --- */
    if (entrada.impulso) {
      buzo.vy = -F.impulso;                 // se ASIGNA, no se suma
      ponerEstadoBuzo("nadar", 0.45);
    }
    buzo.vy += F.gravedad * dt;
    buzo.y += buzo.vy * dt;

    if (buzo.y < 0) { buzo.y = 0; buzo.vy = 0; }

    const caja = cajaBuzo();
    if (buzo.y + caja.h > SUELO_Y) {         // el suelo también golpea
      buzo.y = SUELO_Y - caja.h;
      buzo.vy = -F.rebote;            // el suelo solo rebota: no cuesta vida
      crearFx(C.fx.explosionChica, buzo.x + caja.w / 2, SUELO_Y - 10, false);
    }

    if (buzo.inv > 0) buzo.inv -= dt;
    if (buzo.tEstado > 0) {
      buzo.tEstado -= dt;
      if (buzo.tEstado <= 0 && juego.estado === "jugando") ponerEstadoBuzo("planear", 0);
    }

    /* --- estela de burbujas --- */
    juego.proxBurbuja -= dt;
    if (juego.proxBurbuja <= 0) {
      juego.proxBurbuja = azar(0.25, 0.5);
      crearFx(C.fx.burbujas, buzo.x - 6, buzo.y + caja.h / 2 - 8, true);
    }

    /* --- parallax --- */
    moverCapas(dt, vel);

    /* --- rocas: crear, mover, puntuar, chocar, borrar --- */
    juego.distancia -= vel * dt;
    if (juego.distancia <= 0) crearTubo();
    juego.proxGema -= vel * dt;
    if (juego.proxGema <= 0) generarGemas();

    for (const t of tubos) {
      t.x -= vel * dt;
      if (!t.pasado && t.x + P.ancho < buzo.x) {
        t.pasado = true;
        juego.puntos += C.puntosPilar;
        mostrarPuntos(true);
      }
      if (buzo.inv <= 0 && juego.estado === "jugando") {
        const cb = cajaBuzo();
        if (cajasTubo(t).some((r) => choca(cb, r))) {
          herir(cb.x + cb.w / 2, cb.y + cb.h / 2, C.fx.explosion);
        }
      }
    }
    // salen en el orden en que entraron: alcanza con mirar el primero
    while (tubos.length && tubos[0].x < -P.ancho - 10) {
      const t = tubos.shift();
      t.elArriba.remove();
      t.elAbajo.remove();
    }

    /* --- gemas (suman puntos) --- */
    for (const it of items) {
      it.x -= vel * dt;
      if (!it.tomada && choca(cajaBuzo(), cajaGema(it))) {
        it.tomada = true;
        juego.puntos += C.puntosGema;
        if (C.gemaCuraVida && juego.vidas < C.vidas) { juego.vidas++; actualizarVidas(false); }
        mostrarPuntos(true);
        it.el.classList.add("tomada");           // keyframe de "pop"
        ponerEstadoBuzo("turbo", 0.7);
      }
    }
    items = items.filter((it) => {
      if (it.tomada) it.vida -= dt;
      const sale = it.x < -it.w - 10 || (it.tomada && it.vida <= 0);
      if (sale) it.el.remove();
      return !sale;
    });

    /* --- peces (restan vidas) --- */
    juego.proxPez -= dt;
    if (juego.proxPez <= 0) {
      juego.proxPez = azar(C.peces.cadaMin, C.peces.cadaMax);
      crearPez();
    }
    for (const p of peces) {
      p.x -= (vel + p.vx) * dt;
      if (!p.muerto && buzo.inv <= 0 && choca(cajaBuzo(), cajaPez(p))) {
        p.muerto = true;
        crearFx(C.fx.muerteEnemigo, p.x + p.w / 2, p.y + p.h / 2, false);
        // el pez RESTA PUNTOS (no vidas) y el juego sigue: así no termina por este elemento
        juego.puntos = Math.max(0, juego.puntos - C.puntosPez);
        buzo.inv = C.invulnerable;
        ponerEstadoBuzo("golpe", 0.6);
        sacudir();
        mostrarPuntos(true);
      }
    }
    peces = peces.filter((p) => {
      const sale = p.muerto || p.x < -p.w - 20;
      if (sale) p.el.remove();
      return !sale;
    });

    /* --- efectos --- */
    efectos.forEach((f) => {
      f.vida -= dt;
      if (f.mundo) f.x -= vel * dt;
    });
  }

  /* ---------------- Dibujar (el DOM solo muestra) ---------------- */
  let vidasMostradas = -1;
  let puntosMostrados = -1;

  function mostrarPuntos(animar) {
    el.puntos.textContent = juego.puntos;
    if (animar) {
      el.puntos.classList.remove("sube");
      void el.puntos.offsetWidth;
      el.puntos.classList.add("sube");
    }
  }

  function actualizarVidas(animar) {
    if (!el.vidas.children.length) {
      for (let i = 0; i < C.vidas; i++) {
        const s = document.createElement("span");
        s.className = "rn-vida";
        s.textContent = "♥";
        el.vidas.appendChild(s);
      }
    }
    [...el.vidas.children].forEach((s, i) => {
      const perdida = i >= juego.vidas;
      const eraPerdida = s.classList.contains("perdida");
      s.classList.toggle("perdida", perdida);
      if (animar && perdida && !eraPerdida) {
        s.classList.remove("late");
        void s.offsetWidth;
        s.classList.add("late");
      }
    });
    vidasMostradas = juego.vidas;
  }

  function dibujar() {
    for (const c of capas) c.el.style.backgroundPositionX = -c.x + "px";

    // buzo: posición + inclinación según la velocidad vertical
    const b = C.buzo;
    const ang = limitar(buzo.vy / 20, -20, 38);
    const tx = buzo.x + b.caja.w / 2 - b.ancla.x * b.escala;
    const ty = buzo.y + b.caja.h / 2 - b.ancla.y * b.escala;
    buzo.el.style.transform = "translate(" + tx + "px," + ty + "px) rotate(" + ang + "deg)";
    buzo.el.classList.toggle("invulnerable", buzo.inv > 0);

    for (const t of tubos) {
      t.elArriba.style.transform = "translate(" + t.x + "px," + t.arribaH + "px) scale(1,-1)";
      t.elAbajo.style.transform = "translate(" + t.x + "px," + t.abajoY + "px)";
    }
    for (const it of items) it.el.style.transform = "translate(" + it.x + "px," + it.y + "px)";
    for (const p of peces) p.el.style.transform = "translate(" + p.x + "px," + p.y + "px)";
    for (const f of efectos) f.el.style.transform = "translate(" + f.x + "px," + f.y + "px)";

    // borra los efectos terminados
    if (efectos.some((f) => f.vida <= 0)) {
      efectos = efectos.filter((f) => {
        if (f.vida <= 0) f.el.remove();
        return f.vida > 0;
      });
    }

    if (DEBUG) dibujarHitboxes();
  }

  function dibujarHitboxes() {
    const rects = [{ r: cajaBuzo(), c: "#3ef" }];
    tubos.forEach((t) => cajasTubo(t).forEach((r) => rects.push({ r, c: "#f43" })));
    items.forEach((it) => rects.push({ r: cajaGema(it), c: "#ff3" }));
    peces.forEach((p) => rects.push({ r: cajaPez(p), c: "#f3f" }));
    rects.push({ r: { x: 0, y: SUELO_Y, w: C.ancho, h: 2 }, c: "#3f3" });
    el.debug.innerHTML = rects
      .map(({ r, c }) =>
        '<i style="left:' + r.x + "px;top:" + r.y + "px;width:" + r.w + "px;height:" + r.h +
        "px;border-color:" + c + '"></i>')
      .join("");
  }

  /* ---------------- Loop principal ---------------- */
  let anterior = performance.now();

  function frame(ahora) {
    let dt = (ahora - anterior) / 1000; // segundos
    anterior = ahora;
    dt = Math.min(dt, 0.05);            // tope por si la pestaña estuvo en segundo plano

    switch (juego.estado) {
      case "menu": actualizarMenu(dt); break;
      case "jugando": actualizar(dt); break;
      case "fin": actualizarFin(dt); break;
    }
    entrada.impulso = false;            // la entrada se consume una vez por cuadro
    dibujar();
    requestAnimationFrame(frame);
  }

  /* ---------------- Entrada: el evento anota, el loop decide ---------------- */
  const esCampoDeTexto = (t) => t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  const teclasNadar = ["Space", "ArrowUp"];

  document.addEventListener("keydown", (e) => {
    if (!teclasNadar.includes(e.code) || esCampoDeTexto(e.target)) return;

    if (juego.estado === "jugando") {
      e.preventDefault();               // que la barra no scrollee la página
      if (!e.repeat) entrada.impulso = true;
      return;
    }
    // en menú / fin solo arranca si el juego tiene el foco
    const enJuego = el.escala.contains(document.activeElement);
    if (enJuego && !e.repeat && e.target.tagName !== "BUTTON" &&
        (juego.estado === "menu" || (juego.estado === "fin" && juego.tFin > 0.7))) {
      e.preventDefault();
      empezar();
    }
  });

  el.escala.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    el.escala.focus({ preventScroll: true });
    if (juego.estado === "jugando") entrada.impulso = true;
  });

  el.jugar.addEventListener("click", empezar);
  el.reintentar.addEventListener("click", () => { if (juego.tFin > 0.7) empezar(); });
  el.aMenu.addEventListener("click", volverAlMenu);
  el.mute.addEventListener("click", alternarMute);

  /* ---------------- Escalado al ancho de la página ---------------- */
  function ajustarEscala() {
    const k = el.marco.clientWidth / C.ancho;
    el.escala.style.transform = "scale(" + k + ")";
    el.marco.style.height = C.alto * k + "px";
  }
  if (window.ResizeObserver) new ResizeObserver(ajustarEscala).observe(el.marco);
  window.addEventListener("resize", ajustarEscala);

  /* ---------------- Arranque ---------------- */
  function iniciar() {
    ajustarEscala();
    pintarMute();
    juego.record = leerRecord();
    crearCapas();
    crearBuzo();
    juego.estado = "menu";
    el.jugar.disabled = false;
    el.jugar.textContent = "▶ Jugar";
    requestAnimationFrame((t) => { anterior = t; frame(t); });
  }

  el.jugar.disabled = true;
  el.jugar.textContent = "Cargando…";
  precargar().then(iniciar).catch((err) => {
    el.jugar.textContent = "Error al cargar";
    console.error(err);
  });

  // Para pruebas: permite mirar el estado desde la consola
  window.__rn = { musica, juego, buzo, entrada, tubos: () => tubos, items: () => items, peces: () => peces };
})();
