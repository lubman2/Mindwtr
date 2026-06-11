# mindwtr-companion

Osobní background daemon nad lokální Mindwtr DB (větev `lubman`, není určeno pro upstream).

Konektory importují položky z externích zdrojů jako tasky do Mindwtr inboxu.
Stav (dedup, kurzory) drží vlastní SQLite v `~/.config/mindwtr-companion/state.sqlite`.

## Setup

1. `cp config.example.toml ~/.config/mindwtr-companion/config.toml` a vyplnit; doporučeno `chmod 600` (obsahuje app password).
2. Gmail: na účtu zapnout 2FA a vytvořit App Password (https://myaccount.google.com/apppasswords).
3. Jednorázový běh: `bun run once` (první běh jen nastaví kurzor, nic neimportuje).
4. Trvalý běh: launchd agent — viz `launchd/`.

## Příkazy

- `bun run once` — jeden sync cyklus a konec
- `bun run start` — daemon (poll po `pollSeconds`)
- `bun test`, `bun run typecheck`, `bun run lint`

## Launchd (trvalý běh na macOS)

    mkdir -p ~/Library/Logs/mindwtr-companion
    cp launchd/tech.lubman.mindwtr-companion.plist ~/Library/LaunchAgents/
    launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/tech.lubman.mindwtr-companion.plist

Zastavení: `launchctl bootout gui/$(id -u)/tech.lubman.mindwtr-companion`

Logy: `~/Library/Logs/mindwtr-companion/companion.log` (JSONL)

Poznámky k provozu:

- Logger zrcadlí všechny záznamy (info i error) na stderr, takže
  `launchd.err.log` obsahuje i běžný provozní výstup — autoritativní
  záznam s úrovněmi je `companion.log`.
- Rotace logů není řešená; `companion.log` roste neomezeně. Při potřebě
  rotovat ručně (`mv` + restart agenta) nebo přidat vlastní rotaci.
- Plist předpokládá bun v `~/.bun/bin/bun` a repo v `~/Sites/Mindwtr` —
  při jiném umístění uprav cesty v plistu.
