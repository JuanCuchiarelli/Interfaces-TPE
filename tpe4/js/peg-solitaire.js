'use strict';

/**
 * ============================================================
 *  PIRATES PEG SOLITAIRE  –  Entregable Nº4
 *  Interfaces de Usuario e Interacción – TUDAI / UNICEN
 * ============================================================
 *  Estructura (POO, como en la teoría):
 *    - Ficha         → una pieza: sabe dibujarse, moverse y detectar si el mouse está encima.
 *    - Tablero       → la grilla 7x7 en cruz: guarda las fichas y calcula los movimientos válidos.
 *    - PegSolitaire  → el juego: eventos de mouse, animaciones, timer, fin de partida y HUD.
 *
 *  Interacción: eventos mousedown / mousemove / mouseup sobre el <canvas>
 *  (se busca la figura bajo el mouse, se le da feedback, se la arrastra y al soltar se valida).
 */

/* ------------------------------------------------------------------
 *  CONSTANTES GENERALES
 * ------------------------------------------------------------------ */
const PEG = {
  LADO: 720,          // tamaño (px) del canvas cuadrado: entra de sobra en Full HD (1080)
  TAM: 7,             // la grilla es de 7x7 (con las esquinas recortadas, forma de cruz)
  CELDA: 86,          // ancho/alto de cada celda
  ORIGEN: 59,         // margen hasta la primera celda
  RADIO_FICHA: 34,    // radio de la ficha dibujada
  RADIO_HOYO: 40,     // radio del agujero del tablero
  SNAP: 50,           // distancia máxima (px) del centro de la ficha al agujero para "encajar"
  TIEMPO_LIMITE: 300  // tiempo límite de la partida: 5 minutos (en segundos)
};

/** Archivos de imagen de cada tipo de ficha (dentro de la carpeta de imágenes). */
const PEG_IMAGENES = {
  doblon:   'doblon.svg',
  rubi:     'rubi.svg',
  zafiro:   'zafiro.svg',
  calavera: 'calavera.svg'
};

/** "Skins": qué tipo de ficha usa cada opción del selector. */
const PEG_SKINS = {
  doblon:   ['doblon'],
  rubi:     ['rubi'],
  zafiro:   ['zafiro'],
  calavera: ['calavera']
};

/** Las 4 direcciones de salto (se salta de a 2 celdas, solo en horizontal o vertical). */
const PEG_DIRECCIONES = [
  { df: -2, dc: 0 },  // arriba
  { df: 2,  dc: 0 },  // abajo
  { df: 0,  dc: -2 }, // izquierda
  { df: 0,  dc: 2 }   // derecha
];


/* ==================================================================
 *  CLASE FICHA
 * ================================================================== */
class Ficha {
  /**
   * @param {number} fila   Fila lógica en el tablero (0..6)
   * @param {number} col    Columna lógica en el tablero (0..6)
   * @param {string} tipo   Tipo de ficha (clave de PEG_IMAGENES)
   * @param {{x:number,y:number}} centro  Posición en píxeles donde se dibuja
   */
  constructor(fila, col, tipo, centro) {
    this.fila = fila;
    this.col = col;
    this.tipo = tipo;
    this.x = centro.x;          // posición actual en el canvas (cambia al arrastrar)
    this.y = centro.y;
    this.radio = PEG.RADIO_FICHA;
    this.arrastrando = false;   // true mientras el usuario la tiene "agarrada"
    this.resaltada = false;     // true si está seleccionada o con el mouse encima
    this.anim = null;           // animación de desplazamiento en curso (volver / encajar)
    // Cada ficha queda con un giro propio, como piezas reales tiradas a mano:
    // las calaveras solo se inclinan un poco; el resto puede quedar en cualquier ángulo.
    this.angulo = (tipo === 'calavera')
      ? (Math.random() - 0.5) * 0.3
      : Math.random() * Math.PI * 2;
  }

  /**
   * Indica si un punto (x, y) cae dentro de la ficha (distancia al centro <= radio).
   * Sirve para encontrar la figura en el mousedown.
   */
  contiene(px, py) {
    return Math.hypot(px - this.x, py - this.y) <= this.radio;
  }

  /**
   * Cambia la posición lógica de la ficha (fila/col). No mueve el dibujo:
   * de eso se encarga animarHacia().
   */
  colocarEn(fila, col) {
    this.fila = fila;
    this.col = col;
  }

  /**
   * Inicia una animación suave desde la posición actual hasta (x, y).
   * @param {number} x       Destino X
   * @param {number} y       Destino Y
   * @param {number} ahora   Marca de tiempo actual (ms)
   * @param {number} dur     Duración de la animación (ms)
   */
  animarHacia(x, y, ahora, dur = 180) {
    this.anim = { x0: this.x, y0: this.y, x1: x, y1: y, t0: ahora, dur };
  }

  /**
   * Avanza la animación de desplazamiento (si hay una). Usa "ease-out cúbico".
   * @param {number} ahora  Marca de tiempo actual (ms)
   */
  actualizar(ahora) {
    if (!this.anim) return;
    const a = this.anim;
    const p = Math.min(1, (ahora - a.t0) / a.dur);
    const e = 1 - Math.pow(1 - p, 3);
    this.x = a.x0 + (a.x1 - a.x0) * e;
    this.y = a.y0 + (a.y1 - a.y0) * e;
    if (p >= 1) this.anim = null;
  }

  /**
   * Dibuja la ficha en el contexto 2D: sombra, brillo (si está resaltada) e imagen.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object<string,HTMLImageElement>} imagenes  Imágenes ya cargadas por tipo
   * @param {number} t   Tiempo en segundos (para el pulso del brillo)
   */
  dibujar(ctx, imagenes, t) {
    const escala = this.arrastrando ? 1.14 : 1;   // al agarrarla se "levanta" un poco
    const r = this.radio * escala;

    // Sombra elíptica debajo (más separada si está levantada)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + r * (this.arrastrando ? 0.95 : 0.8), r * 0.85, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Brillo dorado pulsante si está resaltada
    if (this.resaltada) {
      ctx.save();
      ctx.shadowColor = 'rgba(255, 215, 0, 0.95)';
      ctx.shadowBlur = 16 + 6 * Math.sin(t * 6);
    }

    const img = imagenes[this.tipo];
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.translate(this.x, this.y);     // se gira alrededor del centro de la ficha
      ctx.rotate(this.angulo);
      ctx.drawImage(img, -r, -r, r * 2, r * 2);
      ctx.restore();
    } else {
      // Respaldo por si la imagen no cargó: círculo de color (así el juego sigue funcionando)
      ctx.fillStyle = '#d4a017';
      ctx.beginPath();
      ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.resaltada) ctx.restore();
  }
}


/* ==================================================================
 *  CLASE TABLERO
 * ================================================================== */
class Tablero {
  constructor() {
    /** Matriz 7x7: contiene una Ficha o null (agujero vacío / casilla fuera del tablero). */
    this.celdas = [];
  }

  /**
   * Dice si (fila, col) es un agujero real del tablero.
   * El tablero tiene forma de cruz: se descartan las 4 esquinas de 2x2.
   */
  static esHoyo(fila, col) {
    if (fila < 0 || fila >= PEG.TAM || col < 0 || col >= PEG.TAM) return false;
    return (fila >= 2 && fila <= 4) || (col >= 2 && col <= 4);
  }

  /** Devuelve el centro en píxeles del agujero (fila, col). */
  static centroDe(fila, col) {
    return {
      x: PEG.ORIGEN + PEG.CELDA * (col + 0.5),
      y: PEG.ORIGEN + PEG.CELDA * (fila + 0.5)
    };
  }

  /**
   * Arma una partida nueva: llena todos los agujeros con fichas excepto el central.
   * @param {string[]} tipos  Tipos de ficha posibles; si hay varios, se eligen al azar.
   */
  reiniciar(tipos) {
    this.celdas = [];
    for (let f = 0; f < PEG.TAM; f++) {
      this.celdas[f] = [];
      for (let c = 0; c < PEG.TAM; c++) {
        const centro = Tablero.centroDe(f, c);
        const esCentro = (f === 3 && c === 3);
        if (Tablero.esHoyo(f, c) && !esCentro) {
          const tipo = tipos[Math.floor(Math.random() * tipos.length)];
          this.celdas[f][c] = new Ficha(f, c, tipo, centro);
        } else {
          this.celdas[f][c] = null;
        }
      }
    }
  }

  /** Devuelve la ficha ubicada en (fila, col) o null si está vacío / fuera del tablero. */
  fichaEn(fila, col) {
    if (!Tablero.esHoyo(fila, col)) return null;
    return this.celdas[fila][col];
  }

  /** Lista de todas las fichas que siguen en juego. */
  todasLasFichas() {
    const lista = [];
    for (let f = 0; f < PEG.TAM; f++)
      for (let c = 0; c < PEG.TAM; c++)
        if (this.celdas[f][c]) lista.push(this.celdas[f][c]);
    return lista;
  }

  /** Cantidad de fichas que quedan en el tablero. */
  contarFichas() {
    return this.todasLasFichas().length;
  }

  /**
   * Calcula los movimientos válidos de una ficha.
   * Regla: saltar en línea recta sobre una ficha vecina hacia un agujero VACÍO.
   * @returns {{fila:number,col:number,saltadaFila:number,saltadaCol:number}[]}
   */
  movimientosDe(ficha) {
    const movs = [];
    for (const d of PEG_DIRECCIONES) {
      const destF = ficha.fila + d.df;
      const destC = ficha.col + d.dc;
      const medioF = ficha.fila + d.df / 2;
      const medioC = ficha.col + d.dc / 2;
      if (Tablero.esHoyo(destF, destC) &&
          this.celdas[destF][destC] === null &&   // destino vacío
          this.fichaEn(medioF, medioC) !== null) { // hay una ficha para comer en el medio
        movs.push({ fila: destF, col: destC, saltadaFila: medioF, saltadaCol: medioC });
      }
    }
    return movs;
  }

  /**
   * ¿Queda algún movimiento posible en todo el tablero?
   * Se llama después de cada jugada para saber si el juego terminó.
   */
  hayMovimientos() {
    return this.todasLasFichas().some(f => this.movimientosDe(f).length > 0);
  }

  /**
   * Ejecuta un movimiento: vacía el origen, retira la ficha saltada y ocupa el destino.
   * @returns {Ficha} la ficha capturada (para animar su desaparición)
   */
  ejecutarMovimiento(ficha, mov) {
    this.celdas[ficha.fila][ficha.col] = null;                 // origen queda vacío
    const capturada = this.celdas[mov.saltadaFila][mov.saltadaCol];
    this.celdas[mov.saltadaFila][mov.saltadaCol] = null;       // se come la ficha del medio
    this.celdas[mov.fila][mov.col] = ficha;                    // destino ocupado
    ficha.colocarEn(mov.fila, mov.col);
    return capturada;
  }
}


/* ==================================================================
 *  CLASE PEGSOLITAIRE (el juego)
 * ================================================================== */
class PegSolitaire {
  /**
   * @param {Object} opciones
   * @param {string} opciones.rutaImagenes  Carpeta de las imágenes (ej: 'img/')
   * @param {string} [opciones.idCanvas]    id del <canvas>
   * Los demás ids (timer, contadores, botones, selects) son opcionales.
   */
  constructor(opciones = {}) {
    this.ruta = opciones.rutaImagenes || 'img/';
    this.canvas = document.getElementById(opciones.idCanvas || 'pegCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = PEG.LADO;
    this.canvas.height = PEG.LADO;

    // Elementos HTML opcionales del HUD y los controles
    this.el = {
      timer:     document.getElementById(opciones.idTimer     || 'pegTimer'),
      restantes: document.getElementById(opciones.idRestantes || 'pegRestantes'),
      movs:      document.getElementById(opciones.idMovs      || 'pegMovs'),
      mensaje:   document.getElementById(opciones.idMensaje   || 'pegMensaje'),
      btnReiniciar: document.getElementById(opciones.idBtnReiniciar || 'pegBtnReiniciar'),
      selSkin:   document.getElementById(opciones.idSelSkin   || 'pegSkin')
    };

    this.tablero = new Tablero();
    this.imagenes = {};          // imágenes de fichas ya cargadas
    this.imgTablero = null;      // imagen de fondo del tablero

    // Estado de la partida
    this.estado = 'jugando';     // 'jugando' | 'victoria' | 'derrota' | 'tiempo'
    this.skin = 'doblon';
    this.tiempoLimite = PEG.TIEMPO_LIMITE;  // segundos (fijo: 5 minutos)
    this.timerCorriendo = false;
    this.finTimerMs = 0;         // instante (ms) en que se acaba el tiempo
    this.tiempoRestante = this.tiempoLimite;
    this.movimientos = 0;

    // Estado de interacción
    this.seleccionada = null;    // ficha elegida con el click
    this.movsValidos = [];       // movimientos posibles de la ficha elegida (para los hints)
    this.arrastrando = false;    // true si la ficha está siendo arrastrada
    this.offset = { x: 0, y: 0 };// diferencia entre el centro de la ficha y el mouse al agarrarla
    this.inicioClick = null;     // posición del mousedown (para distinguir click de arrastre)
    this.mouse = { x: -999, y: -999 };
    this.efectos = [];           // animaciones de fichas capturadas desapareciendo
    this.tFin = 0;               // instante en que terminó la partida (para el fundido del cartel)
    this.botonFin = { x: 250, y: 462, w: 220, h: 58 }; // botón "Jugar de nuevo" dibujado en el canvas
    this.ultimoTexto = {};       // cache del HUD para no tocar el DOM en cada frame
  }

  /**
   * Punto de entrada: carga las imágenes, conecta los eventos, arma la partida y
   * arranca el bucle de animación.
   */
  async iniciar() {
    await this.cargarImagenes();
    this.vincularEventos();
    this.reiniciar();
    requestAnimationFrame(ts => this.bucle(ts));
  }

  /**
   * Carga todas las imágenes (tablero + fichas). Si alguna falla, el juego igual arranca
   * con un dibujo de respaldo y avisa por consola.
   */
  cargarImagenes() {
    const cargar = (archivo) => new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { console.warn('No se pudo cargar la imagen: ' + archivo); resolve(img); };
      img.src = this.ruta + archivo;
    });
    const tareas = Object.entries(PEG_IMAGENES).map(async ([tipo, archivo]) => {
      this.imagenes[tipo] = await cargar(archivo);
    });
    tareas.push(cargar('tablero.svg').then(img => { this.imgTablero = img; }));
    return Promise.all(tareas);
  }

  /** Conecta los eventos del mouse sobre el canvas y los controles de la interfaz. */
  vincularEventos() {
    this.canvas.addEventListener('mousedown', e => this.alMouseDown(e));
    this.canvas.addEventListener('mousemove', e => this.alMouseMove(e));
    this.canvas.addEventListener('mouseup',   e => this.alMouseUp(e));
    // Si el mouse sale del canvas con una ficha agarrada, se cancela el arrastre
    this.canvas.addEventListener('mouseleave', () => this.cancelarArrastre());

    if (this.el.btnReiniciar) this.el.btnReiniciar.addEventListener('click', () => this.reiniciar());
    if (this.el.selSkin) this.el.selSkin.addEventListener('change', () => this.reiniciar());
  }

  /* ----------------------------------------------------------------
   *  PARTIDA: reinicio, fin y timer
   * ---------------------------------------------------------------- */

  /**
   * Empieza una partida nueva con el tipo de ficha elegido y el tiempo límite fijo (5 minutos).
   * Se usa al cargar la página, al tocar "Reiniciar" y al cambiar una opción.
   */
  reiniciar() {
    if (this.el.selSkin) this.skin = this.el.selSkin.value;
    this.tablero.reiniciar(PEG_SKINS[this.skin] || PEG_SKINS.doblon);
    this.estado = 'jugando';
    this.seleccionada = null;
    this.movsValidos = [];
    this.arrastrando = false;
    this.efectos = [];
    this.movimientos = 0;
    this.timerCorriendo = false;                 // el timer arranca con la primera jugada
    this.tiempoRestante = this.tiempoLimite;
    this.canvas.style.cursor = 'default';
    this.mostrarMensaje('Arrastrá una ficha hasta un hueco libre. El tiempo empieza a correr con tu primer salto.');
    this.actualizarHUD();
  }

  /** Arranca la cuenta regresiva (se llama en el primer movimiento de la partida). */
  iniciarTimer(ahora) {
    this.timerCorriendo = true;
    this.finTimerMs = ahora + this.tiempoRestante * 1000;
  }

  /** Actualiza el tiempo restante usando el reloj real; si llega a 0 termina la partida. */
  actualizarTimer(ahora) {
    if (!this.timerCorriendo || this.estado !== 'jugando') return;
    this.tiempoRestante = Math.max(0, (this.finTimerMs - ahora) / 1000);
    if (this.tiempoRestante <= 0) this.terminar('tiempo');
  }

  /**
   * Revisa si la partida terminó. Se llama después de CADA movimiento:
   *  - queda 1 sola ficha → victoria
   *  - no hay más movimientos posibles → derrota
   */
  verificarFin() {
    if (this.tablero.contarFichas() === 1) this.terminar('victoria');
    else if (!this.tablero.hayMovimientos()) this.terminar('derrota');
  }

  /**
   * Cierra la partida con el motivo indicado y suelta cualquier ficha agarrada.
   * @param {'victoria'|'derrota'|'tiempo'} motivo
   */
  terminar(motivo) {
    this.cancelarArrastre();
    this.seleccionada = null;
    this.movsValidos = [];
    this.estado = motivo;
    this.timerCorriendo = false;
    this.tFin = performance.now();
    this.canvas.style.cursor = 'default';
    this.mostrarMensaje(this.tituloFin() + ' ' + this.subtituloFin());
    this.actualizarHUD();
  }

  /** Título del cartel final según cómo terminó la partida. */
  tituloFin() {
    const n = this.tablero.contarFichas();
    if (this.estado === 'tiempo') return 'Se acabó el tiempo';
    if (this.estado === 'victoria') {
      const f = this.tablero.todasLasFichas()[0];
      return (f.fila === 3 && f.col === 3) ? 'Capitán legendario' : 'Tesoro encontrado';
    }
    return n <= 3 ? 'Casi perfecto' : 'Fin de la partida';
  }

  /** Subtítulo del cartel final (resumen de la partida). */
  subtituloFin() {
    const n = this.tablero.contarFichas();
    if (this.estado === 'victoria') {
      const f = this.tablero.todasLasFichas()[0];
      return (f.fila === 3 && f.col === 3)
        ? 'Dejaste una sola ficha, justo en el centro.'
        : 'Dejaste una sola ficha en el tablero.';
    }
    if (this.estado === 'tiempo') return 'Te quedaron ' + n + ' fichas.';
    return 'No hay más movimientos. Te quedaron ' + n + ' fichas.';
  }

  /* ----------------------------------------------------------------
   *  EVENTOS DE MOUSE
   * ---------------------------------------------------------------- */

  /**
   * Convierte las coordenadas del evento a coordenadas internas del canvas
   * (el canvas puede estar escalado por CSS, por eso se corrige con el cociente).
   */
  posicionMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.canvas.width / r.width),
      y: (e.clientY - r.top) * (this.canvas.height / r.height)
    };
  }

  /**
   * MOUSEDOWN: según el caso...
   *  1) partida terminada → ¿click en "Jugar de nuevo"?
   *  2) hay una ficha elegida y se clickeó un destino válido → mover (modo click-click)
   *  3) se clickeó una ficha con movimientos → elegirla y empezar a arrastrar (con feedback)
   *  4) cualquier otra cosa → des-seleccionar
   */
  alMouseDown(e) {
    const p = this.posicionMouse(e);

    if (this.estado !== 'jugando') {
      const b = this.botonFin;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) this.reiniciar();
      return;
    }

    // 2) Click sobre un destino válido de la ficha ya elegida
    if (this.seleccionada && !this.arrastrando) {
      const mov = this.movimientoEnPunto(p.x, p.y);
      if (mov) { this.realizarMovimiento(this.seleccionada, mov); return; }
    }

    // 3) Buscar la ficha bajo el mouse (se recorre al revés: la última dibujada queda arriba)
    const fichas = this.tablero.todasLasFichas();
    let elegida = null;
    for (let i = fichas.length - 1; i >= 0; i--) {
      if (fichas[i].contiene(p.x, p.y)) { elegida = fichas[i]; break; }
    }

    if (elegida) {
      const movs = this.tablero.movimientosDe(elegida);
      if (movs.length === 0) {                    // ficha trabada: feedback de "no se puede"
        this.sacudir(elegida);
        this.deseleccionar();
        this.mostrarMensaje('Esa ficha no puede saltar ahora.');
        return;
      }
      this.seleccionar(elegida, movs);
      this.arrastrando = true;
      elegida.arrastrando = true;
      elegida.anim = null;
      this.offset = { x: elegida.x - p.x, y: elegida.y - p.y };
      this.inicioClick = p;
      this.canvas.style.cursor = 'grabbing';
    } else {
      this.deseleccionar();                       // 4) click en el vacío
    }
  }

  /**
   * MOUSEMOVE: si hay una ficha agarrada, la ficha toma la posición del mouse;
   * si no, solo se actualiza el cursor (mano si está sobre una ficha jugable).
   */
  alMouseMove(e) {
    const p = this.posicionMouse(e);
    this.mouse = p;
    if (this.estado !== 'jugando') return;

    if (this.arrastrando && this.seleccionada) {
      this.seleccionada.x = p.x + this.offset.x;
      this.seleccionada.y = p.y + this.offset.y;
      return;
    }

    // Feedback de hover: resaltar la ficha jugable que está bajo el mouse
    let sobreJugable = false;
    for (const f of this.tablero.todasLasFichas()) {
      const hover = f.contiene(p.x, p.y) && this.tablero.movimientosDe(f).length > 0;
      f.resaltada = hover || f === this.seleccionada;
      if (hover) sobreJugable = true;
    }
    this.canvas.style.cursor = sobreJugable ? 'grab' : 'default';
  }

  /**
   * MOUSEUP: se suelta la ficha.
   *  - Si se movió poco, fue un simple click: la ficha queda elegida mostrando los hints.
   *  - Si se arrastró y quedó sobre un destino válido, se hace el movimiento.
   *  - Si no, la ficha vuelve (animada) a su lugar: no cae en cualquier parte.
   */
  alMouseUp(e) {
    if (!this.arrastrando || !this.seleccionada) return;
    const p = this.posicionMouse(e);
    const ficha = this.seleccionada;
    this.arrastrando = false;
    ficha.arrastrando = false;
    this.canvas.style.cursor = 'grab';

    const desplazamiento = Math.hypot(p.x - this.inicioClick.x, p.y - this.inicioClick.y);
    if (desplazamiento < 6) {                         // fue un click, no un arrastre
      this.devolver(ficha);
      return;
    }

    const mov = this.movimientoCercano(ficha.x, ficha.y);
    if (mov) this.realizarMovimiento(ficha, mov);
    else {
      this.devolver(ficha);
      this.mostrarMensaje('Ahí no se puede. Probá en un hueco marcado.');
    }
  }

  /** Cancela un arrastre en curso (mouse fuera del canvas o fin de partida): la ficha vuelve. */
  cancelarArrastre() {
    if (!this.arrastrando || !this.seleccionada) return;
    this.arrastrando = false;
    this.seleccionada.arrastrando = false;
    this.devolver(this.seleccionada);
  }

  /* ----------------------------------------------------------------
   *  SELECCIÓN Y MOVIMIENTOS
   * ---------------------------------------------------------------- */

  /** Marca una ficha como elegida y guarda sus movimientos válidos (para dibujar los hints). */
  seleccionar(ficha, movs) {
    this.deseleccionar();
    this.seleccionada = ficha;
    this.movsValidos = movs;
    ficha.resaltada = true;
    this.mostrarMensaje('Soltala sobre uno de los huecos marcados.');
  }

  /** Quita la selección actual y apaga los hints. */
  deseleccionar() {
    if (this.seleccionada) this.seleccionada.resaltada = false;
    this.seleccionada = null;
    this.movsValidos = [];
  }

  /** Anima la ficha de vuelta a su agujero de origen. */
  devolver(ficha) {
    const c = Tablero.centroDe(ficha.fila, ficha.col);
    ficha.animarHacia(c.x, c.y, performance.now(), 200);
  }

  /** Efecto de "temblor" de una ficha sin movimientos (se resuelve en dibujarFichas). */
  sacudir(ficha) {
    ficha.temblor = performance.now();
  }

  /**
   * Devuelve el movimiento válido cuyo agujero destino está bajo el punto (x, y), o null.
   * Se usa para el modo "click en la ficha y click en el destino".
   */
  movimientoEnPunto(x, y) {
    for (const m of this.movsValidos) {
      const c = Tablero.centroDe(m.fila, m.col);
      if (Math.hypot(x - c.x, y - c.y) <= PEG.RADIO_HOYO) return m;
    }
    return null;
  }

  /**
   * Devuelve el movimiento válido cuyo destino está más cerca del punto (x, y)
   * si está dentro de la distancia de "encaje" (PEG.SNAP); si no, null.
   */
  movimientoCercano(x, y) {
    let mejor = null, mejorDist = PEG.SNAP;
    for (const m of this.movsValidos) {
      const c = Tablero.centroDe(m.fila, m.col);
      const d = Math.hypot(x - c.x, y - c.y);
      if (d <= mejorDist) { mejor = m; mejorDist = d; }
    }
    return mejor;
  }

  /**
   * Aplica el movimiento: actualiza el tablero, anima la ficha hasta el agujero,
   * hace desaparecer la ficha comida y verifica si el juego terminó.
   */
  realizarMovimiento(ficha, mov) {
    const ahora = performance.now();
    if (!this.timerCorriendo) this.iniciarTimer(ahora);   // primera jugada → arranca el timer

    const capturada = this.tablero.ejecutarMovimiento(ficha, mov);
    const c = Tablero.centroDe(mov.fila, mov.col);
    ficha.arrastrando = false;
    ficha.animarHacia(c.x, c.y, ahora, 160);
    if (capturada) this.efectos.push({ ficha: capturada, t0: ahora, dur: 380 });

    this.arrastrando = false;
    this.deseleccionar();
    this.movimientos++;
    this.mostrarMensaje('');
    this.actualizarHUD();
    this.verificarFin();                                   // ¿quedan movimientos posibles?
  }

  /* ----------------------------------------------------------------
   *  HUD (timer, contadores y mensajes en el HTML)
   * ---------------------------------------------------------------- */

  /** Escribe un texto en un elemento solo si cambió (evita trabajo innecesario del DOM). */
  escribir(clave, el, texto) {
    if (!el || this.ultimoTexto[clave] === texto) return;
    this.ultimoTexto[clave] = texto;
    el.textContent = texto;
  }

  /** Muestra un mensaje de ayuda debajo del juego. */
  mostrarMensaje(texto) {
    this.escribir('mensaje', this.el.mensaje, texto);
  }

  /** Refresca timer, fichas restantes y movimientos. Se llama en cada frame. */
  actualizarHUD() {
    const seg = Math.ceil(this.tiempoRestante);
    const mm = String(Math.floor(seg / 60)).padStart(2, '0');
    const ss = String(seg % 60).padStart(2, '0');
    this.escribir('timer', this.el.timer, mm + ':' + ss);
    if (this.el.timer) this.el.timer.classList.toggle('peligro', seg <= 30 && this.estado === 'jugando');
    this.escribir('restantes', this.el.restantes, String(this.tablero.contarFichas()));
    this.escribir('movs', this.el.movs, String(this.movimientos));
  }

  /* ----------------------------------------------------------------
   *  BUCLE DE ANIMACIÓN Y DIBUJO
   * ---------------------------------------------------------------- */

  /**
   * Bucle principal (requestAnimationFrame): actualiza timer y animaciones y redibuja.
   * Corre siempre porque los hints son animados.
   */
  bucle(ts) {
    const ahora = performance.now();
    this.actualizarTimer(ahora);
    for (const f of this.tablero.todasLasFichas()) f.actualizar(ahora);
    this.efectos = this.efectos.filter(ef => ahora - ef.t0 < ef.dur);
    this.actualizarHUD();
    this.dibujar(ahora / 1000);
    requestAnimationFrame(t => this.bucle(t));
  }

  /**
   * Dibuja un frame completo. Orden (de atrás hacia adelante):
   * fondo → fichas quietas → hints → ficha arrastrada → efectos → cartel final.
   * Los hints van sobre las fichas quietas para que las flechas no queden tapadas.
   */
  dibujar(t) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, PEG.LADO, PEG.LADO);
    this.dibujarFondo();
    this.dibujarFichas(t);
    this.dibujarHints(t);
    this.dibujarFichaArrastrada(t);
    this.dibujarEfectos();
    if (this.estado !== 'jugando') this.dibujarCartelFin();
  }

  /** Dibuja la imagen de fondo del tablero (o un fondo simple si la imagen no cargó). */
  dibujarFondo() {
    const ctx = this.ctx;
    if (this.imgTablero && this.imgTablero.complete && this.imgTablero.naturalWidth > 0) {
      ctx.drawImage(this.imgTablero, 0, 0, PEG.LADO, PEG.LADO);
      return;
    }
    ctx.fillStyle = '#0a2540';
    ctx.fillRect(0, 0, PEG.LADO, PEG.LADO);
    ctx.fillStyle = '#3a2412';
    for (let f = 0; f < PEG.TAM; f++)
      for (let c = 0; c < PEG.TAM; c++)
        if (Tablero.esHoyo(f, c)) {
          const p = Tablero.centroDe(f, c);
          ctx.beginPath(); ctx.arc(p.x, p.y, PEG.RADIO_HOYO, 0, Math.PI * 2); ctx.fill();
        }
  }

  /**
   * HINTS ANIMADOS: sobre cada agujero donde se puede soltar la ficha elegida se dibuja
   *  - un resplandor que late,
   *  - un aro punteado que gira,
   *  - una flecha que rebota hacia abajo.
   * Si la ficha arrastrada está cerca de un destino, éste se pone verde y se marca
   * con una cruz roja la ficha que se va a comer.
   */
  dibujarHints(t) {
    if (!this.seleccionada || this.movsValidos.length === 0) return;
    const ctx = this.ctx;
    const activo = this.arrastrando ? this.movimientoCercano(this.seleccionada.x, this.seleccionada.y) : null;
    const pulso = 0.5 + 0.5 * Math.sin(t * 5);

    for (const m of this.movsValidos) {
      const c = Tablero.centroDe(m.fila, m.col);
      const esActivo = (m === activo);
      const color = esActivo ? '90, 230, 120' : '255, 215, 0';

      // Resplandor que late
      const g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, PEG.RADIO_HOYO + 8 * pulso);
      g.addColorStop(0, 'rgba(' + color + ', ' + (0.55 + 0.25 * pulso) + ')');
      g.addColorStop(1, 'rgba(' + color + ', 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, PEG.RADIO_HOYO + 8 * pulso, 0, Math.PI * 2);
      ctx.fill();

      // Aro punteado que gira
      ctx.save();
      ctx.strokeStyle = 'rgb(' + color + ')';
      ctx.lineWidth = esActivo ? 5 : 3;
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -t * 40;
      ctx.beginPath();
      ctx.arc(c.x, c.y, PEG.RADIO_HOYO + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Flecha que rebota sobre el agujero
      const rebote = Math.abs(Math.sin(t * 5)) * 10;
      this.dibujarFlecha(c.x, c.y - PEG.RADIO_HOYO + 4 - rebote, color);

      // Marca de la ficha que se va a comer (solo cuando se está sobre ese destino)
      if (esActivo) {
        const mc = Tablero.centroDe(m.saltadaFila, m.saltadaCol);
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 70, 70, ' + (0.7 + 0.3 * pulso) + ')';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(mc.x - 16, mc.y - 16); ctx.lineTo(mc.x + 16, mc.y + 16);
        ctx.moveTo(mc.x + 16, mc.y - 16); ctx.lineTo(mc.x - 16, mc.y + 16);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /**
   * Dibuja una flecha (triángulo) apuntando hacia abajo con la punta en (x, y).
   * @param {string} color  "r, g, b"
   */
  dibujarFlecha(x, y, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.6, 1.6);            // flecha más grande para que se note bien
    ctx.fillStyle = 'rgb(' + color + ')';
    ctx.strokeStyle = '#3b2412';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);               // punta
    ctx.lineTo(-11, -15);
    ctx.lineTo(-4, -15);
    ctx.lineTo(-4, -26);
    ctx.lineTo(4, -26);
    ctx.lineTo(4, -15);
    ctx.lineTo(11, -15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Dibuja todas las fichas quietas (menos la que se está arrastrando).
   * También aplica el temblor de las fichas trabadas.
   */
  dibujarFichas(t) {
    const ahora = performance.now();
    for (const f of this.tablero.todasLasFichas()) {
      if (f.arrastrando) continue;                 // esa se dibuja al final, por encima de todo
      this.dibujarFichaConTemblor(f, t, ahora);
    }
  }

  /** Dibuja la ficha que el usuario tiene agarrada, por encima de las demás y de los hints. */
  dibujarFichaArrastrada(t) {
    if (this.seleccionada && this.seleccionada.arrastrando) {
      this.seleccionada.dibujar(this.ctx, this.imagenes, t);
    }
  }

  /** Dibuja una ficha aplicándole (si corresponde) un pequeño temblor horizontal. */
  dibujarFichaConTemblor(ficha, t, ahora) {
    let dx = 0;
    if (ficha.temblor) {
      const p = (ahora - ficha.temblor) / 350;
      if (p >= 1) ficha.temblor = 0;
      else dx = Math.sin(p * Math.PI * 6) * 6 * (1 - p);
    }
    ficha.x += dx;
    ficha.dibujar(this.ctx, this.imagenes, t);
    ficha.x -= dx;
  }

  /** Dibuja las fichas capturadas desapareciendo (se achican, giran y se desvanecen). */
  dibujarEfectos() {
    const ctx = this.ctx;
    const ahora = performance.now();
    for (const ef of this.efectos) {
      const p = Math.min(1, (ahora - ef.t0) / ef.dur);
      const f = ef.ficha;
      const img = this.imagenes[f.tipo];
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.translate(f.x, f.y - p * 18);
      ctx.rotate(f.angulo + p * 1.2);
      const r = f.radio * (1 - 0.6 * p);
      if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, -r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Cartel final dibujado sobre el canvas, con fundido de entrada y botón "Jugar de nuevo". */
  dibujarCartelFin() {
    const ctx = this.ctx;
    const a = Math.min(1, (performance.now() - this.tFin) / 400);   // fundido de 0.4 s
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(12, 8, 4, 0.78)';
    ctx.fillRect(0, 0, PEG.LADO, PEG.LADO);

    // Panel tipo pergamino
    ctx.fillStyle = '#ead9a8';
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 8;
    this.rectRedondeado(110, 230, 500, 320, 6);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#3b2412';
    ctx.font = '800 38px Inter, sans-serif';
    ctx.fillText(this.tituloFin(), 360, 305);
    ctx.font = '20px Inter, sans-serif';
    ctx.fillText(this.subtituloFin(), 360, 355);
    ctx.fillText('Fichas: ' + this.tablero.contarFichas() + '   ·   Movimientos: ' + this.movimientos, 360, 395);

    // Botón
    const b = this.botonFin;
    ctx.fillStyle = '#f2b705';
    ctx.strokeStyle = '#6b4200';
    ctx.lineWidth = 4;
    this.rectRedondeado(b.x, b.y, b.w, b.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3b2412';
    ctx.font = '700 22px Inter, sans-serif';
    ctx.fillText('Jugar de nuevo', b.x + b.w / 2, b.y + 37);
    ctx.restore();
  }

  /** Traza (sin rellenar) un rectángulo con esquinas redondeadas. */
  rectRedondeado(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
