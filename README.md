# Wuu-Tavern

OpenTavern overlay. Adds two platform features:

- Hide tagged blocks in the chat bubble
- Status Center: up to 50 named tables per character card

No scenario content ships in this repo.

## Status tags

```text
<StatusTable name="table-name">
text
</StatusTable>
```

Also accepted: `<OTTable name="...">` and `<Ledger>`.

On send, only tables that match the current messages are injected. Other tables are listed by name only.

## Pages

1. https://github.com/Wuuule/Wuu-Tavern/settings/pages
2. Source: GitHub Actions, or branch `main` / root
3. https://wuuule.github.io/Wuu-Tavern/
