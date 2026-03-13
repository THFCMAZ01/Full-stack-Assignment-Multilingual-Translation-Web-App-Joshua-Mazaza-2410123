LinguaSwift-Multilingual Translator

BSE 3350 Full-Stack Web Development
Zambia University of Technology · Year 3, Semester 1

Overview

LinguaSwift is a client-side multilingual translation web application that uses the [MyMemory Translation API](https://mymemory.translated.net/) to translate text between 13 languages in real time. The app requires no build step, no framework and no backend open `index.html` in any modern browser and it works.


Features

| Feature | Detail |
|---|---|
| Real-time translation | Translates as you type with a 600 ms debounce to avoid excessive API calls |
| Auto-detect | MyMemory detects the source language automatically when selected |
| 13 languages | English, French, Spanish, German, Portuguese, Italian, Chinese, Japanese, Arabic, Russian, Korean, Hindi, Swahili |
| Swap languages | Exchanges source ↔ target and pre-fills the input with the previous translation |
| Text-to-Speech | Speaks input and output using the Web Speech API |
| Copy to clipboard | Copies input or output with animated visual feedback |
| Loading indicator | Spinner replaces the button label while a request is in flight |
| Error handling | Shows clear messages for network failures, empty results, and quota limits |
| Dark mode | Persisted to `localStorage`, restored before first paint (no flash) |
| Responsive | Adapts to mobile screens — panels stack vertically below 640 px |
| Accessible | ARIA labels, live regions, `role="alert"`, `:focus-visible` rings on all interactive elements |



 Project Structure

```
linguaswift/
├── index.html   — Markup, FOUC-prevention script, font imports
├── style.css    — Design tokens, layout, dark theme, animations
├── app.js       — All interactive behaviour (ES6, strict mode)
└── README.md    — This file
```



 Getting Started

No installation required.

1. Download or clone all four files into the same folder.
2. Open `index.html` in any modern browser (Chrome, Firefox, Edge, Safari).
3. The app auto-translates the default text ("Hello, how are you" → French) on load.

> Internet connection required.** The app calls the MyMemory API on every translation. Translations will not work offline.



 How It Works

 Translation API

Translations are fetched from the [MyMemory free API](https://mymemory.translated.net/doc/spec.php) using a plain `GET` request:

```
GET https://api.mymemory.translated.net/get?q=Hello&langpair=en|fr
```

No API key is required for the free tier. The free tier allows approximately 5,000 words per day per IP address. If the quota is exceeded, the app shows a warning message.

Dark Mode Architecture

Dark mode is handled in two layers:

1. FOUC prevention- A tiny synchronous `<script>` in `<head>` reads `localStorage` and sets `data-theme` on `<html>` *before the browser renders a single pixel*, so the correct theme is applied on the very first paint with no white flash.
2. JS toggle- `app.js` handles user-initiated toggles and persists the preference to `localStorage`.

 Race Condition Prevention

Every call to `translate()` creates a new `AbortController` and cancels the previous one. This ensures that if the user types quickly and multiple requests are in flight, only the response to the *most recent* request updates the output panel.

No innerHTML

The application never uses `innerHTML` to write user-controlled content. All dynamic text is written via `textContent`, and icon state changes are handled with `classList`, eliminating any XSS risk.



 File Details

`index.html`

- Standard HTML5 boilerplate with `lang`, `charset`, `viewport`, and SEO meta tags.
- Inline FOUC-prevention script (see above).
- Google Fonts preconnect links for sub-resource performance.
- All `<button>` elements carry `type="button"` to prevent accidental form submission.
- Accessible: `<label for>` on every `<select>`, `aria-label` on interactive elements, `aria-live` on dynamic regions, `aria-hidden` on all decorative SVGs.
- `<script src="app.js" defer>` — `defer` guarantees the DOM is fully parsed before JS runs.

`style.css`

- All colours defined as CSS custom properties in `:root` and overridden in `[data-theme="dark"]`.
- No `transition: all` anywhere — transitions target specific properties only to avoid conflicts with `@keyframes` animations.
- `:focus-visible` rings on every interactive element — keyboard users always have a visible focus indicator.
- `body::before` — a subtle radial-gradient ambient texture applied as a fixed pseudo-element layer.
- `@media (max-width: 640px)` — mobile layout: panels stack vertically, divider becomes horizontal, language bar wraps.

`app.js`

- `'use strict'` at module level.
- All DOM-dependent code inside `DOMContentLoaded` — combined with `defer`, this double-guards against any `getElementById` returning `null`.
- Named constants for all magic numbers (`MAX_CHARS`, `WARN_THRESHOLD`, `DEBOUNCE_DELAY`, `COPY_RESET_MS`, `API_BASE`).
- `state` object tracks `outputText` and `isLoading` — the latter is read as a re-entrancy guard in `translate()`.
- `copyToClipboard` sets `btn.dataset.copying = 'true'` *before* the async clipboard write — prevents a second click from racing through the guard.



 Browser Support

| Feature | Requirement |
|---|---|
| `fetch` + `async/await` | Chrome 66+, Firefox 57+, Safari 12+ |
| `AbortController` | Chrome 66+, Firefox 57+, Safari 12.1+ |
| `navigator.clipboard` | Chrome 66+, Firefox 63+, Safari 13.1+ (requires HTTPS or localhost) |
| `SpeechSynthesisUtterance` | Chrome, Edge, Safari (partial Firefox support) |
| CSS Custom Properties | All modern browsers |

> The app gracefully falls back when TTS or clipboard APIs are unavailable  the user sees an appropriate status message rather than a silent error.



 Known Limitations

- MyMemory free quota — 5,000 words/day per IP. Exceeding the quota returns a warning embedded in the translated text, which the app detects and surfaces to the user.
- `navigator.clipboard`— Requires a secure context (HTTPS or `localhost`). The copy button shows a fallback message when the API is unavailable (e.g., opened as a plain `file://` URL on some browsers).
- Language detection — When "Detect Language" is selected, the swap button is disabled (source language must be known to swap).
- No offline mode — All translation data comes from the MyMemory API.



Author

Name: Joshua Mazaza

Programme: BSE Year 3

ID: 2410123

Course: BSE 3350 Full-Stack Web Development
