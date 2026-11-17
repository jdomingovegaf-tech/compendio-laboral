# Compendio Laboral

Buscador de normas laborales del régimen privado en Perú, por palabras o frases.

## Uso

Abre `index.html` en el navegador. Si el navegador bloquea archivos locales, sirve la carpeta:

    python3 -m http.server 8000

y entra a http://localhost:8000.

Todo corre en el navegador: la consulta y los documentos no se envían a ningún servidor.

## Cómo buscar

- Escribe una o varias palabras: `vacaciones truncas`.
- Para exigir una frase exacta, ponla entre comillas: `"hostigamiento sexual"`.
- Los resultados muestran los pasajes relevantes con su página del PDF. "Abrir norma" muestra el texto completo con los términos resaltados; "Copiar cita" copia la norma y la página.

## Actualizar la base

La app no lee el disco externo. Los datos están en `data/compendio-data.js`. Para regenerarlos después de agregar normas a la base:

    python3 build/build_data.py "/ruta/a/Normas_laborales_Consulta"

## Pruebas

    node tests/buscar.test.js

Ejecuta consultas de ejemplo contra la base real y comprueba que el pasaje correcto aparezca entre los primeros resultados.

## Límites

- Es una herramienta de búsqueda, no asesoría legal.
- El compendio llega al 21/10/2024. Las normas posteriores tienen su fecha en la tarjeta. Verifica vigencia y texto oficial en El Peruano antes de citar.
- Los textos escaneados (OCR) pueden tener errores; el PDF original es la fuente.
- El ranking es léxico (BM25 con radicales del español): busca coincidencias de palabras, no entiende el sentido de una descripción.
