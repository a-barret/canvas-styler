# Canvas Styler — Project Spec

**Status:** First draft
**Name:** "Canvas Styler" is a working title. The final name has not been decided.
**Form:** Chrome extension (Manifest V3)
**Target distribution:** Chrome Web Store

---

## 1. Purpose

Canvas LMS makes the jobs of educators and institutions easier. **Canvas Styler makes the jobs of students easier and better.**

Canvas Styler lets students whose schools use Canvas make their schoolwork hub their own, in the simplest way possible.

### The problem

- Default Canvas styling is dull and unappealing.
- The default interface is confusing. For example, finding the next due assignment for a course takes several clicks through menus, and it is not the first thing a student sees.

### The desired outcome

- A student feels satisfied with the styling they chose for themselves, which makes starting schoolwork feel less overwhelming.
- A student can see what to do next as soon as they land on Canvas.

### Why this exists

Canvas Styler is inspired by people who were no longer satisfied with BetterCanvas (now BetterCampus). The belief is that BetterCanvas originally existed to remove friction from default Canvas, did so in the simplest way possible, and gave users freedom. BetterCampus is seen as having strayed from that by:

- requiring account creation for full functionality, and
- adding features that overwhelm someone who just wants their dashboard to look nice.

Canvas Styler aims to return to that original purpose.

---

## 2. Principles

1. **Simple.** Fewest steps possible between installing and having a Canvas that feels like yours.
2. **Styling comes first.** Personalization of the Canvas interface is the core feature. Everything else is secondary.
3. **No accounts.** There are no user accounts, and none are planned. Accounts add friction and push users away.
4. **Local-first and private.** The extension mostly does things local to the user. Maximum privacy and local compute. Nothing is sent anywhere.
5. **No feature overload.** Features must not overwhelm a user who only wants to make Canvas look nice.
6. **Do not strand existing users.** New features are welcome, but never at the expense of loyal users feeling lost because an interface changed and they can no longer find the features they use the extension for.
7. **Student freedom.** The user is in control of how their Canvas looks, including an escape hatch (custom CSS) for anything the controls do not cover.

---

## 3. Core Capabilities

### 3.1 Interface styling (primary)

Styling should apply to the whole Canvas interface, **not just the dashboard**: dashboard, course pages, assignment pages, and other pages.

Currently implemented:

- **Site-wide colors:** page background, nav bar, nav bar icons, accent/link color, active nav item highlight box, active nav item icon.
- **Branding:** replace the school logo in the nav bar (image URL or uploaded file).
- **Site-wide font:** family, color, bold, italic, underline.
- **Dashboard course cards:** background, opacity, size, border (width, style, color), corner radius, drop shadow. Scoped so they only affect course card elements.
- **Custom course card images:** per-course image by URL or upload.
- **Custom CSS:** raw CSS box for anything the controls do not cover.
- **Master toggle:** turns all styling off without losing settings. Reset restores Canvas's original look.

Gap to close: current controls are strongest on the dashboard and the global nav. Extending first-class styling to course pages and assignment pages is a core goal.

### 3.2 "What's next" visibility (secondary)

A student should see what to do next as soon as they open Canvas.

Currently implemented as an optional **Task List** (modes: Off, Canvas Default, Styled):

- Replaces Canvas's built-in to-do list on the dashboard in "Styled" mode.
- Shows upcoming items with due date, points, course, and type, color-coded by course.
- Mark items complete or incomplete.
- Optional per-course progress rings.
- Configurable number of cards shown initially.
- Configurable time period: all, today, week (rolling or calendar), month (rolling or calendar), or custom range, with previous/next navigation.

### 3.3 Backup

- Export and import all settings as a `.json` file, including styles, custom CSS, logo, and course images.

---

## 4. Non-Goals and Hard Constraints

- **No user accounts**, now or planned.
- **No data leaves the device.** No servers required for the extension to function.
- **No overwhelming feature creep.** New features must not compete with styling or clutter the interface.
- **No disruptive UI changes** that make existing users unable to find the features they rely on.

---

## 5. Compatibility Goals

- **Goal:** work with as many Canvas versions and setups as possible, not just one school.
- **Current state:** the user enters their own Canvas site address once, and the extension requests access to that one site only. It is not hardcoded to any school.
- **Known limitation:** development so far has been against a single institution's Canvas. Behavior on other schools' themes, markup, and Canvas versions is unverified.
- **Fallback:** Custom CSS remains the escape hatch if Canvas markup changes or differs.

---

## 6. Architecture (current)

| Component | Role |
|---|---|
| `manifest.json` | MV3 manifest. Permissions: `storage`, `scripting`. Optional host permission `https://*/*`, requested per site at runtime. |
| `background.js` | Service worker. Registers content scripts dynamically for the one host the user connects, and injects into already-open tabs. |
| `content.js` | Reads settings, generates and injects CSS, applies custom logo and per-course card images, observes dashboard changes. |
| `tasklist.js` | Styled task list on the dashboard, using Canvas's own planner API with the user's existing login. |
| `popup.html` / `popup.js` / `popup.css` | Settings UI: Style, Course Cards, Task List, and Custom CSS tabs, plus site connection and backup. |
| `tasklist-popup.js` | Task List tab logic in the popup. |

**Storage:** `chrome.storage.local` only (settings, connected host, custom CSS, logo, course images).

**Styling approach:** CSS is generated only for properties the user has changed, so disabling or resetting leaves nothing behind.

---

## 7. Distribution: Chrome Web Store

Goal: publish on the Chrome Web Store.

Requirements to carry into the plan:

- Request the minimum permissions necessary. Currently, access only to the single site the user connects.
- Provide a clear privacy disclosure: everything is stored locally and nothing is transmitted.
- Review current Chrome Web Store policies before submission. This has not been done yet.

---

## 8. Open Items

- Decide the final project name. "Canvas Styler" is a working title only.
- Research and test other Canvas versions, themes, and school configurations. This requires access to other setups.
- Define how styling extends to course pages and assignment pages, including which elements are customizable.
- Review Chrome Web Store policies, listing requirements, and privacy disclosure.
- Confirm how new features will be added without disrupting existing users' layout and muscle memory.
