# Chile Abierto

Cómo gasta Chile su presupuesto, cómo votan sus parlamentarios frente a lo que prometieron, y qué conexiones hay entre ambos. Next.js 16 (App Router) + TypeScript.

**Regla central: ninguna cifra se publica sin fuente y sin pasar sus comprobaciones.** Si una falla, `npm run build` falla.

## Empezar

```bash
npm install
cp .env.example .env.local   # opcional: ANTHROPIC_API_KEY para el asistente
npm run dev                  # http://localhost:3000
npm test                     # 23 pruebas de las reglas de verificación
npm run build                # verifica los datos y luego construye
```

## Páginas

| Ruta | Qué muestra | Datos |
| --- | --- | --- |
| `/` | Boleta diaria por persona, tramitación del Presupuesto 2027 | Reales y verificados |
| `/presupuesto` | Treemap de las 32 partidas del Proyecto 2027, alzas y bajas, calculadora de impuestos | Reales (corroborados, con controles contra DIPRES) |
| `/promesas` | Promesas vs votos por parlamentario | Ejemplo, hasta correr los conectores de Cámara y promesas |
| `/hallazgos` | Hallazgos calculados con reglas reproducibles + asistente con IA | Reales; los cruces de lobby y aportes son de ejemplo |
| `/fuentes` | Registro público de cada dato, sus fuentes y comprobaciones | — |
| `/api/facts` | Todos los datos publicados en JSON, con procedencia | — |

## Modelo de verificación

Cada número es un **Fact** (`lib/provenance/types.ts`) con definición, unidad, fecha, fuentes y comprobaciones. `lib/provenance/verify.ts` le asigna un nivel:

| Nivel | Significa |
| --- | --- |
| **oficial** | Leído en el documento o servicio del organismo público (con página/tabla) y todas las comprobaciones pasan |
| **corroborado** | ≥2 publicadores independientes (de distinto dueño) coinciden; falta leerlo del documento oficial |
| **secundario** | Una sola fuente no oficial; se muestra marcado |
| **pendiente** | Sin fuente o con una comprobación fallida; **no se muestra** |
| **ejemplo** | Ficticio, siempre rotulado; nunca se mezcla con datos reales |

Comprobaciones automáticas:

1. **Dominio**: cada fuente viene del dominio registrado de su publicador (`lib/provenance/sources.ts`).
2. **Coincidencia**: el valor se lee de cómo lo imprimió cada fuente (`"$91.175.816 millones"`, `"US$25 mil millones"`) y debe ser igual al publicado. No compara monedas distintas.
3. **Cuadraturas por dataset**: en las partidas, Emol (pesos) y CNN Chile (dólares) deben implicar el mismo tipo de cambio; Congreso y Presidencia se contrastan con los documentos oficiales de DIPRES de cada partida (Congreso cuadra al peso).
4. **Recalculo**: los datos derivados (por persona, sumas, % de deuda) se recalculan en cada build.
5. **Herencia**: un dato calculado nunca es más fuerte que su insumo más débil.
6. **Requeridos**: si un dato que usa la interfaz queda pendiente, el build falla (`lib/required.ts`).

### Estado de los datos semilla (17 oct 2026)

- 7 oficiales (DIPRES IFP 3T 2026, INE, Cámara), 66 corroborados (32 partidas + 32 variaciones, Emol + CNN Chile citando el IFP, con dos controles exactos contra DIPRES), 9 de una fuente (montos de deuda 2026, fechas de prensa).
- Ojo: el gasto total del **Gobierno Central** 2027 es **$91.175.816 millones** (IFP, oficial). La cifra de "$105,8 billones" que circuló en prensa mide otra cosa (gasto total neto de la ley); no se usa hasta leer su definición oficial.

## Ingesta desde fuentes oficiales

```bash
npm run ingest                       # todos los conectores con credenciales disponibles
npm run ingest -- camara --year 2026 # uno en particular
```

Cada conector (`lib/connectors/`) descarga **solo** de dominios oficiales, guarda una copia inmutable con su sha256 en `data/raw/` (y `manifest.jsonl`), parsea, reconcilia y escribe `data/store/<id>.facts.json`. Si encuentra problemas no publica nada y deja `data/store/<id>.issues.json` para revisión. Al final se re-verifica todo y, si algo falla, se revierte.

| Conector | Fuente | Qué hace |
| --- | --- | --- |
| `dipres-ifp` | DIPRES, Informe de Finanzas Públicas (PDF) | Re-lee las 32 partidas y el total del Gobierno Central del PDF oficial. Si coinciden con lo corroborado, los sube a **oficial** con página y hash |
| `camara` | opendata.camara.cl (XML) | Diputados en ejercicio (debe dar 155), votaciones del año y votos individuales; cada votación debe cuadrar con sus totales oficiales |
| `bcch` | Banco Central, API BDE | IPC mensual para pesos reales. Requiere `BCCH_USER`/`BCCH_PASS` |
| `mercadopublico` | ChileCompra API | Órdenes de compra diarias. Requiere `MERCADOPUBLICO_TICKET` |

Las credenciales nunca quedan en snapshots ni fuentes (`redactUrl`).

**Primera ingesta de la Cámara:** los nombres de parámetros (`prmAnno`, `prmVotacionId`) siguen la documentación publicada; confírmalos en la primera corrida. Si cambian, se ajustan en `CAMARA_ENDPOINTS` o con `CAMARA_WS_BASE`.

## Promesas de campaña

```bash
npm run extract-promises -- --url <pdf del programa> --publisher servel --author "Nombre" --slug nombre
```

Claude propone promesas con cita y página; **solo se aceptan si la cita aparece textual en el PDF** (`lib/promises/validate.ts`). Las demás van a una cola de revisión. La relación promesa–voto la confirma un editor.

## Asistente (`/api/ask`)

Usa Claude con dos herramientas (buscar datos verificados, listar hallazgos). Después de responder, `lib/agents/grounding.ts` comprueba que **cada número de la respuesta coincida con un dato consultado**; si no, pide corregir una vez y, si persiste, la respuesta se marca con advertencia. Para usar Bedrock en lugar de la API de Anthropic, cambia el cliente en `lib/agents/ask.ts` por `@anthropic-ai/bedrock-sdk`.

## Próximos pasos

- Correr `dipres-ifp` para subir las 32 partidas a oficial; agregar partida Tesoro Público y años 2016–2026 (datos abiertos DIPRES).
- Conectores Senado, BCN (leyes), Servel (aportes), InfoLobby e InfoProbidad.
- Grafo Neo4j para los cruces (aportes ↔ compras, lobby ↔ votos) y cola editorial.
- Programas por partida (documentos por partida de DIPRES) y gasto regional (Presupuesto Abierto).
