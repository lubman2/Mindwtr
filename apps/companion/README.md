# mindwtr-companion

Osobní background daemon nad lokální Mindwtr DB (větev `lubman`, není určeno pro upstream).

Konektory importují položky z externích zdrojů jako tasky do Mindwtr inboxu.
Stav (dedup, kurzory) drží vlastní SQLite v `~/.config/mindwtr-companion/state.sqlite`.

## Setup

1. `cp config.example.toml ~/.config/mindwtr-companion/config.toml` a vyplnit.
2. Gmail: na účtu zapnout 2FA a vytvořit App Password (https://myaccount.google.com/apppasswords).
3. Jednorázový běh: `bun run once` (první běh jen nastaví kurzor, nic neimportuje).
4. Trvalý běh: launchd agent — viz `launchd/`.

## Příkazy

- `bun run once` — jeden sync cyklus a konec
- `bun run start` — daemon (poll po `pollSeconds`)
- `bun test`, `bun run typecheck`, `bun run lint`
