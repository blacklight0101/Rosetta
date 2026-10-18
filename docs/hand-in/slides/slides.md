---
marp: true
theme: default
paginate: true
lang: es
footer: 'Rosetta - Hito 1 (entrega 2026-10-26)'
---

<!-- Fuente de todas las cifras: el propio repositorio (ver el pie de cada diapositiva). Lo que aún no se conoce figura como [PENDIENTE]. -->

# Rosetta

## De código legado a una especificación verificada y un paquete de entrega

BlackLigth (blacklight0101) - Hito 1 (M1), entrega 2026-10-26

---

# Problema

- Gran parte del software empresarial tiene 10 a 25 años: ASP.NET WebForms, ASP clásico, VB6, Java EE, PHP 5, Delphi.
- La documentación falta o está desfasada, y los autores ya no están.
- Las reglas de negocio reales están escondidas en manejadores de página, procedimientos almacenados, banderas de configuración y cadenas SQL.
- Descubrirlas a mano lleva semanas, depende de una persona y nadie puede comprobar de dónde sale cada afirmación.

_Fuente: [RFC-001, sección 1](../../rfc/RFC-001-rosetta.md)_

---

# Problema: usar un asistente de IA sin más

| Riesgo                   | Qué ocurre                                                               |
| ------------------------ | ------------------------------------------------------------------------ |
| Salida no verificable    | Una regla aparece en el resumen y no existe en el código                 |
| Cobertura incompleta     | El asistente lee lo que cabe en su contexto y omite el resto en silencio |
| Coste sin control        | Sesiones largas de agentes con APIs de pago y sin tope                   |
| Dependencia y privacidad | Un solo proveedor; todo el repositorio, con sus secretos, sale a la nube |
| No accionable            | Prosa que un equipo no puede convertir en plan, decisiones y tareas      |

_Fuente: [RFC-001, sección 1](../../rfc/RFC-001-rosetta.md)_

---

# Qué es Rosetta

- Una aplicación web: se le da la URL de un repositorio público de GitHub y se fija un commit.
- Analiza código de cualquier stack; con un pack de lenguaje, el mapa es más rico.
- Escribe una especificación en la que cada hallazgo cita archivo y líneas.
- Entrega un paquete de traspaso independiente de la herramienta: arquitectura objetivo, decisiones, hoja de ruta y tareas.
- No reemplaza ningún sistema. No reconstruye el sistema legado.

_Fuente: [README.md](../../../README.md) y [RFC-001, sección 2](../../rfc/RFC-001-rosetta.md)_

---

# Pipeline

1. **Scan** - mapa del código sin IA: archivos, lenguajes, puntos de entrada y áreas.
2. **Understand** - agentes leen cada área y escriben tarjetas con citas.
3. **Verify** - el verificador comprueba cada cita contra las líneas indicadas.
4. **Report** - hallazgos, veredictos y coste; en el hito 1 en Markdown, y el HTML completo en P3.
5. **Plan** - paquete de traspaso: especificación, decisiones, hoja de ruta y tareas (P3).

En el hito 1 están **scan** y **understand** sobre un área de la aplicación de demostración, con la comprobación de citas, y el informe Markdown con un informe de ejemplo en GitHub Pages (P1-50; PR #361 abierto). El HTML completo del informe y el plan llegan en la fase P3.

_Fuente: [RFC-001, secciones 4.5 y 6](../../rfc/RFC-001-rosetta.md); [handoff.md](../../../handoff.md) para el estado de cada parte_

---

# Agentes en vivo

- Cada agente que lanza una ejecución aparece en la página, con lo que está haciendo.
- Los tokens y el coste del proyecto están siempre visibles.
- La página publicada reproduce la ejecución después.
- Las llamadas a cada modelo pasan por un único puerto `LlmProvider`: Ollama en local, OpenAI y Anthropic en la nube.

_Fuente: [RFC-001, sección 2, objetivos 4 y 9](../../rfc/RFC-001-rosetta.md)_

---

# Evidencia

- Cada afirmación es una tarjeta con una o más citas `ruta:líneaInicio-líneaFin`.
- Quien revisa puede abrir la cita y comprobar la afirmación en minutos.
- Las afirmaciones rechazadas o con cita inválida **se conservan y se muestran**; nada se borra.
- Las preguntas abiertas pasan a una persona que responde en la página.

_Fuente: [RFC-001, sección 4.4](../../rfc/RFC-001-rosetta.md) y ADR-005_

---

# Verificador

Cada afirmación recorre estos estados:

- **Propuesta** - el agente la escribe con su cita.
- **Cita inválida** - el archivo o las líneas no existen.
- **Respaldada** - el verificador confirma que la evidencia la sostiene.
- **Rechazada** - la evidencia no la sostiene; se muestra con el motivo.
- **No verificada** - el run se detuvo antes de comprobarla; se puede reanudar.

En el hito 1 solo está construido el paso 1 (existencia de la cita). El segundo paso, con modelo, llega después: hasta entonces una afirmación con cita válida se muestra como pendiente de verificación por modelo.

_Fuente: [process-flows.md, sección 3](../../process-flows.md) y [RFC-001, sección 4.4](../../rfc/RFC-001-rosetta.md)_

---

# Coste

- Antes de empezar, una **estimación** por rol según la tabla de precios.
- Durante la ejecución, cada llamada se mide: tokens y coste en vivo.
- Antes de cada llamada se reserva su peor caso; si podría pasar el tope, no se hace.
- **Topes** por ejecución, por usuario y día, y por servidor y mes.
- Los modelos locales cuestan cero, pero sus tokens se registran igual.

_Fuente: [RFC-001, secciones 4.6 y 4.8](../../rfc/RFC-001-rosetta.md) y [process-flows.md, sección 4](../../process-flows.md)_

---

# Seguridad

- Las herramientas de los agentes son de solo lectura; el repositorio analizado nunca se modifica.
- Se respetan `.rosettaignore` y una lista de denegados.
- Los secretos (claves, contraseñas, cadenas de conexión) se enmascaran antes de salir de la máquina.
- Si el enmascarado falla, no se envía nada: el guard falla cerrado.
- Cada archivo enviado a un proveedor queda en el registro de egreso.
- Acceso con cuentas creadas por el administrador; claves de usuario cifradas; accesos de administrador auditados.

_Fuente: [process-flows.md, secciones 5 y 6](../../process-flows.md) y [RFC-001, sección 4.6](../../rfc/RFC-001-rosetta.md)_

---

# Método de construcción

- **Especificación primero y pruebas primero** (ADR-010): cada comportamiento de la especificación tiene su prueba antes que el código; las tarjetas de código siguen ese protocolo.
- Tarjetas de tarea: 63 haiku, 97 sonnet y 22 opus entre las 182 del total; el hito 1 tiene 152 tarjetas: 58 haiku, 79 sonnet y 15 opus entre las 152 del hito 1.
- Agentes de Claude escriben cada tarjeta en su propia rama y solicitud de cambios.
- El agente verificador, independiente del que escribió la tarjeta, repite las comprobaciones y publica su veredicto.
- El orquestador fusiona cada tarjeta cuando la CI está en verde y el verificador da PASS. La persona dueña del proyecto decide la especificación, las ADR, el RFC, el registro de decisiones y CLAUDE.md.

_Fuente: [docs/orchestration/tasks.md, Totales](../../orchestration/tasks.md), [DEC-96 en el registro de decisiones](../../decision-log.md) y [ADR-010](../../adr/ADR-010-spec-driven-and-test-driven-development.md)_

---

# Resultados: estado del proyecto

- Fecha de referencia: 2026-10-13 (noche), según [handoff.md](../../../handoff.md): **123 de 182 tarjetas hechas**.
- Verificación en CI de la cabeza actual de la rama (`1d7d8a4`), **a fecha 2026-10-13 (UTC), run 38480431418**, trabajo `verify (ubuntu-latest)`:
  - Pirámide de pruebas por nivel: unitarias 4590 (64 %), integración 2362 (33 %), E2E 166 (2 %); objetivo 60 / 30 / 10 con 10 puntos de tolerancia.
  - Pruebas de Vitest: 6953 pasadas y 6 omitidas, en 545 archivos pasados y 1 omitido (546 en total).
  - Las 6 pruebas omitidas son de `tests/integration/image` (imagen de contenedor). Las pruebas E2E, en tres fragmentos de CI, pasaron en la misma ejecución.
  - Cobertura de sentencias: 96,2 %.
- Fuente: el registro del trabajo `verify (ubuntu-latest)` de esa ejecución y el informe de `scripts/test-levels.mjs`. Las cifras cambian con las fusiones posteriores; la ejecución y la fecha son las de referencia.
- Lo que aún no está medido: la precisión y la cobertura del conjunto de referencia (ver la siguiente diapositiva).

---

# Resultados: objetivos frente a medidas

Objetivos de la release 1 ([RFC-001, sección 7](../../rfc/RFC-001-rosetta.md)). **Son objetivos, no resultados**:

| Métrica                                         | Objetivo                                                             | Medida      |
| ----------------------------------------------- | -------------------------------------------------------------------- | ----------- |
| Precisión de las afirmaciones respaldadas       | al menos 90 % correctas                                              | [PENDIENTE] |
| Recuperación de reglas conocidas                | al menos 70 % encontradas                                            | [PENDIENTE] |
| Citas válidas en afirmaciones respaldadas       | 100 %                                                                | [PENDIENTE] |
| Coste de una ejecución completa de demostración | menos de 1 USD con el modelo en la nube más barato; 0 USD con Ollama | [PENDIENTE] |

---

# Demostración

- Captura de una ejecución real de `understand` en la página web: [PENDIENTE: captura del propietario].
- Aplicación de demostración: Microsoft eShopLegacyWebForms (MIT), en modo solo lectura.

---

# Enlaces

- Repositorio: https://github.com/blacklight0101/Rosetta
- Informe de ejemplo (GitHub Pages): [PENDIENTE: URL]
- Aplicación alojada: [PENDIENTE: URL]
- Cuenta de evaluación: [PENDIENTE: la crea el administrador; no se publica en las diapositivas]
- Vídeo: [PENDIENTE: URL]
