(function () {
  "use strict";
  const S = window.CompendioSearch;
  const D = window.COMPENDIO_DATA;
  const IDX = S.build(D);

  const $ = (id) => document.getElementById(id);
  const estado = { ultima: null };

  // ---------- utilidades DOM (sin innerHTML con texto de la norma) ----------
  function el(tag, props, ...hijos) {
    const n = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === false || v == null) continue;
        if (k === "class") n.className = v;
        else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const h of hijos.flat()) {
      if (h == null || h === false) continue;
      n.append(h instanceof Node ? h : document.createTextNode(String(h)));
    }
    return n;
  }

  /** Convierte un texto en nodos, marcando las coincidencias. */
  function resaltar(texto, re) {
    if (!re) return [texto];
    const nodos = [];
    let pos = 0;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(texto)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      if (m.index > pos) nodos.push(texto.slice(pos, m.index));
      nodos.push(el("mark", null, m[0]));
      pos = m.index + m[0].length;
    }
    if (pos < texto.length) nodos.push(texto.slice(pos));
    return nodos;
  }

  function etiquetaOrigen(n) {
    if (n.origen === "documento") return "Documento orientador";
    if (n.origen === "posterior") return "Posterior al compendio";
    return "Compendio (corte 21/10/2024)";
  }

  function citar(n, p) {
    const desc = n.descripcion ? ` (${n.descripcion})` : "";
    const pag = p != null ? `, pág. ${p} del PDF` : "";
    return `${n.norma}${desc}${pag}`;
  }

  async function copiar(texto, boton) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch (e) {
      const area = el("textarea", { class: "sr-only" }, texto);
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    const previo = boton.textContent;
    boton.textContent = "Cita copiada";
    setTimeout(() => (boton.textContent = previo), 1600);
  }

  // ---------- filtros ----------
  function llenarFiltros() {
    const tipos = [...new Set(D.normas.map((n) => n.tipo))].sort();
    const secciones = [...new Set(D.normas.map((n) => n.seccion))];
    const selTipo = $("f-tipo");
    selTipo.append(el("option", { value: "todos" }, "Todos los tipos"));
    tipos.forEach((t) => selTipo.append(el("option", { value: t }, t)));
    const selSec = $("f-seccion");
    selSec.append(el("option", { value: "todas" }, "Todas las materias"));
    secciones.forEach((s) => selSec.append(el("option", { value: s }, s)));
  }

  function filtros() {
    return {
      tipo: $("f-tipo").value,
      origen: $("f-origen").value,
      seccion: $("f-seccion").value,
      limite: 25,
    };
  }

  // ---------- resultados ----------
  function tarjeta(r, pq) {
    const n = r.norma;
    const stems = new Set(r.terminosHallados);
    const palabras = [...new Set(pq.palabras)].filter((w) => stems.has(S.stem(w)));
    const frases = r.frasesEncontradas || [];

    const etiquetas = el("div", { class: "etiquetas" },
      el("span", { class: "etiqueta" }, n.tipo),
      el("span", { class: "etiqueta suave" }, etiquetaOrigen(n)),
      el("span", { class: "etiqueta suave" }, n.seccion),
    );

    const re = S.highlightRegex(pq.terminos.map((t) => t.s), pq.frases);
    const pasajes = r.paginas.slice(0, 2).map((pg) => {
      const ex = S.extracto(pg.texto, re, 150);
      return el("div", { class: "pasaje" },
        el("span", { class: "pag" }, pg.p != null ? `Pág. ${pg.p} del PDF` : "Texto"),
        el("span", { class: "fragmento" },
          ex.antes, ...(ex.medio ? [el("mark", null, ex.medio)] : []), ex.despues));
    });

    const acciones = el("div", { class: "acciones" },
      el("button", { type: "button", class: "boton", onclick: () => abrirVisor(n, pq) }, "Abrir norma"),
      el("button", { type: "button", class: "boton", onclick: (e) => copiar(citar(n, r.paginas[0] && r.paginas[0].p), e.currentTarget) }, "Copiar cita"),
    );

    return el("article", { class: "tarjeta" },
      etiquetas,
      el("h3", null, n.norma),
      n.descripcion ? el("p", { class: "descripcion" }, n.descripcion) : null,
      palabras.length || frases.length
        ? el("div", { class: "etiquetas" },
            ...palabras.map((w) => el("span", { class: "etiqueta" }, w)),
            ...frases.map((f) => el("span", { class: "etiqueta" }, `“${f}”`)))
        : null,
      ...pasajes,
      acciones);
  }

  function buscar(consulta) {
    const q = consulta.trim();
    estado.ultima = q;
    const res = S.search(IDX, q, filtros());
    const cont = $("resultados");
    cont.replaceChildren();
    const resumen = $("resumen");

    if (res.consulta.vacia) {
      resumen.textContent = "";
      cont.append(el("div", { class: "vacio" }, "Escribe una palabra o una frase entre comillas."));
      return;
    }
    if (!res.resultados.length) {
      resumen.textContent = "";
      cont.append(el("div", { class: "vacio" },
        "No encontré normas con esos términos. Prueba con menos palabras o con sinónimos (por ejemplo “despido” en vez de “me echaron”). Si cambiaste un filtro, intenta con “Todos”."));
      return;
    }
    const total = res.resultados.length;
    const tope = total >= 25;
    resumen.textContent = `${total} ${total === 1 ? "norma encontrada" : "normas encontradas"}${tope ? " (se muestran las 25 más relevantes)" : ""}, de más a menos relevante.`;
    res.resultados.forEach((r) => cont.append(tarjeta(r, res.consulta)));
  }

  // ---------- visor ----------
  let coincidencias = [];
  let posicion = -1;
  let normaActual = null;

  function pintarNorma(n, consultaTexto) {
    const pq = S.parseQuery(consultaTexto || "", "palabras");
    const re = S.highlightRegex(pq.terminos.map((t) => t.s), pq.frases);
    const cont = $("visor-texto");
    cont.replaceChildren();
    coincidencias = [];
    posicion = -1;
    if (!n.trozos.length) cont.append(el("p", null, "Sin texto disponible."));
    n.trozos.forEach((t, i) => {
      const id = `pg-${i}`;
      const parrafo = el("p", null, resaltar(t.t, re));
      cont.append(el("section", { class: "pagina", id },
        el("h4", null, t.p != null ? `Pág. ${t.p} del PDF` : "Texto"),
        parrafo));
    });
    if (re) {
      coincidencias = [...cont.querySelectorAll("mark")];
    }
    $("visor-contador").textContent = re
      ? (coincidencias.length ? `${coincidencias.length} coincidencias` : "Sin coincidencias")
      : "";
  }

  function siguiente() {
    if (!coincidencias.length) return;
    posicion = (posicion + 1) % coincidencias.length;
    coincidencias.forEach((m) => m.removeAttribute("data-actual"));
    const m = coincidencias[posicion];
    m.setAttribute("data-actual", "");
    m.style.background = "var(--acento)";
    m.style.color = "#fff";
    coincidencias.forEach((x) => { if (x !== m) { x.style.background = ""; x.style.color = ""; } });
    m.scrollIntoView({ block: "center" });
    $("visor-contador").textContent = `${posicion + 1} de ${coincidencias.length}`;
  }

  function abrirVisor(n, pq) {
    normaActual = n;
    $("visor-titulo").textContent = n.norma;
    $("visor-sub").textContent = [n.descripcion, etiquetaOrigen(n), `Archivo: ${n.archivo}`].filter(Boolean).join(" · ");
    const texto = pq ? pq.palabras.concat(pq.frases.map((f) => `"${f}"`)).join(" ") : "";
    $("visor-buscar").value = texto;
    $("visor").hidden = false;
    document.body.style.overflow = "hidden";
    pintarNorma(n, texto);
    $("visor-cerrar").focus();
    if (coincidencias.length) siguiente();
  }

  function cerrarVisor() {
    $("visor").hidden = true;
    document.body.style.overflow = "";
  }

  // ---------- inicio ----------
  function iniciar() {
    llenarFiltros();
    $("fecha-base").textContent = D.generado;
    $("total-normas").textContent = D.total_normas;

    const ejemplos = [
      "vacaciones truncas",
      "\"hostigamiento sexual\"",
      "teletrabajo compensación internet",
      "descanso sentado",
      "billetera digital pago de haberes",
      "\"cese de servidor\"",
    ];
    const cont = $("ejemplos");
    ejemplos.forEach((texto) =>
      cont.append(el("button", {
        type: "button", class: "ejemplo",
        onclick: () => {
          $("consulta").value = texto;
          buscar(texto);
        },
      }, texto)));

    $("consulta").placeholder = 'Ej.: vacaciones truncas   ·   "hostigamiento sexual"';

    $("formulario").addEventListener("submit", (e) => {
      e.preventDefault();
      buscar($("consulta").value);
    });
    $("consulta").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); buscar($("consulta").value); }
    });
    ["f-tipo", "f-origen", "f-seccion"].forEach((id) =>
      $(id).addEventListener("change", () => { if (estado.ultima != null) buscar(estado.ultima || $("consulta").value); }));

    $("visor-cerrar").addEventListener("click", cerrarVisor);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("visor").hidden) cerrarVisor(); });
    $("visor-siguiente").addEventListener("click", siguiente);
    $("visor-buscar").addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); pintarNorma(normaActual, $("visor-buscar").value); siguiente(); }
    });
  }

  iniciar();
})();
