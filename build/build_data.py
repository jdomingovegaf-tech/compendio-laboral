#!/usr/bin/env python3
"""Genera data/compendio-data.js a partir de la base de normas laborales.

Uso:
  python3 build/build_data.py "/ruta/a/Normas_laborales_Consulta"

Lee INDICE.md (secciones, nombres y descripciones) y textos/*.txt (texto por página).
La app no necesita el disco externo una vez generado el archivo de datos.
"""
import json, os, re, sys, datetime

BASE = sys.argv[1] if len(sys.argv) > 1 else "/Volumes/Trabajos/Normas Legales/Normas_laborales_Consulta"
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(APP, "data", "compendio-data.js")
SEP = "=" * 80
MARK = re.compile(r"^\[pág\. PDF (\d+)\]\s*$", re.M)


def leer_indice(path):
    """Devuelve {archivo: {seccion, norma, descripcion, paginas_indice}}."""
    info, seccion = {}, ""
    for linea in open(path, encoding="utf-8"):
        linea = linea.rstrip("\n")
        if linea.startswith("## "):
            seccion = linea[3:].strip()
            continue
        m = re.search(r"`textos/([^`]+)`", linea)
        if not linea.startswith("| ") or not m:
            continue
        celdas = [c.strip() for c in linea.strip().strip("|").split("|")]
        if len(celdas) < 5:
            continue
        info[m.group(1)] = {
            "seccion": seccion,
            "paginas": celdas[1],
            "norma": celdas[2],
            "descripcion": celdas[3] if celdas[3] not in ("-", "—", "") else "",
        }
    return info


def tipo_de(norma):
    u = norma.upper()
    if "GUÍA" in u or "GUIA" in u or "PROTOCOLO" in u or "ESTRATEGIA" in u:
        return "Documento orientador"
    if u.startswith("LEY"):
        return "Ley"
    if u.startswith("DECRETO SUPREMO"):
        return "Decreto supremo"
    if u.startswith("DECRETO LEGISLATIVO"):
        return "Decreto legislativo"
    if u.startswith("DECRETO DE URGENCIA"):
        return "Decreto de urgencia"
    if u.startswith("RESOLUCIÓN MINISTERIAL") or u.startswith("RESOLUCION MINISTERIAL"):
        return "Resolución ministerial"
    if u.startswith("RESOLUCIÓN") or u.startswith("RESOLUCION"):
        return "Resolución"
    if u.startswith("ORDENANZA"):
        return "Ordenanza"
    return "Otro"


def fecha_de(norma):
    m = re.search(r"\(([^)]*\d{4}[^)]*)\)", norma)
    return m.group(1) if m else ""


def trozos(texto):
    """Divide el cuerpo en páginas según las marcas [pág. PDF N]. Sin marca: página null."""
    partes, pos, pagina = [], 0, None
    for m in MARK.finditer(texto):
        if texto[pos:m.start()].strip():
            partes.append({"p": pagina, "t": texto[pos:m.start()].strip()})
        pagina = int(m.group(1))
        pos = m.end()
    resto = texto[pos:].strip()
    if resto:
        partes.append({"p": pagina, "t": resto})
    return partes


def main():
    indice = leer_indice(os.path.join(BASE, "INDICE.md"))
    carpeta = os.path.join(BASE, "textos")
    archivos = sorted(f for f in os.listdir(carpeta) if f.endswith(".txt"))
    normas, sin_indice = [], []
    for n, nombre in enumerate(archivos, 1):
        raw = open(os.path.join(carpeta, nombre), encoding="utf-8").read()
        if SEP in raw:
            cuerpo = raw.split(SEP, 1)[1].lstrip("\n")
        else:
            cuerpo = raw
        ind = indice.get(nombre)
        if ind is None:
            sin_indice.append(nombre)
            ind = {"seccion": "", "norma": "", "descripcion": "", "paginas": ""}
        # Cabecera del propio archivo (para los posteriores sin entrada en el índice)
        cab = raw.split(SEP, 1)[0]
        norma = ind["norma"]
        if not norma:
            m = re.search(r"^NORMA:\s*(.*)$", cab, re.M)
            norma = m.group(1).strip() if m else nombre
        origen = "posterior" if (ind["seccion"].startswith("Normas posteriores") or "posterior_compendio" in nombre) else "compendio"
        if "orientador" in tipo_de(norma).lower() or "anexo" in nombre.lower() or "PROTOCOLO" in nombre or "GUIA" in nombre or "ESTRATEGIA" in nombre:
            origen_detalle = "documento"
        else:
            origen_detalle = origen
        normas.append({
            "id": n,
            "archivo": nombre,
            "seccion": ind["seccion"] or "Otras normas",
            "norma": norma,
            "descripcion": ind["descripcion"],
            "tipo": tipo_de(norma),
            "fecha": fecha_de(norma),
            "origen": origen_detalle,
            "paginas_indice": ind["paginas"],
            "trozos": trozos(cuerpo),
        })
    total_palabras = sum(len(t["t"].split()) for x in normas for t in x["trozos"])
    datos = {
        "generado": datetime.date.today().isoformat(),
        "corte_compendio": "21/10/2024",
        "total_normas": len(normas),
        "total_palabras": total_palabras,
        "normas": normas,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("window.COMPENDIO_DATA = " + json.dumps(datos, ensure_ascii=False) + ";\n")
    print(f"Normas: {len(normas)} · palabras: {total_palabras} · salida: {OUT}")
    if sin_indice:
        print("Sin entrada en INDICE.md (se usó la cabecera del archivo):", sin_indice)


if __name__ == "__main__":
    main()
