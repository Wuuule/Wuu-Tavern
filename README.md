# Wuu-Tavern

Single-page character chat. Source lives in this repository and is deployed from these files.

Based on [OpenTavern](https://github.com/PawNzZi/opentavern) ([opentavern.pages.dev](https://opentavern.pages.dev)). Upstream is a single-file app; this repo keeps that snapshot plus local hooks.

Status Center design (what it is for, how tables are read/hidden, acceptance): see [STATUS_CENTER.md](./STATUS_CENTER.md).

## This repo adds

- Hide ledger tags in the chat bubble
- Status Center UI (up to 50 tables per conversation)
- Inject tables for the model to read before generate; do not print tables in the visible reply

## Files

- `index.html` — app
- `worker.js` — optional TTS worker sample
- `icon.png`
- `ot-boot.js` — storage banner / persist request
- `ot-status.js` — status center implementation (follow STATUS_CENTER.md)
- `STATUS_CENTER.md` — design requirements

## Pages

https://wuuule.github.io/Wuu-Tavern/
