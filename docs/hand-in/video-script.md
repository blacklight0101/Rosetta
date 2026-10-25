# Guion del vídeo del Hito 1: recorrido completo por Rosetta (5 minutos)

|                        |                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Idioma**             | Español (Q-03, DEC-101). Los nombres de fases, roles y estados se dicen en inglés, como en la aplicación.                            |
| **Duración**           | 5:00, 300 segundos (Q-02, DEC-101), en 13 segmentos continuos                                                                        |
| **Quién graba**        | El propietario, BlackLigth (blacklight0101). Claude redacta el guion.                                                                |
| **Contenido**          | Un recorrido grabado por la aplicación alojada, con la cuenta de evaluación, sobre la aplicación de demostración eShopLegacyWebForms |
| **Aplicación alojada** | <https://ca-rosetta.nicewater-1ef3fc33.spaincentral.azurecontainerapps.io>                                                           |
| **Informe de ejemplo** | <https://blacklight0101.github.io/Rosetta/>                                                                                          |
| **Diapositivas**       | [Rosetta-Hito1.pdf](slides/Rosetta-Hito1.pdf); cada cifra cita su fuente en las notas de la diapositiva                              |
| **URL del vídeo**      | [PENDIENTE: URL del vídeo publicado]                                                                                                 |

Los tiempos entre corchetes marcan cada segmento. Los segmentos son continuos y suman exactamente 5:00 (300 segundos).

En cada segmento, **Tiempo** indica cuántos segundos ocupa la narración (estimada a 150 palabras por minuto) y cuántos ocupan las imágenes de la aplicación sin voz.

## Antes de grabar

1. **Prepara las ejecuciones antes.** Understand y Plan tardan varios minutos. Crea el proyecto y lanza Scan, Understand, Deepen y Plan una vez antes de grabar, para tener cada página lista. Durante la grabación lanza solo un Understand nuevo para enseñar los agentes en vivo y acelera ese tramo en la edición (x4 a x8).
2. **Modelos:** Claude Haiku 5.5 en todos los roles (la ejecución completa de demostración costó 0,114 USD).
3. **Navegador:** ventana a 1920×1080, zoom al 110 %, sin marcadores ni pestañas personales. No enseñes la contraseña ni la página de claves.
4. **Ten abiertos de antemano:** la página de la ejecución terminada, una tarjeta con su cita, el Plan setup, el paquete descargado y descomprimido, y la diapositiva 15, la de resultados.

---

## [0:00-0:20] Apertura

**Narración:** Esto es Rosetta. Toma el código de un sistema antiguo y devuelve una especificación verificada, en la que cada afirmación apunta a las líneas de código de las que sale, y un paquete para construir el sistema nuevo.

**Pantalla:** La página de inicio de Rosetta (la portada pública) con el logo.

**Tiempo:** narración ~15 s; resto (imagen o clip): 5 s.

## [0:20-0:40] Problema

**Narración:** Muchas empresas siguen usando software de hace diez a veinticinco años. La documentación falta y las reglas de negocio están escondidas en el código. Un asistente de IA sin más no basta: no se puede comprobar de dónde sale cada respuesta.

**Pantalla:** Diapositiva 2 o 3, o un plano del código antiguo de eShopLegacyWebForms en GitHub.

**Tiempo:** narración ~16 s; resto (imagen o clip): 4 s.

## [0:40-1:00] Entrar y crear el proyecto

**Narración:** Entro con una cuenta creada por el administrador. Un proyecto puede ser un repositorio público de GitHub, un zip con el código o libros de Excel. Uso la aplicación de demostración de Microsoft, fijada a un commit.

**Pantalla:** Iniciar sesión (no se ve la contraseña). Página **Projects**: las tres opciones (GitHub repository, Upload a zip, Excel workbooks). Pegar la URL del repositorio de demostración y pulsar **Create project**.

**Tiempo:** narración ~15 s; resto (imagen o clip): 5 s.

## [1:00-1:20] Modelos por rol y topes

**Narración:** Cada rol, reader, verifier, planner y summariser, elige su proveedor y su modelo: Anthropic, OpenAI u Ollama en local. Aquí también se fijan los topes de coste y de tokens de cada ejecución.

**Pantalla:** **Settings** del proyecto: los cuatro roles con Claude Haiku 5.5, y la sección **Caps** (Run cost cap, Run token cap).

**Tiempo:** narración ~13 s; resto (imagen o clip): 7 s.

## [1:20-1:40] Scan

**Narración:** El primer paso, Scan, no usa IA y no cuesta nada. Lee el código, reconoce los lenguajes y los puntos de entrada, y divide la aplicación en áreas.

**Pantalla:** **Start a run** con **Scan only**, pulsar **Start run**; después, la lista de áreas con sus tokens.

**Tiempo:** narración ~11 s; resto (imagen o clip): 9 s.

## [1:40-2:10] Understand en vivo

**Narración:** Antes de Understand, Rosetta estima el coste por rol y pide consentimiento, porque el código va a salir hacia el proveedor. Al empezar, cada agente reader aparece en la página con lo que está leyendo, y el coste sube en vivo, siempre por debajo del tope.

**Pantalla:** **Understand**: tabla **Estimate per role**, las casillas de consentimiento, **Start run**. Después la página **Live run**: agentes trabajando y el contador de coste. Acelera este tramo en la edición.

**Tiempo:** narración ~18 s; resto (imagen o clip): 12 s.

## [2:10-2:45] Evidencia y verifier

**Narración:** Cada afirmación es una tarjeta con al menos una cita de archivo y líneas. Primero se comprueba que la cita existe. Después el verifier, otro modelo, juzga si el código la sostiene: queda como Supported o Rejected. Lo rechazado no se borra; se muestra con su motivo. Abro una tarjeta y la cita me lleva a las líneas exactas.

**Pantalla:** Pestaña **Evidence**: una tarjeta (por ejemplo una regla de negocio, BR-…) con su cita; abrirla y ver el código citado. Después un claim **Rejected** con su motivo y el resumen **Supported share**.

**Tiempo:** narración ~24 s; resto (imagen o clip): 11 s.

## [2:45-3:05] Preguntas y Deepen

**Narración:** Lo que el código no puede responder se convierte en preguntas para una persona. Y si quedan partes sin leer, Deepen vuelve a leerlas y rejuzga lo rechazado, para subir la cobertura.

**Pantalla:** Pestaña **Your questions** con una pregunta y su respuesta por defecto. Después el panel **Deepen this run** y el indicador de cobertura.

**Tiempo:** narración ~13 s; resto (imagen o clip): 7 s.

## [3:05-3:35] Plan setup y Plan

**Narración:** Con la evidencia verificada, preparo el plan. Elijo los principios, como SOLID o pruebas primero, el estilo de arquitectura, la estrategia de migración y el stack. Lo que no respondo queda como pregunta abierta, con su valor por defecto. Rosetta estima el coste del planner y escribe el paquete.

**Pantalla:** **Plan setup**: pestañas Principles, Architecture, Migration, Stack, Project context, Build method; el resumen **What I recorded** y la estimación; pulsar **Write the package**. Después la ejecución Plan terminada.

**Tiempo:** narración ~20 s; resto (imagen o clip): 10 s.

## [3:35-4:00] El paquete de traspaso

**Narración:** El resultado es un paquete independiente de cualquier herramienta: requisitos, modelo de datos, contrato de API, arquitectura, decisiones, hoja de ruta y tarjetas de tarea. Cada requisito enlaza las tarjetas de evidencia de las que sale.

**Pantalla:** Pulsar **Download hand-off zip** y abrir la carpeta: `README.md` (orden de lectura), `prd.md`, `architecture.md` con su diagrama, `decisions/`, `roadmap.md` y una tarjeta de `tasks.md` con sus pruebas.

**Tiempo:** narración ~14 s; resto (imagen o clip): 11 s.

## [4:00-4:20] Coste, seguridad y registros

**Narración:** Todo queda registrado: cada llamada al modelo, sus tokens y su coste. Los secretos se enmascaran antes de salir, y si el enmascarado falla no se envía nada. Las herramientas solo leen; el código analizado nunca se modifica.

**Pantalla:** **API calls and logs** de la ejecución: la lista de llamadas con tokens y coste, y el registro de egreso.

**Tiempo:** narración ~15 s; resto (imagen o clip): 5 s.

## [4:20-4:40] Resultados medidos

**Narración:** Lo he medido contra un conjunto de referencia evaluado a mano: el noventa y nueve por ciento de las afirmaciones Supported son correctas, encuentra el ochenta y siete por ciento de las reglas conocidas y todas las citas son válidas. Una ejecución completa cuesta unos once céntimos.

**Pantalla:** Diapositiva 15 (Objetivos de la release 1 frente a lo medido).

**Tiempo:** narración ~19 s; resto (imagen o clip): 1 s.

## [4:40-5:00] Cierre

**Narración:** Rosetta se construyó con especificación y pruebas primero: cada comportamiento de la especificación tiene su prueba antes que el código, y un agente verificador independiente revisa cada tarjeta. Los enlaces están en el repositorio.

**Pantalla:** Pantalla final con el logo y los enlaces: la aplicación alojada, el informe de ejemplo, las diapositivas y el repositorio https://github.com/blacklight0101/Rosetta.

**Tiempo:** narración ~14 s; resto (imagen o clip): 6 s.

---

## Notas

- Las cifras salen de la evaluación del 2026-10-25 (3 ejecuciones con Claude Haiku 5.5 sobre eShopLegacyWebForms) y de la ejecución alojada del 2026-10-24 (0,114 USD). Si cambian, actualiza el guion y la diapositiva 15 juntos.
- En pantalla no deben verse la contraseña, la página **Settings and keys** ni ningún dato que no sea de la demostración.
- Si un tramo se queda corto, recorta la pantalla, no la narración; si se queda largo, el primer candidato a recortar es el segmento de Problema.
