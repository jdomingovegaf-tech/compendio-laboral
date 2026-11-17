/*
 * Motor de búsqueda de Compendio Laboral.
 * Sin dependencias ni servicios externos: todo corre en el navegador.
 *
 * - Ranking BM25 por página (trozo) con bonificación por coincidencia en el título.
 * - Frases entre comillas: deben aparecer en la norma (sin distinguir tildes ni mayúsculas).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CompendioSearch = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STOP = new Set(
    (
      "a al algo algunas algunos ante antes como con cual cuales cuando de del desde donde " +
      "e el ella ellas ellos en entre era eramos eran es esa esas ese eso esos esta estan estas " +
      "este esto estos fue ha han hasta hay la las le les lo los mas me mi mis mucho muy no " +
      "nos o os otra otros para pero poco por porque que quien quienes se sea sin sobre son " +
      "su sus tambien te tiene tengo tu tus u un una unas uno unos y ya yo si"
    ).split(/\s+/)
  );

  function normalize(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  // Formas verbales y de familia de palabras que el radical no unifica solo.
  const IRREG = {
    despedido: "despido", despedida: "despido", despedidos: "despido", despedidas: "despido",
    despedir: "despido", despidieron: "despido", despidio: "despido", despidió: "despido",
    despiden: "despido", despidan: "despido", despedidos: "despido",
    renuncie: "renuncia", renunciar: "renuncia", renunciaron: "renuncia",
    embarazada: "embarazo", embarazadas: "embarazo", embarazos: "embarazo",
  };

  function tokens(s) {
    return normalize(s)
      .split(" ")
      .map((t) => IRREG[t] || t)
      .filter((t) => t.length >= 2 && !STOP.has(t));
  }

  // Radical sencillo para el español. Lo importante es que la misma palabra en
  // singular, plural, masculino y femenino dé el mismo radical.
  const SUF = [
    "amientos", "imientos", "amiento", "imiento", "aciones", "iciones", "acion", "icion",
    "idades", "idad", "mente", "ables", "ibles", "able", "ible", "adores", "adoras", "ador", "adora",
    "ando", "iendo", "ados", "adas", "ado", "ada", "ides", "ido", "ida", "ancia",
    "encia", "istas", "ista", "ivos", "iva", "ivo", "ores", "oras", "ora", "or",
    "es", "os", "as", "s", "a", "o", "e",
  ].sort((a, b) => b.length - a.length);

  function stem(t) {
    for (const s of SUF) {
      if (t.endsWith(s) && t.length - s.length >= 4) return t.slice(0, -s.length);
    }
    return t;
  }

  function uniq(a) {
    return [...new Set(a)];
  }

  /** Interpreta la consulta: palabras sueltas y frases entre comillas. */
  function parseQuery(q) {
    const frases = [];
    const resto = String(q).replace(/"([^"]+)"|“([^”]+)”/g, (m, a, b) => {
      const f = normalize(a || b);
      if (f) frases.push(f);
      return " ";
    });
    const palabras = uniq(tokens(resto));
    const principales = uniq(palabras.concat(frases.flatMap((f) => tokens(f)))).map(stem);
    const termsP = uniq(principales).map((s) => ({ s, w: 1 }));

    return { frases, palabras, terminos: termsP, vacia: termsP.length === 0 && frases.length === 0 };
  }

  /** Construye el índice una sola vez a partir de los datos generados. */
  function build(data) {
    const chunks = [];
    const normas = [];
    for (const n of data.normas) {
      const idxNorma = normas.length;
      normas.push({ n, titulo: new Set(tokens([n.norma, n.descripcion, n.seccion].join(" ")).map(stem)) });
      for (const t of n.trozos) {
        const tf = new Map();
        let len = 0;
        for (const x of tokens(t.t)) {
          const s = stem(x);
          tf.set(s, (tf.get(s) || 0) + 1);
          len++;
        }
        chunks.push({ norma: idxNorma, p: t.p, t: t.t, nt: " " + normalize(t.t) + " ", tf, len });
      }
    }
    const postings = new Map();
    let totalLen = 0;
    chunks.forEach((c, ci) => {
      totalLen += c.len;
      for (const [s, f] of c.tf) {
        if (!postings.has(s)) postings.set(s, []);
        postings.get(s).push([ci, f]);
      }
    });
    return {
      normas,
      chunks,
      postings,
      avglen: chunks.length ? totalLen / chunks.length : 1,
      N: chunks.length,
    };
  }

  const K1 = 1.2;
  const B = 0.75;

  /**
   * Busca. opts: { tipo, origen, seccion, limite }
   * Devuelve resultados ordenados por relevancia, agrupados por norma.
   */
  function search(index, q, opts = {}) {
    const pq = parseQuery(q);
    if (pq.vacia) return { consulta: pq, resultados: [] };

    // 1) Puntaje BM25 por trozo
    const score = new Map(); // ci -> {s, matched:Set}
    for (const { s, w } of pq.terminos) {
      const lista = index.postings.get(s);
      if (!lista) continue;
      const df = lista.length;
      const idf = Math.log(1 + (index.N - df + 0.5) / (df + 0.5));
      for (const [ci, f] of lista) {
        const c = index.chunks[ci];
        const val = (w * idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * c.len) / index.avglen));
        let e = score.get(ci);
        if (!e) score.set(ci, (e = { s: 0, matched: new Set() }));
        e.s += val;
        e.matched.add(s);
      }
    }

    // 2) Bonificación por título
    const bonus = new Map(); // norma -> puntos
    pq.terminos.forEach(({ s, w }) => {
      index.normas.forEach((N, ni) => {
        if (N.titulo.has(s)) bonus.set(ni, (bonus.get(ni) || 0) + 3 * w);
      });
    });

    // 3) Frases: cada frase debe aparecer en alguna página de la norma
    const frasesOk = new Map(); // norma -> Set(frases encontradas)
    if (pq.frases.length) {
      for (const c of index.chunks) {
        const texto = c.nt;
        for (const f of pq.frases) {
          if (texto.includes(" " + f + " ")) {
            if (!frasesOk.has(c.norma)) frasesOk.set(c.norma, new Set());
            frasesOk.get(c.norma).add(f);
          }
        }
      }
    }
    const frasesDeChunk = new Map();
    if (pq.frases.length) {
      for (let ci = 0; ci < index.chunks.length; ci++) {
        const c = index.chunks[ci];
        if (!c.t) continue;
        const texto = c.nt;
        let k = 0;
        for (const f of pq.frases) if (texto.includes(" " + f + " ")) k++;
        if (k) frasesDeChunk.set(ci, k);
      }
    }

    // 4) Agregar por norma
    const porNorma = new Map();
    for (const [ci, e] of score) {
      const c = index.chunks[ci];
      let total = e.s * (1 + (frasesDeChunk.get(ci) || 0));
      if (!porNorma.has(c.norma)) porNorma.set(c.norma, []);
      porNorma.get(c.norma).push({ ci, p: c.p, s: total, matched: e.matched });
    }
    const candidatas = new Set([...porNorma.keys(), ...bonus.keys()]);

    const resultados = [];
    for (const ni of candidatas) {
      if (pq.frases.length) {
        const ok = frasesOk.get(ni);
        if (!ok || ok.size < pq.frases.length) continue;
      }
      const lista = (porNorma.get(ni) || []).sort((a, b) => b.s - a.s);
      const top = lista.slice(0, 3);
      const puntaje =
        (bonus.get(ni) || 0) +
        (top[0] ? top[0].s : 0) +
        0.2 * (top[1] ? top[1].s : 0) +
        0.1 * (top[2] ? top[2].s : 0) +
        (frasesOk.get(ni) ? 2 * frasesOk.get(ni).size : 0);
      const terminosHallados = uniq(lista.flatMap((x) => [...x.matched]));
      resultados.push({
        norma: index.normas[ni].n,
        puntaje,
        paginas: top.map((x) => ({ p: index.chunks[x.ci].p, texto: index.chunks[x.ci].t, ci: x.ci })),
        terminosHallados,
        frasesEncontradas: frasesOk.has(ni) ? [...frasesOk.get(ni)] : [],
      });
    }

    // 5) Filtros y orden
    let out = resultados.filter((r) => {
      const n = r.norma;
      if (opts.tipo && opts.tipo !== "todos" && n.tipo !== opts.tipo) return false;
      if (opts.origen && opts.origen !== "todos" && n.origen !== opts.origen) return false;
      if (opts.seccion && opts.seccion !== "todas" && n.seccion !== opts.seccion) return false;
      return true;
    });
    out.sort((a, b) => b.puntaje - a.puntaje);
    // Se descartan las coincidencias débiles frente a la mejor
    if (out.length) {
      const minimo = out[0].puntaje * 0.2;
      out = out.filter((r) => r.puntaje >= minimo);
    }
    if (opts.limite) out = out.slice(0, opts.limite);
    return { consulta: pq, resultados: out };
  }

  /** Expresión regular que ignora tildes y mayúsculas para resaltar los términos. */
  function highlightRegex(stems, frases = []) {
    const clase = (ch) => {
      const m = { a: "aáÁA", e: "eéÉE", i: "iíÍI", o: "oóÓO", u: "uúüÚÜU", n: "nñÑN" };
      const k = ch.toLowerCase();
      if (m[k]) return "[" + m[k] + "]";
      return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };
    const partes = [];
    for (const f of frases) {
      partes.push(f.split(" ").map((w) => w.split("").map(clase).join("")).join("[\\s\\p{P}]+"));
    }
    const radicales = uniq(stems).filter((s) => s.length >= 2).sort((a, b) => b.length - a.length);
    for (const s of radicales) partes.push(s.split("").map(clase).join("") + "[\\p{L}\\p{N}]*");
    if (!partes.length) return null;
    return new RegExp("(?<![\\p{L}\\p{N}])(" + partes.join("|") + ")", "giu");
  }

  /** Fragmento alrededor de la primera coincidencia. Devuelve texto plano. */
  function extracto(texto, re, radio = 170) {
    if (!re) return { antes: texto.slice(0, radio * 2), medio: "", despues: "" };
    re.lastIndex = 0;
    const m = re.exec(texto);
    if (!m) return { antes: texto.slice(0, radio * 2).replace(/\s+/g, " "), medio: "", despues: "" };
    const ini = Math.max(0, m.index - radio);
    const fin = Math.min(texto.length, m.index + m[0].length + radio);
    return {
      antes: (ini > 0 ? "… " : "") + texto.slice(ini, m.index).replace(/\s+/g, " "),
      medio: m[0],
      despues: texto.slice(m.index + m[0].length, fin).replace(/\s+/g, " ") + (fin < texto.length ? " …" : ""),
    };
  }

  return { normalize, tokens, stem, parseQuery, build, search, highlightRegex, extracto, STOP };
});
