// Prueba el motor contra la base real: node tests/buscar.test.js
const fs = require("fs");
const path = require("path");
const S = require("../js/search.js");

const raiz = path.join(__dirname, "..");
const codigo = fs.readFileSync(path.join(raiz, "data", "compendio-data.js"), "utf8");
const ventana = {};
new Function("window", codigo)(ventana);
const idx = S.build(ventana.COMPENDIO_DATA);

const casos = [
  { q: "despido embarazada", espera: "embaraz" },
  { q: "cáncer despido", espera: "cancer" },
  { q: "vacaciones", espera: "vacacion" },
  { q: '"hostigamiento sexual"', espera: "hostigamiento" },
  { q: "sobretiempo", espera: "sobretiempo|sobretasa" },
  { q: "billetera digital pago de haberes", espera: "billetera" },
  { q: "remuneración mínima vital", espera: "remuneraci" },
  { q: "despido nulo", espera: "despid" },
  { q: "teletrabajo compensación internet", espera: "teletrabajo" },
  { q: "El Niño seguridad calor", espera: "niño|calor" },
];

let fallos = 0;
for (const c of casos) {
  const t0 = Date.now();
  const r = S.search(idx, c.q, { limite: 5 });
  const ms = Date.now() - t0;
  const top = r.resultados.slice(0, 3).map((x) => x.norma.norma.slice(0, 60));
  // Se acepta si alguna de las 3 primeras normas tiene un pasaje que contenga el término esperado
  const re = new RegExp(c.espera, "i");
  const ok = r.resultados.slice(0, 3).some((x) => x.paginas.some((pg) => re.test(S.normalize(pg.texto))));
  if (!ok) fallos++;
  console.log(`${ok ? "OK  " : "FALLO"} "${c.q}" → ${r.resultados.length} resultados (${ms} ms)`);
  top.forEach((t, i) => console.log(`        ${i + 1}. ${t}`));
}
console.log(fallos ? `\n${fallos} caso(s) con fallo` : "\nTodos los casos pasaron");
process.exitCode = fallos ? 1 : 0;
