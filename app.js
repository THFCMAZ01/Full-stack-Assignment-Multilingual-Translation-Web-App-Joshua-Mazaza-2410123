/**
 * app.js — LinguaSwift Multilingual Translator
 * BSE 3350 Full-Stack Web Development
 *
 * Architecture:
 *   - 'use strict' at module level
 *   - All DOM-dependent code inside DOMContentLoaded
 *   - Constants replace every magic number
 *   - AbortController prevents fetch race conditions
 *   - No innerHTML mutation — only textContent and classList
 *   - Dark-mode FOUC prevented by inline <script> in index.html <head>
 *     (not by JS here — JS only handles toggle + localStorage persistence)
 */

'use strict';

/* ── Constants ───────────────────────────────────────────────── */
const MAX_CHARS      = 500;
const WARN_THRESHOLD = 450;
const DEBOUNCE_DELAY = 600;
const API_BASE       = 'https://api.mymemory.translated.net/get';
const COPY_RESET_MS  = 1800;

/* ── Utility: debounce ───────────────────────────────────────── */
/**
 * Returns a debounced version of `fn` that waits `delay` ms
 * after the last invocation before executing.
 * @param {Function} fn
 * @param {number}   delay
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timerId;
  return function debounced(...args) {
    clearTimeout(timerId);
    timerId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/* ── Entry point ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  /* ── DOM References ──────────────────────────────────────── */
  const inputEl         = document.getElementById('input-text');
  const outputEl        = document.getElementById('output-text');
  const sourceSel       = document.getElementById('source-lang');
  const targetSel       = document.getElementById('target-lang');
  const swapBtn         = document.getElementById('swap-btn');
  const translateBtn    = document.getElementById('translate-btn');
  const charCountEl     = document.getElementById('char-count');
  const statusBar       = document.getElementById('status-bar');
  const listenInputBtn  = document.getElementById('listen-input');
  const listenOutputBtn = document.getElementById('listen-output');
  const copyInputBtn    = document.getElementById('copy-input');
  const copyOutputBtn   = document.getElementById('copy-output');
  const themeToggleBtn  = document.getElementById('theme-toggle');
  const themeLabelEl    = document.getElementById('theme-label');
  const iconSunEl       = document.getElementById('icon-sun');
  const iconMoonEl      = document.getElementById('icon-moon');

  /* ── Application State ───────────────────────────────────── */
  const state = {
    outputText: '',    // Most recent successful translation
    isLoading:  false, // True while a fetch request is in flight
  };

  // Ref to the most recent AbortController. Replaced before each new
  // fetch so the previous request is cancelled — prevents race conditions
  // where a slow response could overwrite a newer result.
  let currentAbortController = null;

  /* ── UI Helpers ──────────────────────────────────────────── */

  /**
   * Toggle loading state on the translate button.
   * state.isLoading is READ in translate() as a re-entrancy guard.
   * @param {boolean} loading
   */
  function setLoading(loading) {
    state.isLoading = loading;
    translateBtn.disabled = loading;
    translateBtn.classList.toggle('loading', loading);
  }

  /**
   * Display a message in the status bar.
   * @param {string}            message
   * @param {'error'|'success'} type
   */
  function showStatus(message, type = 'error') {
    statusBar.textContent = message;
    statusBar.className = `status-bar ${type}`;
  }

  /** Clear and hide the status bar. */
  function hideStatus() {
    statusBar.textContent = '';
    statusBar.className = 'status-bar';
  }

  /**
   * Update the character counter display and warning colour.
   */
  function updateCharCount() {
    const len = inputEl.value.length;
    charCountEl.textContent = `${len}/${MAX_CHARS}`;
    charCountEl.classList.toggle('warn', len >= WARN_THRESHOLD);
  }

  /**
   * Write text into the output panel.
   * An empty string restores the placeholder state.
   * textContent is used throughout — never innerHTML — to prevent XSS.
   * @param {string} text
   */
  function setOutput(text) {
    state.outputText = text;
    if (text) {
      outputEl.textContent = text;
      outputEl.classList.remove('placeholder');
    } else {
      outputEl.textContent = 'Translation will appear here…';
      outputEl.classList.add('placeholder');
    }
  }

  /* ── API: Translation ────────────────────────────────────── */

  /**
   * Fetch a translation from the MyMemory API.
   *
   * Re-entrancy guard: state.isLoading is checked at entry so that
   * a second manual click while loading is silently ignored.
   *
   * Race condition guard: a new AbortController is created and the
   * previous one is aborted before each request, so only the most
   * recent response can update the output panel.
   */
  async function translate() {
    if (state.isLoading) return;

    const text = inputEl.value.trim();
    if (!text) {
      showStatus('Please enter some text to translate.');
      setOutput('');
      return;
    }

    const src = sourceSel.value;
    const tgt = targetSel.value;

    if (src !== 'autodetect' && src === tgt) {
      showStatus('Source and target languages must be different.');
      return;
    }

    if (currentAbortController !== null) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    const { signal } = currentAbortController;

    hideStatus();
    setLoading(true);

    const langpair = `${src}|${tgt}`;
    const url = `${API_BASE}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;

    try {
      const response = await fetch(url, { signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // MyMemory returns responseStatus as either a number or the string "200"
      if (Number(data.responseStatus) === 200) {
        const translated = data.responseData?.translatedText ?? '';

        if (!translated) {
          throw new Error('Empty translation received from API.');
        }

        setOutput(translated);

        // MyMemory embeds its quota warning as plain text in the result
        if (translated.toLowerCase().includes('mymemory warning')) {
          showStatus('Daily quota reached. Translation results may be limited.');
        }
      } else {
        throw new Error(data.responseDetails || 'Translation failed. Please try again.');
      }

    } catch (err) {
      if (err.name === 'AbortError') return; // superseded by a newer request
      showStatus(`Error: ${err.message}`);
      setOutput('');
    } finally {
      setLoading(false);
    }
  }

  /* ── Text-to-Speech ──────────────────────────────────────── */

  /**
   * Speak text using the Web Speech API with full mobile compatibility.
   *
   * Three mobile issues addressed:
   *
   * 1. CANCEL RACE (Android Chrome / iOS Safari)
   *    Calling cancel() immediately before speak() causes mobile browsers
   *    to swallow the new utterance. Fix: only cancel when something is
   *    already playing, then yield one event-loop tick before speaking.
   *
   * 2. VOICE LOADING (Android Chrome)
   *    getVoices() returns [] on first call — voices load asynchronously.
   *    If speak() fires before voices are ready, Android throws
   *    'synthesis-failed' or 'language-unavailable'. Fix: wait for
   *    the voiceschanged event if voices aren't loaded yet, with a
   *    2-second timeout fallback so the function never hangs.
   *
   * 3. LANGUAGE FALLBACK (Android Chrome)
   *    Many Android devices have limited voice packs installed. If no
   *    voice matches the target language, Android fails silently.
   *    Fix: try an exact language match first; if none found, fall back
   *    to any voice for the same language root (e.g. 'fr' matches
   *    'fr-FR'), then fall back to the device default.
   *
   * @param {string} text     — Text to speak
   * @param {string} langCode — BCP-47 tag or 'autodetect'
   */
  function speak(text, langCode) {
    if (!('speechSynthesis' in window)) {
      showStatus('Text-to-Speech is not supported in your browser.');
      return;
    }
    if (!text.trim()) {
      showStatus('Nothing to listen to.');
      return;
    }

    const synth = window.speechSynthesis;
    const lang  = langCode === 'autodetect' ? 'en' : langCode;

    /**
     * Pick the best available voice for `lang`.
     * Priority: exact match → same language root → device default (null).
     * @param {string} targetLang
     * @returns {SpeechSynthesisVoice|null}
     */
    function pickVoice(targetLang) {
      const voices = synth.getVoices();
      if (!voices.length) return null;

      // 1. Exact match e.g. 'fr' matches voice.lang 'fr'
      const exact = voices.find(v => v.lang.toLowerCase() === targetLang.toLowerCase());
      if (exact) return exact;

      // 2. Root match e.g. 'fr' matches 'fr-FR', 'fr-CA' etc.
      const root = targetLang.split('-')[0].toLowerCase();
      const partial = voices.find(v => v.lang.toLowerCase().startsWith(root + '-') ||
                                       v.lang.toLowerCase() === root);
      if (partial) return partial;

      // 3. No voice for this language — return null (browser picks default)
      return null;
    }

    /** Queue the utterance, optionally cancelling any current speech first. */
    function doSpeak() {
      const utterance  = new SpeechSynthesisUtterance(text);
      utterance.lang   = lang;
      const voice      = pickVoice(lang);
      if (voice) utterance.voice = voice;

      utterance.onerror = (e) => {
        // 'interrupted' is expected when cancel() stops a prior utterance
        if (e.error === 'interrupted') return;

        // Map error codes to user-readable messages
        const messages = {
          'language-unavailable': 'No voice installed for this language on your device. Try installing a language pack in your device settings.',
          'voice-unavailable':    'No voice available for this language on your device.',
          'synthesis-failed':     'Text-to-Speech failed. Try tapping the button again.',
          'synthesis-unavailable':'Text-to-Speech is not available on this device.',
          'not-allowed':          'Text-to-Speech was blocked. Tap the button to try again.',
          'audio-busy':           'Audio is busy. Please wait and try again.',
          'network':              'Network error during Text-to-Speech. Check your connection.',
          'canceled':             null, // silent — user or system cancelled intentionally
        };

        const msg = messages[e.error];
        if (msg !== undefined) {
          if (msg !== null) showStatus(msg);
        } else {
          showStatus('Text-to-Speech failed. Try again or check your device volume.');
        }
      };

      if (synth.speaking || synth.pending) {
        // Cancel current speech, yield one tick so mobile doesn't swallow
        // the new speak() call during the cancel teardown
        synth.cancel();
        setTimeout(() => synth.speak(utterance), 0);
      } else {
        synth.speak(utterance);
      }
    }

    // Wait for voices to be available (Android loads them asynchronously)
    const voices = synth.getVoices();
    if (voices.length > 0) {
      doSpeak();
    } else {
      // Voices not ready yet — wait for voiceschanged, 2s timeout fallback
      let fired = false;

      const onVoicesChanged = () => {
        if (fired) return;
        fired = true;
        synth.removeEventListener('voiceschanged', onVoicesChanged);
        doSpeak();
      };

      synth.addEventListener('voiceschanged', onVoicesChanged);

      // Fallback: if voiceschanged never fires, attempt anyway after 2s
      setTimeout(() => {
        if (!fired) {
          fired = true;
          synth.removeEventListener('voiceschanged', onVoicesChanged);
          doSpeak();
        }
      }, 2000);
    }
  }

  /* ── Clipboard ───────────────────────────────────────────── */

  /**
   * Copy text to clipboard with visual feedback on the button.
   *
   * Rapid-click guard: btn.dataset.copying is set to 'true' BEFORE
   * the async clipboard write begins. Any subsequent click during the
   * feedback window sees the flag and returns immediately.
   *
   * @param {string}            text — Text to copy
   * @param {HTMLButtonElement} btn  — The triggering button
   */
  async function copyToClipboard(text, btn) {
    if (!text.trim()) {
      showStatus('Nothing to copy.');
      return;
    }

    // Guard BEFORE the await — prevents re-entrancy during the async write
    if (btn.dataset.copying === 'true') return;
    btn.dataset.copying = 'true';

    try {
      await navigator.clipboard.writeText(text);

      // Swap icons and update label — no innerHTML mutation
      btn.querySelector('.icon-copy').classList.add('hidden');
      btn.querySelector('.icon-check').classList.remove('hidden');
      btn.querySelector('.btn-copy-label').textContent = 'Copied!';
      btn.classList.add('copied', 'copied-flash');

      hideStatus();

      setTimeout(() => {
        btn.querySelector('.icon-copy').classList.remove('hidden');
        btn.querySelector('.icon-check').classList.add('hidden');
        btn.querySelector('.btn-copy-label').textContent = 'Copy';
        btn.classList.remove('copied', 'copied-flash');
        delete btn.dataset.copying;
      }, COPY_RESET_MS);

    } catch (_err) {
      // Clipboard write failed (e.g. permissions denied)
      showStatus('Could not copy. Please select the text and copy manually.');
      delete btn.dataset.copying; // reset guard so user can try again
    }
  }

  /* ── Language Swap ───────────────────────────────────────── */

  /**
   * Swap source and target language selects.
   * Moves the current translated output into the input textarea
   * for convenient reverse translation.
   */
  function swapLanguages() {
    const src = sourceSel.value;
    const tgt = targetSel.value;

    if (src === 'autodetect') {
      showStatus('Cannot swap while "Detect Language" is selected. Choose a specific source language first.');
      return;
    }

    sourceSel.value = tgt;
    targetSel.value = src;

    const previousOutput = state.outputText;
    if (previousOutput) {
      inputEl.value = previousOutput;
      updateCharCount();
    }

    setOutput('');
    hideStatus();
    debouncedTranslate();
  }

  /* ── Dark Mode ───────────────────────────────────────────── */

  /**
   * Apply a theme and update all dependent UI elements.
   * Theme restore on page load is handled by the inline <script>
   * in <head> before first paint. This function handles user-initiated
   * toggles and keeps the button icons / label in sync.
   * @param {'light'|'dark'} theme
   */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const isDark = theme === 'dark';
    themeLabelEl.textContent = isDark ? 'Light' : 'Dark';
    iconSunEl.classList.toggle('hidden', isDark);
    iconMoonEl.classList.toggle('hidden', !isDark);
  }

  /**
   * Sync the theme toggle button to match the current data-theme.
   * Called once on init so the button reflects whatever theme the
   * inline head script already applied.
   */
  function syncThemeButton() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current);
  }

  /** Toggle theme and persist to localStorage. */
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem('theme', next);
    } catch (_err) {
      // localStorage unavailable (private browsing) — not critical
    }
  }

  /* ── Debounced translate ─────────────────────────────────── */
  // Declared after translate() so the const binding is fully
  // initialised before swapLanguages() (which calls it) can run.
  const debouncedTranslate = debounce(translate, DEBOUNCE_DELAY);

  /* ── Event Listeners ─────────────────────────────────────── */

  inputEl.addEventListener('input', () => {
    updateCharCount();
    debouncedTranslate();
  });

  translateBtn.addEventListener('click', translate);
  swapBtn.addEventListener('click', swapLanguages);

  sourceSel.addEventListener('change', () => {
    hideStatus();
    debouncedTranslate();
  });

  targetSel.addEventListener('change', () => {
    hideStatus();
    debouncedTranslate();
  });

  listenInputBtn.addEventListener('click', () => speak(inputEl.value, sourceSel.value));
  listenOutputBtn.addEventListener('click', () => speak(state.outputText, targetSel.value));

  copyInputBtn.addEventListener('click', () => copyToClipboard(inputEl.value, copyInputBtn));
  copyOutputBtn.addEventListener('click', () => copyToClipboard(state.outputText, copyOutputBtn));

  themeToggleBtn.addEventListener('click', toggleTheme);

  /* ── Initialise ──────────────────────────────────────────── */

  // Sync the toggle button icons/label to whatever theme the
  // inline head script already applied (may be dark or light)
  syncThemeButton();

  // Sync the character counter with the pre-filled textarea value
  updateCharCount();

  // Auto-translate the default text on page load
  translate();

}); // end DOMContentLoaded
