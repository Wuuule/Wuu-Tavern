# Wuu-Tavern

Single-page character chat. Source lives in this repository and is deployed from these files.

Based on [OpenTavern](https://github.com/PawNzZi/opentavern) ([opentavern.pages.dev](https://opentavern.pages.dev)). Upstream is a single-file app; this repo keeps that snapshot plus local hooks.

## This repo adds

- Hide `<StatusTable>` / `<OTTable>` / `<Ledger>` in the chat bubble
- Status Center on the character card (up to 50 tables)
- Model looks up tables with `status_list` / `status_get` (request body does not dump tables)

## Files

- `index.html` — app
- `worker.js` — optional TTS worker sample
- `icon.png`
- `ot-boot.js` — storage banner / persist request
- `ot-status.js` — status center

## Pages

https://wuuule.github.io/Wuu-Tavern/
