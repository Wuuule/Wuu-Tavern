# Wuu-Tavern

OpenTavern overlay: hide status tags, Status Center on the character card.
Sends do not attach table bodies. The model looks up tables with `status_list` / `status_get`.

## Pages source (required)

The clickable site is the **GitHub Actions** build (official HTML baked in, same origin).
If source is "Deploy from a branch", Safari gets a wrapper page and taps often do nothing.

1. https://github.com/Wuuule/Wuu-Tavern/settings/pages
2. Build and deployment → Source → **GitHub Actions**
3. Wait for the latest Actions run to be green
4. Hard-refresh https://wuuule.github.io/Wuu-Tavern/

You should see official OpenTavern with no extra wrapper. Empty "My cards" is expected on a new origin; use the menu to import.
