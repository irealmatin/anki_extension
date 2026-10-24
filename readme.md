# 🎴 Konkur Anki — Smart Spaced Repetition (SM-2) Vocabulary Extension & Web App

> **GitHub Short Description (for the repository "About" section):**
> A lightweight, offline-first Chrome/Edge Extension (Manifest V3) and standalone web app for mastering English-to-Persian (Konkur) vocabulary using the Anki SM-2 spaced repetition algorithm and an automated bulk-import parser (`word = meaning`).

**Recommended GitHub Topics:** `anki` `spaced-repetition` `sm2-algorithm` `chrome-extension` `manifest-v3` `vocabulary-learning` `flashcards` `konkur` `vanilla-js` `offline-first`

## ✨ Overview

**Konkur Anki** is a fast, zero-dependency browser extension and web application designed to help students and language learners review high-frequency English vocabulary in their spare time. Inspired by **Anki**, it combines a faithful implementation of the **SuperMemo-2 (SM-2)** spaced repetition algorithm with an **automated bulk text parser**—eliminating the tedious process of creating flashcards one by one.

Whether you open it as a compact **Browser Toolbar Popup**, pin it in your browser's **Side Panel** while reading PDFs and articles, or launch the **Standalone Single-File Web App**, all your decks, scheduling intervals, ease factors, and daily study streaks are saved automatically in local storage.

## 🚀 Key Features

* **⚡ Automated Bulk Vocabulary Parser (`word = meaning`):** Paste an entire list of words or upload a `.txt` file. The parser automatically extracts the English term before `=` as the **Front** of the card and the full Persian translation after `=` as the **Back**, preserving internal hyphens (e.g., `arise = ظهور کردن - پدید آمدن`) and optional example notes after `//`.
* **🧠 Authentic Anki SM-2 Spaced Repetition:** Dynamically calculates review intervals and adjusts each card's Ease Factor (`EF`) across four states (**New**, **Learning**, **Review**, and **Cram**) using Anki's four rating buttons (**Again**, **Hard**, **Good**, **Easy**).
* **🔊 Built-in English Pronunciation (TTS):** Uses the browser's native Web Speech API (`en-US`) for instant one-click or automatic audio pronunciation without requiring external audio files.
* **🔄 Bidirectional Study Mode:** Switch seamlessly between **English ➔ Persian** recognition and **Persian ➔ English** active recall.
* **⏱️ Spare-Time Pomodoro Timer:** Includes a built-in 10-minute quick-study timer designed for short, focused review sessions during breaks.
* **🎯 Out-of-Schedule Cram Mode:** Finished all due cards for today? Launch **Cram Mode** to practice all cards in a deck or drill only your **Starred (⭐)** difficult words without corrupting your long-term SM-2 schedule.
* **💾 100% Offline & Persistent Storage:** Automatically saves progress in `localStorage` across browser restarts and system reboots, with one-click export to **JSON** (full scheduling backup) or **Plain Text** (`word = meaning` format).
* **🌗 Dark & Light Themes + Popup Simulator:** Features a modern RTL/LTR bidirectional interface with Vazirmatn & Inter typography, Dark/Light mode toggle, and a Popup View switcher.

## 📝 Bulk Import Syntax

Instead of filling out manual forms for every word, switch to the **Bulk Import (⚡ ورود لیست لغات)** tab and paste multiple lines using the following format:

```text
arise = ظهور کردن - پدید آمدن // New opportunities may arise at any moment.
inevitable = اجتناب‌ناپذیر - حتمی // Change is an inevitable part of life.
obstacle = مانع - سد راه // Lack of vocabulary is a major obstacle in reading.
comprehend = درک کردن - فهمیدن
```

### How the Parser Processes Each Line

1. **Primary Delimiter (`=`):** Everything to the left of `=` becomes the **Card Front (English)**; everything to the right becomes the **Card Back (Persian)**. Internal hyphens (`-`) inside the Persian meaning are preserved intact and rendered both as individual visual chips and as a full definition line.
2. **Optional Context / Example (`//`):** Any text following `//` on the same line is automatically stored as a study note or example sentence revealed on the back of the card.
3. **Fallback Delimiters:** If `=` is omitted, the parser automatically falls back to `:`, `Tab`, or Unicode script boundary detection (Latin `A-Za-z` to Persian `\u0600-\u06FF`).
4. **Duplicate Handling:** Choose whether duplicate English words should **Update existing cards**, **Skip duplicates**, or **Add as new cards**, while viewing a live real-time preview table before committing.

## 📊 Spaced Repetition (SM-2) Scheduling Logic

When you reveal the back of a flashcard, Konkur Anki previews the exact next interval above each of the four rating buttons based on the card's current state and Ease Factor (`EF`, initialized at `2.50` / `250%`):

| Rating Button | Shortcut | New / Learning Card Behavior | Graduated Review Card Behavior (`SM-2`) | Ease Factor (`EF`) Adjustment |
| :--- | :--- | :--- | :--- | :--- |
| **1. Again (دوباره)** | `1` | Resets learning step; re-queued in `< 1 min` | Lapses card back to learning (`10 min`); resets interval to `1 day` | Decreases by `-0.20` (min `1.30`) |
| **2. Hard (سخت)** | `2` | Sets learning interval to `6 min` | Multiplies current interval by `1.2×` (minimum `+1 day`) | Decreases by `-0.15` (min `1.30`) |
| **3. Good (خوب)** | `3` | Advances step (`10 min` ➔ graduates to `1 day`) | Multiplies current interval by Ease Factor (`interval × EF`) | Unchanged (`±0.00`) |
| **4. Easy (آسان)** | `4` | Graduates immediately to Review with `4 days` interval | Multiplies current interval by `EF × 1.3` easy bonus | Increases by `+0.15` (max `3.50`) |

### Study Queue Priority

Just like desktop Anki, the study engine (`pickNextStudyCard`) serves cards in strict priority order:
1. **Due Learning Cards:** Cards in the `learning` state whose short-term timer has expired.
2. **Due Review Cards:** Graduated `review` cards whose scheduled day has arrived (`due <= Date.now()`).
3. **New Cards:** Unseen cards in the selected deck.
4. **20-Minute Lookahead Window:** Learning cards scheduled within the next 20 minutes so you can finish your current study session without waiting.

## ⌨️ Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| `Space` | Flip card to reveal answer (or rate **Good [3]** if answer is already shown) |
| `1` | Rate card **Again (دوباره)** — `< 1 min` |
| `2` | Rate card **Hard (سخت)** — `6 min` / `1.2×` |
| `3` | Rate card **Good (خوب)** — `10 min` / `1 day` / `EF×` |
| `4` | Rate card **Easy (آسان)** — `4 days` / `EF × 1.3×` |
| `P` | Play English audio pronunciation (`en-US` Text-to-Speech) |

## 🛠️ Installation & Usage

### Option 1: Install as a Chrome / Edge / Brave Extension (Manifest V3)

1. Download and extract `konkur_anki_extension.zip` to a folder on your computer.
2. Open your Chromium-based browser and navigate to `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click **Load unpacked** in the top-left corner and select the extracted extension folder.
5. Pin **Konkur Anki** to your browser toolbar to open the popup anytime, or open it in the browser **Side Panel** while studying documents.

### Option 2: Run as a Standalone Web App

Simply open `konkur_anki_app.html` in any modern desktop or mobile browser. It is a 100% self-contained single-file application requiring no local server, `npm install`, or build step.

## 📁 Repository Structure

```text
├── manifest.json          # Chrome Extension Manifest V3 configuration
├── popup.html             # Extension toolbar popup interface (420px optimized)
├── sidepanel.html         # Chrome Side Panel interface for split-screen study
├── app.js                 # Core SM-2 engine, bulk parser, TTS, and UI state manager
├── styles.css             # Offline-ready stylesheet (CSP-compliant for Manifest V3)
├── background.js          # Manifest V3 service worker
├── icons/                 # Extension icons (16x16, 48x48, 128x128 PNG)
├── konkur_anki_app.html   # Single-file standalone web application
└── README.md              # Project documentation
```

## 🧰 Tech Stack

* **Logic & State:** Vanilla JavaScript (ES6+) — zero external runtime dependencies
* **Markup & Layout:** Semantic HTML5 with bidirectional (`RTL` Persian / `LTR` English) support
* **Styling:** CSS3 custom properties (Dark/Light themes) & Tailwind CSS utilities
* **Speech Synthesis:** Browser-native `window.speechSynthesis` (Web Speech API)
* **Extension Platform:** Chromium Manifest V3 (`storage` and `sidePanel` permissions)

## 📄 License

This project is open-source and available under the **MIT License**. Contributions, issue reports, and shared Konkur vocabulary lists are welcome!
