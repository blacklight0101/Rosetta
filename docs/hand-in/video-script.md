# Guion del vídeo del Hito 1 (unos 5 minutos)

| | |
|---|---|
| **Idioma** | Español (Q-03, DEC-101) |
| **Duración** | Unos 5 minutos, 300 segundos (Q-02, DEC-101) |
| **Quién graba** | El propietario, BlackLigth (blacklight0101). Claude redacta el guion. |
| **Contenido** | Un explicador animado hecho con Claude y un clip de una ejecución real en la página web |
| **Fuente de las cifras** | Las mismas que [las diapositivas](slides/slides.md); cada cifra cita su fuente allí |
| **URL del vídeo** | [PENDIENTE: URL del vídeo publicado] |

Los tiempos entre corchetes marcan cada segmento. Los segmentos son continuos y suman exactamente 5:00 (300 segundos).

En cada segmento, **Tiempo** indica cuántos segundos ocupa la narración (estimada a 150 palabras por minuto) y cuántos ocupan la animación o el clip del propietario. La narración suma unos 150 segundos; el resto del vídeo lo cubren la animación y el clip, que el propietario produce y graba.

## [0:00-0:20] Apertura

**Narración:** Esto es Rosetta. Toma un repositorio legado y devuelve una especificación en la que cada afirmación apunta a las líneas de código de las que sale.

**Imagen:** Explicador animado, cabecera con el nombre del proyecto y el hito.

**Tiempo:** narración ~11 s; resto (imagen o clip): 9 s.

## [0:20-0:50] Problema

**Narración:** Muchas empresas siguen usando software de hace diez a veinticinco años. Nadie sabe exactamente qué hace, la documentación falta y las reglas están escondidas en el código. Descubrirlas a mano lleva semanas.

**Imagen:** Explicador animado: código antiguo, reglas sueltas y un documento con preguntas.

**Tiempo:** narración ~13 s; resto (imagen o clip): 17 s.

## [0:50-1:30] Qué hace Rosetta

**Narración:** Rosetta trabaja en cinco pasos. Primero, el mapa del código sin IA. Después, agentes leen cada área y escriben tarjetas con citas. El verificador comprueba cada cita. Por último, un informe y un paquete de traspaso que un equipo puede construir.

**Imagen:** Explicador animado del pipeline: scan, understand, verify, report, plan. Indicar que en el hito están scan y understand sobre un área, y el informe Markdown con el informe de ejemplo.

**Tiempo:** narración ~18 s; resto (imagen o clip): 22 s.

## [1:30-2:15] Demostración: una ejecución real

**Narración:** Aquí se ve una ejecución de understand sobre un área de la aplicación de demostración. Cada agente aparece en la página, con lo que está haciendo, y el coste sube en vivo.

**Imagen:** CLIP de una ejecución real grabada desde la página web: [PENDIENTE: clip del propietario]. Mostrar el panel de agentes y el medidor de coste.

**Tiempo:** narración ~13 s; resto (imagen o clip): 32 s. Casi todo el resto es el clip de la ejecución real.

## [2:15-3:00] Evidencia y verificador

**Narración:** Cada tarjeta cita archivo y líneas. Si la cita no existe, la afirmación queda marcada como cita inválida. Las afirmaciones rechazadas no se borran: se muestran con el motivo. En el hito, el segundo paso del verificador, el que usa un modelo, todavía no está construido; hasta entonces, una afirmación con cita válida aparece como pendiente de verificación por modelo.

**Imagen:** Una tarjeta con su cita abierta junto al código; una afirmación marcada como cita inválida.

**Tiempo:** narración ~25 s; resto (imagen o clip): 20 s.

## [3:00-3:40] Coste y seguridad

**Narración:** Antes de cada ejecución, Rosetta estima el coste. Antes de cada llamada reserva el peor caso, así que los topes no se superan. Los secretos se enmascaran antes de salir de la máquina, y si el enmascarado falla, no se envía nada. Las herramientas solo leen; el repositorio analizado nunca se modifica.

**Imagen:** Explicador animado de los topes y del enmascarado de secretos.

**Tiempo:** narración ~20 s; resto (imagen o clip): 20 s.

## [3:40-4:20] Método de construcción

**Narración:** El proyecto se construye con especificación primero y pruebas primero: cada comportamiento de la especificación tiene su prueba antes que el código. Agentes de Claude escriben cada tarjeta en su propia rama. Un agente verificador independiente repite las comprobaciones y publica su veredicto. El orquestador fusiona la tarjeta cuando la CI está en verde y el verificador da PASS. Yo decido la especificación y los documentos de decisión.

**Imagen:** Explicador animado de tarjeta de tarea, prueba, código, veredicto del verificador y fusión.

**Tiempo:** narración ~28 s; resto (imagen o clip): 12 s.

## [4:20-5:00] Resultados y cierre

**Narración:** A fecha de 13 de octubre, 123 de 182 tarjetas estaban hechas. Las métricas de calidad, precisión y recuperación frente a un conjunto de referencia, son objetivos que se medirán en la entrega; no las presento como resultados. Los enlaces del repositorio, de las diapositivas y de la aplicación alojada están en el README.

**Imagen:** Pantalla final con el repositorio, el informe de ejemplo, la aplicación alojada y el vídeo. Enlaces: [PENDIENTE: URLs definitivas].

**Tiempo:** narración ~20 s; resto (imagen o clip): 20 s.

---

## Notas para el propietario

- [PENDIENTE: URL definitiva de la aplicación alojada] y [PENDIENTE: URL definitiva del informe de ejemplo (GitHub Pages)] se rellenan cuando existan; no se inventan en el guion.
- La cuenta de evaluación (cuenta de evaluación de los profesores) la crea el administrador y no aparece en el vídeo.
- El clip de la ejecución real y la animación del explicador son [PENDIENTE] y los produce el propietario; el guion no los describe como hechos.
- Si las cifras cambian antes de grabar, actualizar el guion y las diapositivas juntos.
