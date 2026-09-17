# Canvas Styler

A lightweight, no-bloat Chrome extension for restyling any Instructure
Canvas site — in the spirit of the old (pre-bloat) BetterCanvas. Everything
runs locally; nothing is sent anywhere. It works on whatever Canvas
instance you point it at (`yourschool.instructure.com`), not just one
school.

## Install (unpacked / developer mode)

1. Unzip this folder somewhere permanent (don't delete it after installing —
   Chrome loads the extension directly from these files).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder (`canvas-styler`).
5. Pin the extension: click the puzzle-piece icon in the toolbar, then click
   the pin next to "Canvas Styler" so it stays visible next to the address bar.

## First-time setup: connect your Canvas site

The first time you open the popup, it asks for your Canvas site's address —
e.g. `byui.instructure.com`, `canvas.yourschool.edu`, etc. Enter it and
click **Connect**. Chrome will show a one-time permission prompt asking you
to approve access to that specific site; approve it and you're set.

- You only have to do this once — the address is saved, and styling starts
  working automatically on that site from then on (including in new tabs
  and after restarting Chrome).
- You can change the connected site later via the **Change** link next to
  "Site:" at the top of the popup.
- The extension only ever asks for access to the one site you type in —
  never to every website you visit.

## Using it

Click the extension's icon to open the popup. It has three tabs:

- **Style** — split into clearly-scoped sections:
  - *Site-wide colors*: page background, nav bar color, **nav bar icon
    color**, and accent/link color. These apply on every page of your
    connected Canvas site.
  - *Branding*: replace the school logo in the top-left corner of the nav bar
    with your own image (paste a URL or upload a file).
  - *Site-wide font*: font family/color/bold/italic/underline.
  - *Dashboard course cards*: card background, opacity, size (resize the
    cards), border width/style/color/radius, and drop shadow size/strength.
    These only ever touch the course card elements — never the "Dashboard"
    header bar, sidebar, or anything else on the page — and border/radius/
    shadow are applied only to the single outer card box, never to the
    header or action-container elements nested inside it.

  Changes apply instantly on any open Canvas tab. The toggle switch in the
  header turns all styling off without losing your settings — and because
  the extension only ever writes CSS for properties you've actually
  touched, turning it off (or hitting Reset) fully restores Canvas's
  original look with nothing left over.
- **Course Cards** — open your Canvas dashboard, come back to the popup, and
  click "Refresh course list" to pull in your current courses. Each course
  gets a thumbnail you can replace either by pasting an image URL or
  uploading a file from your computer (stored locally as a data URL).
- **Custom CSS** — a raw CSS box for anything the controls don't cover. It's
  injected straight into the page, so any valid CSS works, e.g.:
  ```css
  .ic-DashboardCard__header-title { text-transform: uppercase; }
  ```

## Backup: save/load settings as a file

At the bottom of the **Style** tab:

- **Export settings…** — downloads everything (colors, fonts, card styles,
  custom CSS, custom logo, and per-course card images) as a single `.json`
  file to your computer's normal downloads location (works the same on
  Windows and Mac).
- **Import settings…** — pick a previously exported `.json` file to restore
  it. This replaces your current settings after a confirmation prompt.

This is handy for backing things up before experimenting, or copying your
setup to another computer/profile. Note this backup does not include which
Canvas site you're connected to — that's tied to Chrome's own permission
grant, not the settings file, so it's a one-time setup step per browser
profile.

## What's new in this version

- **Works with any Canvas site**, not just one school — you type your
  school's address in during setup instead of it being hardcoded.
- **Export/import settings** as a `.json` file.
- **Nav bar icon color** — recolor the sidebar icons independently of the
  nav bar background color.
- **Custom logo** — replace the top-left school logo with your own image.
- **Fixed a JS syntax error** in `popup.js` (an incorrectly escaped
  apostrophe inside a string) that was throwing `Uncaught SyntaxError:
  Unexpected identifier 't'` and silently breaking every control in the
  popup, since the whole script failed to load.

## Bug fixes

- **Font color no longer overrides the accent/links color.**
- **Dashboard header background now fully matches the page background.**
- **Drop shadow and border width no longer bleed onto elements inside the
  card** — they're applied only to the single outer `.ic-DashboardCard`
  element.

## Notes

- Only runs on the one Canvas site you connect during setup.
- Settings (styles, custom CSS, logo, course images) are stored with
  `chrome.storage.local`, so they stay on this device/browser profile only.
- The connected site address is also stored locally and is what tells the
  extension which site to request permission for and inject into.
- If Canvas updates its markup and something stops matching, the Custom CSS
  tab is the escape hatch — inspect the element and add a rule targeting the
  new class name.
- Font-family/color overrides skip elements whose class name contains
  `icon-` so Canvas's icon-font glyphs don't get swapped out for tofu boxes.
