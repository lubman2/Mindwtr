# Mindwtr — vlastní fork a companion integrace (design)

Datum: 2026-06-10
Stav: schváleno uživatelem (Luboš), čeká na review zapsaného specu

## Cíl

Dlouhodobě udržovatelný prostor pro vlastní fíčury nad Mindwtr, aniž by se ztratila
schopnost přijímat upstream opravy a posílat upstreamu PR. Vlastní fíčury jsou
především integrace (Gmail, eWay-CRM, Notion) a automatické rutiny na pozadí.

## Rozhodnutí

### 1. Větev `lubman` na forku

- Fork: `lubman2/Mindwtr` (remote `fork`), upstream: `dongdongbh/Mindwtr` (remote `origin`).
- Trvalá osobní větev `lubman`, založená z `origin/main`. Všechny vlastní fíčury
  žijí tady (přímo, nebo přes krátkodobé feature větve mergované do `lubman`).
- Upstream sync: `git fetch origin && git merge origin/main` do `lubman`,
  pravidelně (ideálně po každém upstream release).
- Opravy určené upstreamu vznikají dál na samostatných větvích z `origin/main`
  a jdou jako PR. Pokud je oprava potřeba hned, cherry-pick do `lubman`.
- Větev `lubman` musí vždy projít existující CI sadou projektu (testy, lint,
  typecheck) — to je pojistka, že merge upstreamu nic nerozbil.

### 2. Nová app `apps/companion`

Bun daemon v monorepu. Přistupuje k lokální SQLite DB
(`~/Library/Application Support/mindwtr/mindwtr.db`) přes `@mindwtr/core` +
`better-sqlite3` — stejný vzor jako `apps/mcp-server`. Veškerý integrační kód
žije v nových adresářích, takže upstream merge zůstávají téměř bezkonfliktní.

```
apps/companion/
├── src/
│   ├── index.ts          # daemon: scheduler + CLI vstup
│   ├── db.ts             # přístup k DB přes @mindwtr/core
│   ├── connectors/
│   │   ├── gmail.ts      # vybraný mailbox → tasky do inboxu
│   │   ├── eway.ts       # eWay-CRM API → tasky
│   │   └── notion.ts     # inbox, reporty, resource base
│   ├── routines/         # background rutiny (KB, automatizace flow, review)
│   └── config.ts         # čtení configu + secrets
└── package.json
```

- Běh: launchd agent na macOS (start po přihlášení), nebo ručně `bun run companion`.
- Konfigurace: `~/.config/mindwtr-companion/config.toml`. Secrets (Gmail OAuth
  token, eWay credentials, Notion token) výhradně mimo repo; v gitu jen
  `config.example.toml`.
- Desktop app (`apps/desktop`) se upravuje jen tam, kde je nutné UI — primárně
  pro customizované review postupy (podprojekt D).

### 3. Podprojekty a pořadí

Každý podprojekt dostane vlastní brainstorm → spec → implementační plán.

| # | Podprojekt | Obsah | Stav |
|---|-----------|-------|------|
| 0 | Setup | větev `lubman`, kostra `apps/companion`, config, launchd | tento spec |
| A | Gmail import | konkrétní mailbox → tasky do Mindwtr inboxu | další |
| B | eWay-CRM import | načítání tasků přes eWay API | čeká |
| C | Notion integrace | inbox, reporty, resource base; rozpadne se na menší celky | čeká |
| D | Rutiny + custom review | tvorba KB, automatizace vybraných flow, review postupy; pravděpodobně sáhne i do desktopu | čeká |

Pořadí A → B → C → D: Gmail je nejmenší a ověří celý connector pattern
(externí zdroj → dedup → zápis do DB); eWay jede po stejném vzoru; Notion je
největší a rutiny nakonec staví na hotových integracích.

## Error handling

- Logy: `~/Library/Logs/mindwtr-companion/`.
- Konektory selhávají izolovaně — pád jednoho (např. Gmail) nesmí zastavit
  ostatní ani scheduler.
- Importy jsou idempotentní: každý importovaný task nese externí ID
  (message-id, eWay GUID, Notion page ID) v metadatech a opakovaný běh
  nevytváří duplicity.

## Testování

- `apps/companion` má vlastní `bun test` (vzor `apps/mcp-server`).
- Konektory se testují proti fixture odpovědím API, nikdy proti živým službám.
- Před každým merge upstreamu i po něm musí projít celá existující testovací
  sada repa.

## Mimo rozsah

- Rozšiřování stávajícího MCP serveru / agent skillu (uživatel ho chce držet
  minimální — jen základní adhoc operace z chatu).
- Sync na jiná zařízení a apps/cloud — companion pracuje jen s lokální DB;
  propagaci změn řeší existující sync mechanismus Mindwtr.
- Publikace companion kódu upstreamu.
