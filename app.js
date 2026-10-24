(function () {
      const STORAGE_KEY = 'konkur_anki_sm2_state_v1';
      const SAMPLE_BULK_TEXT = [
        'arise = ظهور کردن - پدید آمدن // New opportunities may arise at any moment.',
        'inevitable = اجتناب‌ناپذیر - حتمی // Change is an inevitable part of life.',
        'obstacle = مانع - سد راه // Lack of vocabulary is a major obstacle in reading.',
        'comprehend = درک کردن - فهمیدن // Hard to comprehend the complex passage.',
        'elaborate = با جزئیات توضیح دادن - مفصل // Please elaborate on your main argument.',
        'vital = حیاتی - ضروری // Regular review is vital for long-term memory.',
        'persuade = متقاعد کردن - راضی کردن // She tried to persuade him to study daily.',
        'eliminate = حذف کردن - از بین بردن // Eliminate two wrong options first.',
        'contribute = کمک کردن - سهیم بودن // Daily practice contributes to a top rank.',
        'accurate = دقیق - صحیح // Provide an accurate translation of the sentence.',
        'reluctant = بی‌میل - ناراضی // He was reluctant to accept the new schedule.',
        'phenomenon = پدیده // A natural phenomenon observed by scientists.',
        'acknowledge = تصدیق کردن - پذیرفتن // Scientists acknowledge the importance of sleep.',
        'abundant = فراوان - سرشار // The region has abundant natural resources.',
        'consequence = پیامد - نتیجه // Every decision has a direct consequence.',
        'enhance = ارتقا دادن - بهبود بخشیدن // Flashcards enhance vocabulary retention.',
        'priority = اولویت - تقدم // High-frequency words should be your top priority.',
        'significant = مهم - قابل توجه // A significant improvement in reading speed.',
        'diversity = تنوع - گوناگونی // Cultural and biological diversity.',
        'sustain = حفظ کردن - تداوم بخشیدن // Sustain your focus during the exam.'
      ].join('\n');

      // Smart parser for lines like: arise = ظهور کردن - پدید آمدن
      function parseBulkLine(rawLine) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) return null;

        let mainPart = line;
        let notePart = '';
        const noteIdx = line.indexOf('//');
        if (noteIdx !== -1) {
          mainPart = line.slice(0, noteIdx).trim();
          notePart = line.slice(noteIdx + 2).trim();
        }

        let front = '';
        let back = '';

        // Priority 1: '=' delimiter (preserves '-' inside Persian definitions!)
        const eqIdx = mainPart.indexOf('=');
        if (eqIdx !== -1) {
          front = mainPart.slice(0, eqIdx).trim();
          back = mainPart.slice(eqIdx + 1).trim();
        } else if (mainPart.indexOf(':') !== -1) {
          const colIdx = mainPart.indexOf(':');
          front = mainPart.slice(0, colIdx).trim();
          back = mainPart.slice(colIdx + 1).trim();
        } else if (mainPart.indexOf('\t') !== -1) {
          const tabIdx = mainPart.indexOf('\t');
          front = mainPart.slice(0, tabIdx).trim();
          back = mainPart.slice(tabIdx + 1).trim();
        } else {
          // Fallback: detect transition from Latin characters to Persian/Arabic characters
          const match = mainPart.match(/^([A-Za-z0-9\s'().,/-]+?)\s+([\u0600-\u06FF].*)$/);
          if (match) {
            front = match[1].replace(/[-–—]+$/, '').trim();
            back = match[2].trim();
          }
        }

        if (!front || !back) return null;
        return { front, back, note: notePart };
      }

      function createCardObject(front, back, deck, note, idxOffset) {
        return {
          id: 'card_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '_' + (idxOffset || 0),
          front: front.trim(),
          back: back.trim(),
          deck: (deck || 'لغات پرتکرار کنکور').trim(),
          note: (note || '').trim(),
          state: 'new', // 'new' | 'learning' | 'review'
          step: 0,
          interval: 0, // in days for 'review' state
          ease: 2.5,
          reps: 0,
          lapses: 0,
          due: Date.now(),
          starred: false
        };
      }

      function buildDefaultState() {
        const lines = SAMPLE_BULK_TEXT.split('\n');
        const cards = [];
        lines.forEach((ln, idx) => {
          const parsed = parseBulkLine(ln);
          if (parsed) {
            const deckName = idx < 12 ? 'لغات پرتکرار کنکور' : 'درک مطلب و کلوز تست';
            const c = createCardObject(parsed.front, parsed.back, deckName, parsed.note, idx);
            if (idx === 0 || idx === 1 || idx === 5) c.starred = true;
            cards.push(c);
          }
        });
        return {
          cards: cards,
          reviewsToday: 0,
          lastStudyDate: new Date().toISOString().slice(0, 10),
          direction: 'en2fa', // 'en2fa' | 'fa2en'
          autoSpeak: true,
          selectedDeck: 'ALL',
          lightMode: false,
          popupView: false
        };
      }

      let appState = buildDefaultState();
      let cramQueue = null; // null when normal SM-2 mode; array of card IDs when in Cram mode
      let currentCardId = null;
      let isAnswerShown = false;

      // Spare-time timer state
      let timerSeconds = 600;
      let timerHandle = null;

      function loadState() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
              appState = Object.assign(buildDefaultState(), parsed);
            }
          }
        } catch (err) {
          // Fallback to in-memory state inside strict sandboxed frames
        }
        const todayStr = new Date().toISOString().slice(0, 10);
        if (appState.lastStudyDate !== todayStr) {
          appState.reviewsToday = 0;
          appState.lastStudyDate = todayStr;
        }
      }

      function saveState() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        } catch (err) {
          // Ignore storage restriction in sandboxed iframe
        }
      }

      function showToast(message, type) {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const el = document.createElement('div');
        const bgClass = type === 'warn'
          ? 'bg-amber-600 text-white'
          : type === 'error'
          ? 'bg-rose-600 text-white'
          : 'bg-indigo-600 text-white';
        el.className = 'px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 transition-all duration-300 ' + bgClass;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => {
          el.style.opacity = '0';
          setTimeout(() => el.remove(), 260);
        }, 2600);
      }

      // Compute Anki SM-2 preview intervals and next scheduling parameters
      function computeAnkiSchedule(card, rating) {
        // rating: 1=Again, 2=Hard, 3=Good, 4=Easy
        const now = Date.now();
        const MINUTE = 60 * 1000;
        const DAY = 24 * 60 * MINUTE;

        let nextState = card.state;
        let nextInterval = card.interval || 0;
        let nextEase = card.ease || 2.5;
        let nextStep = card.step || 0;
        let nextDue = now;
        let label = '';

        if (card.state === 'new' || card.state === 'learning') {
          if (rating === 1) {
            nextState = 'learning';
            nextStep = 0;
            nextDue = now + 1 * MINUTE;
            label = '< ۱ دقیقه';
          } else if (rating === 2) {
            nextState = 'learning';
            nextStep = 1;
            nextDue = now + 6 * MINUTE;
            label = '۶ دقیقه';
          } else if (rating === 3) {
            if (card.state === 'new' && nextStep === 0) {
              nextState = 'learning';
              nextStep = 1;
              nextDue = now + 10 * MINUTE;
              label = '۱۰ دقیقه';
            } else {
              nextState = 'review';
              nextInterval = 1;
              nextDue = now + 1 * DAY;
              label = '۱ روز';
            }
          } else if (rating === 4) {
            nextState = 'review';
            nextInterval = 4;
            nextEase = Math.min(3.2, nextEase + 0.15);
            nextDue = now + 4 * DAY;
            label = '۴ روز';
          }
        } else {
          // Review card (SM-2)
          const curIv = Math.max(1, card.interval || 1);
          if (rating === 1) {
            nextState = 'learning';
            nextStep = 0;
            nextInterval = 1;
            nextEase = Math.max(1.3, nextEase - 0.2);
            nextDue = now + 1 * MINUTE;
            label = '۱۰ دقیقه';
          } else if (rating === 2) {
            nextState = 'review';
            nextInterval = Math.max(curIv + 1, Math.round(curIv * 1.2));
            nextEase = Math.max(1.3, nextEase - 0.15);
            nextDue = now + nextInterval * DAY;
            label = nextInterval + ' روز';
          } else if (rating === 3) {
            nextState = 'review';
            nextInterval = Math.max(curIv + 1, Math.round(curIv * nextEase));
            nextDue = now + nextInterval * DAY;
            label = nextInterval + ' روز';
          } else if (rating === 4) {
            nextState = 'review';
            nextEase = Math.min(3.5, nextEase + 0.15);
            nextInterval = Math.max(curIv + 2, Math.round(curIv * nextEase * 1.3));
            nextDue = now + nextInterval * DAY;
            label = nextInterval + ' روز';
          }
        }

        return {
          state: nextState,
          interval: nextInterval,
          ease: Number(nextEase.toFixed(2)),
          step: nextStep,
          due: nextDue,
          label: label
        };
      }

      function speakEnglishText(text) {
        if (!('speechSynthesis' in window)) {
          showToast('مرورگر شما از تلفظ صوتی پشتیبانی نمی‌کند.', 'warn');
          return;
        }
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = 'en-US';
          utter.rate = 0.92;
          window.speechSynthesis.speak(utter);
        } catch (e) {
          // Ignore speech error
        }
      }

      function getDecksList() {
        const set = new Set(['لغات پرتکرار کنکور']);
        appState.cards.forEach(c => {
          if (c.deck) set.add(c.deck);
        });
        return Array.from(set);
      }

      function refreshDeckSelectors() {
        const decks = getDecksList();
        const studySel = document.getElementById('studyDeckSelect');
        const browserSel = document.getElementById('browserDeckFilter');

        [studySel, browserSel].forEach(sel => {
          if (!sel) return;
          const currentVal = sel.value || 'ALL';
          sel.innerHTML = '<option value="ALL">همه دسته‌ها (' + appState.cards.length + ')</option>';
          decks.forEach(d => {
            const count = appState.cards.filter(c => c.deck === d).length;
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d + ' (' + count + ')';
            sel.appendChild(opt);
          });
          if (Array.from(sel.options).some(o => o.value === currentVal)) {
            sel.value = currentVal;
          }
        });
      }

      function getFilteredDeckCards() {
        const deckFilter = appState.selectedDeck || 'ALL';
        return appState.cards.filter(c => deckFilter === 'ALL' || c.deck === deckFilter);
      }

      function updateCountersAndStats() {
        const now = Date.now();
        const deckCards = getFilteredDeckCards();

        // Learning cards due within 20 minutes are treated as active in-session learning cards just like Anki
        const newCount = deckCards.filter(c => c.state === 'new').length;
        const learnCount = deckCards.filter(c => c.state === 'learning' && c.due <= now + 20 * 60 * 1000).length;
        const reviewDueCount = deckCards.filter(c => c.state === 'review' && c.due <= now).length;
        const totalDue = newCount + learnCount + reviewDueCount;

        document.getElementById('hdrNewCount').textContent = newCount;
        document.getElementById('hdrLearnCount').textContent = learnCount;
        document.getElementById('hdrDueCount').textContent = reviewDueCount;
        document.getElementById('tabBadgeDue').textContent = totalDue;
        document.getElementById('tabBadgeTotal').textContent = appState.cards.length;

        // Stats Tab KPIs
        const gradCount = appState.cards.filter(c => c.state === 'review').length;
        const starredCount = appState.cards.filter(c => c.starred).length;
        const avgEase = appState.cards.length
          ? Math.round((appState.cards.reduce((acc, c) => acc + (c.ease || 2.5), 0) / appState.cards.length) * 100)
          : 250;

        document.getElementById('statReviewsToday').textContent = appState.reviewsToday || 0;
        document.getElementById('statGraduatedCount').textContent = gradCount;
        document.getElementById('statAvgEase').textContent = avgEase + '%';
        document.getElementById('statStarredCount').textContent = starredCount;
      }

      function pickNextStudyCard() {
        if (cramQueue && cramQueue.length > 0) {
          const nextId = cramQueue[0];
          const found = appState.cards.find(c => c.id === nextId);
          if (found) return found;
          cramQueue.shift();
        } else {
          cramQueue = null;
        }

        const now = Date.now();
        const deckCards = getFilteredDeckCards();

        // 1. Learning cards that are due now
        const dueLearning = deckCards
          .filter(c => c.state === 'learning' && c.due <= now)
          .sort((a, b) => a.due - b.due);
        if (dueLearning.length > 0) return dueLearning[0];

        // 2. Review cards that are due now
        const dueReview = deckCards
          .filter(c => c.state === 'review' && c.due <= now)
          .sort((a, b) => a.due - b.due);
        if (dueReview.length > 0) return dueReview[0];

        // 3. New cards
        const newCards = deckCards.filter(c => c.state === 'new');
        if (newCards.length > 0) return newCards[0];

        // 4. Learning cards due within 20 minutes (Anki lookahead window)
        const aheadLearning = deckCards
          .filter(c => c.state === 'learning' && c.due <= now + 20 * 60 * 1000)
          .sort((a, b) => a.due - b.due);
        if (aheadLearning.length > 0) return aheadLearning[0];

        return null;
      }

      function renderStudyView() {
        updateCountersAndStats();
        const card = pickNextStudyCard();
        const activeBox = document.getElementById('studyActiveContainer');
        const doneBox = document.getElementById('studyDoneContainer');

        if (!card) {
          currentCardId = null;
          activeBox.classList.add('hidden');
          doneBox.classList.remove('hidden');
          return;
        }

        currentCardId = card.id;
        isAnswerShown = false;
        activeBox.classList.remove('hidden');
        doneBox.classList.add('hidden');

        // State badge
        const badgeEl = document.getElementById('cardStateBadge');
        if (cramQueue) {
          badgeEl.textContent = 'مرور آزاد (Cram)';
          badgeEl.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30';
        } else if (card.state === 'new') {
          badgeEl.textContent = 'کارت جدید (New)';
          badgeEl.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30';
        } else if (card.state === 'learning') {
          badgeEl.textContent = 'در حال یادگیری (Learning)';
          badgeEl.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
        } else {
          badgeEl.textContent = 'مرور زمان‌بندی‌شده (Review)';
          badgeEl.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        }

        document.getElementById('cardDeckBadge').textContent = card.deck || 'لغات پرتکرار کنکور';
        document.getElementById('cardMetaInfo').textContent = 'EF: ' + (card.ease || 2.5).toFixed(2) + ' | مرور: ' + (card.reps || 0);
        document.getElementById('cardStarIcon').textContent = card.starred ? '⭐' : '☆';

        const isEnToFa = appState.direction !== 'fa2en';
        const promptHint = document.getElementById('cardPromptHint');
        const answerHint = document.getElementById('cardAnswerHint');
        const frontTextEl = document.getElementById('cardFrontText');
        const backRawEl = document.getElementById('cardBackRaw');
        const backChipsEl = document.getElementById('cardBackChips');

        if (isEnToFa) {
          promptHint.textContent = 'Front • روی کارت (لغت انگلیسی)';
          answerHint.textContent = 'Back • پشت کارت (معنی فارسی)';
          frontTextEl.textContent = card.front;
          frontTextEl.setAttribute('dir', 'ltr');
          frontTextEl.className = 'font-en text-3xl sm:text-5xl font-black tracking-tight break-words';
          backRawEl.textContent = card.back;
          backRawEl.setAttribute('dir', 'rtl');
        } else {
          promptHint.textContent = 'Front • روی کارت (معنی فارسی)';
          answerHint.textContent = 'Back • پشت کارت (لغت انگلیسی)';
          frontTextEl.textContent = card.back;
          frontTextEl.setAttribute('dir', 'rtl');
          frontTextEl.className = 'text-2xl sm:text-4xl font-black tracking-tight break-words';
          backRawEl.textContent = card.front;
          backRawEl.setAttribute('dir', 'ltr');
        }

        // Split Persian meaning by '-' or '،' into neat visual chips
        backChipsEl.innerHTML = '';
        const parts = (isEnToFa ? card.back : card.front)
          .split(/\s*[-–—،,]\s*/)
          .map(s => s.trim())
          .filter(Boolean);
        if (parts.length > 1) {
          parts.forEach(p => {
            const chip = document.createElement('span');
            chip.className = 'px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-bold';
            chip.textContent = p;
            backChipsEl.appendChild(chip);
          });
        }

        // Example / Note
        const exBox = document.getElementById('cardExampleBox');
        const noteInput = document.getElementById('cardNoteInput');
        noteInput.value = card.note || '';
        if (card.note) {
          exBox.textContent = '💡 ' + card.note;
          exBox.classList.remove('hidden');
        } else {
          exBox.textContent = '';
          exBox.classList.add('hidden');
        }

        // Hide back area, show "Show Answer" button
        document.getElementById('cardBackArea').classList.add('hidden');
        document.getElementById('btnShowAnswer').classList.remove('hidden');
        const ratingGrid = document.getElementById('ankiRatingGrid');
        ratingGrid.classList.add('hidden');
        ratingGrid.classList.remove('grid');

        // Pre-calculate intervals on the 4 rating buttons
        document.getElementById('lblIntervalAgain').textContent = computeAnkiSchedule(card, 1).label;
        document.getElementById('lblIntervalHard').textContent = computeAnkiSchedule(card, 2).label;
        document.getElementById('lblIntervalGood').textContent = computeAnkiSchedule(card, 3).label;
        document.getElementById('lblIntervalEasy').textContent = computeAnkiSchedule(card, 4).label;

        if (appState.autoSpeak && isEnToFa) {
          speakEnglishText(card.front);
        }
      }

      function revealCurrentCardAnswer() {
        if (!currentCardId || isAnswerShown) return;
        isAnswerShown = true;
        document.getElementById('cardBackArea').classList.remove('hidden');
        document.getElementById('btnShowAnswer').classList.add('hidden');
        const ratingGrid = document.getElementById('ankiRatingGrid');
        ratingGrid.classList.remove('hidden');
        ratingGrid.classList.add('grid');

        const card = appState.cards.find(c => c.id === currentCardId);
        if (card && appState.autoSpeak && appState.direction === 'fa2en') {
          speakEnglishText(card.front);
        }
      }

      function rateCurrentCard(rating) {
        if (!currentCardId) return;
        const card = appState.cards.find(c => c.id === currentCardId);
        if (!card) return;

        if (cramQueue && cramQueue.length > 0) {
          cramQueue.shift();
          if (rating === 1) {
            // Re-insert at end of cram session if user pressed Again
            cramQueue.push(card.id);
          }
        } else {
          const sched = computeAnkiSchedule(card, rating);
          card.state = sched.state;
          card.interval = sched.interval;
          card.ease = sched.ease;
          card.step = sched.step;
          card.due = sched.due;
          card.reps = (card.reps || 0) + 1;
          if (rating === 1) card.lapses = (card.lapses || 0) + 1;
        }

        appState.reviewsToday = (appState.reviewsToday || 0) + 1;
        saveState();
        renderStudyView();
      }

      // Live Bulk Parser Preview
      function updateLiveBulkPreview() {
        const rawText = document.getElementById('bulkWordsTextarea').value || '';
        const lines = rawText.split(/\r?\n/);
        const tbody = document.getElementById('livePreviewTbody');
        tbody.innerHTML = '';

        let validCount = 0;
        let invalidCount = 0;

        lines.forEach((ln, idx) => {
          const trimmed = ln.trim();
          if (!trimmed) return;
          const parsed = parseBulkLine(trimmed);
          if (!parsed) {
            invalidCount++;
            const tr = document.createElement('tr');
            tr.className = 'bg-rose-500/10';
            tr.innerHTML =
              '<td class="py-2 px-3 font-en text-muted-custom">' + (idx + 1) + '</td>' +
              '<td colspan="3" class="py-2 px-3 text-rose-300">فرمت نامعتبر (از علامت = بین لغت و معنی استفاده کنید): ' + escapeHtml(trimmed) + '</td>' +
              '<td class="py-2 px-3 text-rose-400 font-bold">خطا</td>';
            tbody.appendChild(tr);
            return;
          }

          validCount++;
          const exists = appState.cards.some(c => c.front.toLowerCase() === parsed.front.toLowerCase());
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-slate-700/20';
          tr.innerHTML =
            '<td class="py-2 px-3 font-en text-muted-custom">' + validCount + '</td>' +
            '<td class="py-2 px-3 font-en font-bold text-indigo-300" dir="ltr">' + escapeHtml(parsed.front) + '</td>' +
            '<td class="py-2 px-3 font-bold text-emerald-300">' + escapeHtml(parsed.back) + '</td>' +
            '<td class="py-2 px-3 text-muted-custom font-en" dir="ltr">' + escapeHtml(parsed.note || '—') + '</td>' +
            '<td class="py-2 px-3">' +
              (exists
                ? '<span class="px-2 py-0.5 rounded-full text-[11px] bg-amber-500/20 text-amber-300 font-bold">موجود در بانک</span>'
                : '<span class="px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/20 text-emerald-300 font-bold">کارت جدید</span>') +
            '</td>';
          tbody.appendChild(tr);
        });

        if (validCount === 0 && invalidCount === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-muted-custom">لیست لغات خود را در کادر بالا وارد کنید تا پیش‌نمایش تفکیک خودکار Front و Back را ببینید.</td></tr>';
        }

        document.getElementById('parseCountValid').textContent = validCount;
        document.getElementById('parseCountInvalid').textContent = invalidCount;
      }

      function commitBulkImport() {
        const rawText = document.getElementById('bulkWordsTextarea').value || '';
        const deckName = (document.getElementById('importDeckInput').value || 'لغات پرتکرار کنکور').trim();
        const dupMode = document.getElementById('importDuplicateMode').value;

        const lines = rawText.split(/\r?\n/);
        let added = 0;
        let updated = 0;
        let skipped = 0;

        lines.forEach((ln, idx) => {
          const parsed = parseBulkLine(ln);
          if (!parsed) return;
          const existing = appState.cards.find(c => c.front.toLowerCase() === parsed.front.toLowerCase());
          if (existing) {
            if (dupMode === 'skip') {
              skipped++;
              return;
            } else if (dupMode === 'update') {
              existing.back = parsed.back;
              existing.deck = deckName;
              if (parsed.note) existing.note = parsed.note;
              updated++;
              return;
            }
          }
          appState.cards.unshift(createCardObject(parsed.front, parsed.back, deckName, parsed.note, idx));
          added++;
        });

        if (added === 0 && updated === 0) {
          showToast('هیچ کارت جدیدی برای افزودن یافت نشد! لطفاً لیست لغات را وارد کنید.', 'warn');
          return;
        }

        appState.selectedDeck = deckName;
        saveState();
        refreshDeckSelectors();
        document.getElementById('studyDeckSelect').value = deckName;
        updateLiveBulkPreview();
        renderStudyView();
        showToast(added + ' کارت جدید اضافه شد' + (updated ? ' و ' + updated + ' کارت به‌روزرسانی شد!' : '!'), 'success');
        switchTab('study');
      }

      function formatDueRemaining(dueTs, state) {
        if (state === 'new') return 'آماده شروع (جدید)';
        const diff = dueTs - Date.now();
        if (diff <= 0) return 'هم‌اکنون (موعد مرور)';
        const mins = Math.round(diff / 60000);
        if (mins < 60) return mins + ' دقیقه دیگر';
        const hours = Math.round(mins / 60);
        if (hours < 24) return hours + ' ساعت دیگر';
        const days = Math.round(hours / 24);
        return days + ' روز دیگر';
      }

      function renderBrowserTable() {
        const query = (document.getElementById('browserSearchInput').value || '').trim().toLowerCase();
        const deckFilter = document.getElementById('browserDeckFilter').value || 'ALL';
        const stateFilter = document.getElementById('browserStateFilter').value || 'ALL';
        const tbody = document.getElementById('browserTableBody');
        tbody.innerHTML = '';

        const filtered = appState.cards.filter(c => {
          if (deckFilter !== 'ALL' && c.deck !== deckFilter) return false;
          if (stateFilter === 'starred' && !c.starred) return false;
          if (stateFilter !== 'ALL' && stateFilter !== 'starred' && c.state !== stateFilter) return false;
          if (query) {
            const hay = (c.front + ' ' + c.back + ' ' + (c.note || '')).toLowerCase();
            if (!hay.includes(query)) return false;
          }
          return true;
        });

        if (filtered.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-muted-custom">کارتی با این مشخصات یافت نشد.</td></tr>';
          return;
        }

        filtered.forEach(c => {
          const tr = document.createElement('tr');
          tr.className = 'hover:bg-slate-700/20 transition';
          const stateBadge = c.state === 'new'
            ? '<span class="px-2 py-0.5 rounded-full text-[11px] bg-sky-500/20 text-sky-300 font-bold">جدید</span>'
            : c.state === 'learning'
            ? '<span class="px-2 py-0.5 rounded-full text-[11px] bg-amber-500/20 text-amber-300 font-bold">یادگیری</span>'
            : '<span class="px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/20 text-emerald-300 font-bold">مرور (' + (c.interval || 1) + 'd)</span>';

          tr.innerHTML =
            '<td class="py-2.5 px-3 font-en font-bold text-indigo-300" dir="ltr">' + escapeHtml(c.front) + '</td>' +
            '<td class="py-2.5 px-3 font-bold text-emerald-300">' + escapeHtml(c.back) + '</td>' +
            '<td class="py-2.5 px-3 text-muted-custom">' + escapeHtml(c.deck) + '</td>' +
            '<td class="py-2.5 px-3">' + stateBadge + '</td>' +
            '<td class="py-2.5 px-3 text-muted-custom">' + formatDueRemaining(c.due, c.state) + '</td>' +
            '<td class="py-2.5 px-3 text-center whitespace-nowrap">' +
              '<button type="button" data-row-action="speak" data-id="' + c.id + '" class="px-1.5 py-1 rounded hover:bg-indigo-500/20" title="تلفظ">🔊</button>' +
              '<button type="button" data-row-action="star" data-id="' + c.id + '" class="px-1.5 py-1 rounded hover:bg-amber-500/20" title="نشان‌دار">' + (c.starred ? '⭐' : '☆') + '</button>' +
              '<button type="button" data-row-action="reset" data-id="' + c.id + '" class="px-1.5 py-1 rounded hover:bg-sky-500/20" title="بازنشانی به کارت جدید">🔄</button>' +
              '<button type="button" data-row-action="delete" data-id="' + c.id + '" class="px-1.5 py-1 rounded hover:bg-rose-500/20 text-rose-400" title="حذف کارت">🗑️</button>' +
            '</td>';
          tbody.appendChild(tr);
        });
      }

      function escapeHtml(str) {
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function switchTab(tabName) {
        const views = {
          study: document.getElementById('viewStudy'),
          import: document.getElementById('viewImport'),
          browser: document.getElementById('viewBrowser'),
          stats: document.getElementById('viewStats')
        };
        Object.keys(views).forEach(k => {
          if (views[k]) {
            views[k].classList.toggle('hidden', k !== tabName);
          }
        });

        document.querySelectorAll('.tab-nav-btn').forEach(btn => {
          const isMatch = btn.getAttribute('data-tab') === tabName;
          btn.classList.toggle('tab-btn-active', isMatch);
          btn.classList.toggle('surface-elevated', !isMatch);
        });

        if (tabName === 'study') renderStudyView();
        if (tabName === 'import') updateLiveBulkPreview();
        if (tabName === 'browser') renderBrowserTable();
        if (tabName === 'stats') updateCountersAndStats();
      }

      function renderTimerDisplay() {
        const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
        const s = String(timerSeconds % 60).padStart(2, '0');
        document.getElementById('timerDisplay').textContent = m + ':' + s;
      }

      function applyThemeAndPopupMode() {
        document.documentElement.classList.toggle('light-mode', Boolean(appState.lightMode));
        document.getElementById('themeIcon').textContent = appState.lightMode ? '🌙' : '☀️';

        const shell = document.getElementById('appShell');
        shell.classList.toggle('popup-frame-mode', Boolean(appState.popupView));
        document.getElementById('popupViewLabel').textContent = appState.popupView ? '🖥️ نمای کامل' : '📱 نمای پاپ‌آپ';
      }

      // Wire all Event Listeners
      function initEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-nav-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            switchTab(btn.getAttribute('data-tab'));
          });
        });

        // Header toggles
        document.getElementById('btnToggleTheme').addEventListener('click', () => {
          appState.lightMode = !appState.lightMode;
          applyThemeAndPopupMode();
          saveState();
        });

        document.getElementById('btnTogglePopupView').addEventListener('click', () => {
          appState.popupView = !appState.popupView;
          applyThemeAndPopupMode();
          saveState();
          showToast(appState.popupView ? 'نمای پاپ‌آپ اکستنشن کروم فعال شد' : 'نمای کامل صفحه فعال شد');
        });

        // Study Controls
        document.getElementById('studyDeckSelect').addEventListener('change', (e) => {
          appState.selectedDeck = e.target.value;
          cramQueue = null;
          saveState();
          renderStudyView();
        });

        document.getElementById('btnToggleDirection').addEventListener('click', () => {
          appState.direction = appState.direction === 'fa2en' ? 'en2fa' : 'fa2en';
          document.getElementById('directionLabel').textContent =
            appState.direction === 'fa2en' ? 'فارسی ⬅ انگلیسی' : 'انگلیسی ⬅ فارسی';
          saveState();
          renderStudyView();
        });

        document.getElementById('btnToggleAutoSpeak').addEventListener('click', () => {
          appState.autoSpeak = !appState.autoSpeak;
          const lbl = document.getElementById('autoSpeakLabel');
          lbl.textContent = appState.autoSpeak ? 'فعال' : 'غیرفعال';
          lbl.className = appState.autoSpeak ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
          saveState();
        });

        // Timer controls
        document.getElementById('btnTimerStartPause').addEventListener('click', () => {
          const btn = document.getElementById('btnTimerStartPause');
          if (timerHandle) {
            clearInterval(timerHandle);
            timerHandle = null;
            btn.textContent = 'ادامه';
          } else {
            btn.textContent = 'توقف';
            timerHandle = setInterval(() => {
              if (timerSeconds > 0) {
                timerSeconds--;
                renderTimerDisplay();
              } else {
                clearInterval(timerHandle);
                timerHandle = null;
                btn.textContent = 'شروع';
                showToast('⏰ زمان ۱۰ دقیقه مرور اوقات فراغت شما به پایان رسید! خسته نباشید.');
              }
            }, 1000);
          }
        });

        document.getElementById('btnTimerReset').addEventListener('click', () => {
          if (timerHandle) {
            clearInterval(timerHandle);
            timerHandle = null;
          }
          timerSeconds = 600;
          renderTimerDisplay();
          document.getElementById('btnTimerStartPause').textContent = 'شروع';
        });

        // Card Actions
        document.getElementById('cardFrontArea').addEventListener('click', revealCurrentCardAnswer);
        document.getElementById('btnShowAnswer').addEventListener('click', revealCurrentCardAnswer);

        document.getElementById('btnPronounceCard').addEventListener('click', () => {
          const card = appState.cards.find(c => c.id === currentCardId);
          if (card) speakEnglishText(card.front);
        });

        document.getElementById('btnStarCard').addEventListener('click', () => {
          const card = appState.cards.find(c => c.id === currentCardId);
          if (!card) return;
          card.starred = !card.starred;
          document.getElementById('cardStarIcon').textContent = card.starred ? '⭐' : '☆';
          saveState();
          updateCountersAndStats();
          showToast(card.starred ? 'به لغات نشان‌دار اضافه شد ⭐' : 'از لغات نشان‌دار خارج شد');
        });

        document.getElementById('btnSaveCardNote').addEventListener('click', () => {
          const card = appState.cards.find(c => c.id === currentCardId);
          if (!card) return;
          card.note = document.getElementById('cardNoteInput').value.trim();
          saveState();
          const exBox = document.getElementById('cardExampleBox');
          if (card.note) {
            exBox.textContent = '💡 ' + card.note;
            exBox.classList.remove('hidden');
          } else {
            exBox.classList.add('hidden');
          }
          showToast('نکته کنکوری برای این لغت ذخیره شد ✅');
        });

        document.querySelectorAll('.anki-rate-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const rating = parseInt(btn.getAttribute('data-rating'), 10);
            rateCurrentCard(rating);
          });
        });

        // Done screen actions
        document.getElementById('btnStartCramAll').addEventListener('click', () => {
          const cards = getFilteredDeckCards();
          if (cards.length === 0) {
            showToast('هیچ کارتی در این دسته وجود ندارد.', 'warn');
            return;
          }
          cramQueue = cards.map(c => c.id);
          renderStudyView();
          showToast('حالت مرور آزاد (خارج از نوبت) برای ' + cards.length + ' کارت آغاز شد');
        });

        document.getElementById('btnStartCramStarred').addEventListener('click', () => {
          const starred = appState.cards.filter(c => c.starred);
          if (starred.length === 0) {
            showToast('هنوز هیچ لغتی را نشان‌دار (⭐) نکرده‌اید.', 'warn');
            return;
          }
          cramQueue = starred.map(c => c.id);
          renderStudyView();
          showToast('مرور آزاد لغات نشان‌دار آغاز شد ⭐');
        });

        document.getElementById('btnGoToImportFromDone').addEventListener('click', () => {
          switchTab('import');
        });

        // Bulk Import Listeners
        document.getElementById('bulkWordsTextarea').addEventListener('input', updateLiveBulkPreview);

        document.getElementById('btnInsertSampleList').addEventListener('click', () => {
          const sample = [
            'arise = ظهور کردن - پدید آمدن // Problems often arise when instructions are unclear.',
            'ambiguity = ابهام - دوپهلویی // Avoid ambiguity in academic writing.',
            'accelerate = سرعت بخشیدن - شتاب دادن // Technology can accelerate learning.',
            'comprehensive = جامع - فراگیر // A comprehensive review of high school vocabulary.',
            'deteriorate = رو به وخامت گذاشتن - بدتر شدن // Air quality began to deteriorate rapidly.',
            'exaggerate = مبالغه کردن - بزرگ‌نمایی کردن // Do not exaggerate the difficulty of the test.',
            'fluctuate = نوسان داشتن - بالا و پایین رفتن // Temperatures fluctuate wildly in the desert.',
            'incentive = انگیزه - مشوق // Bonus points provide an extra incentive.',
            'jeopardize = به خطر انداختن // Lack of sleep can jeopardize your exam performance.',
            'mitigate = کاهش دادن - تسکین دادن // Planting trees helps mitigate soil erosion.'
          ].join('\n');
          document.getElementById('bulkWordsTextarea').value = sample;
          updateLiveBulkPreview();
          showToast('نمونه لیست ۱۰ لغت کنکوری با فرمت word = meaning درج شد');
        });

        document.getElementById('btnClearBulkInput').addEventListener('click', () => {
          document.getElementById('bulkWordsTextarea').value = '';
          updateLiveBulkPreview();
        });

        document.getElementById('txtFileUpload').addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = function (evt) {
            document.getElementById('bulkWordsTextarea').value = String(evt.target.result || '');
            updateLiveBulkPreview();
            showToast('فایل متنی با موفقیت بارگذاری شد 📂');
          };
          reader.readAsText(file, 'UTF-8');
        });

        document.getElementById('btnCommitBulkImport').addEventListener('click', commitBulkImport);

        // Browser Table Listeners
        document.getElementById('browserSearchInput').addEventListener('input', renderBrowserTable);
        document.getElementById('browserDeckFilter').addEventListener('change', renderBrowserTable);
        document.getElementById('browserStateFilter').addEventListener('change', renderBrowserTable);

        document.getElementById('browserTableBody').addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-row-action]');
          if (!btn) return;
          const action = btn.getAttribute('data-row-action');
          const id = btn.getAttribute('data-id');
          const cardIdx = appState.cards.findIndex(c => c.id === id);
          if (cardIdx === -1) return;
          const card = appState.cards[cardIdx];

          if (action === 'speak') {
            speakEnglishText(card.front);
          } else if (action === 'star') {
            card.starred = !card.starred;
            saveState();
            renderBrowserTable();
            updateCountersAndStats();
          } else if (action === 'reset') {
            card.state = 'new';
            card.interval = 0;
            card.step = 0;
            card.ease = 2.5;
            card.due = Date.now();
            saveState();
            renderBrowserTable();
            updateCountersAndStats();
            showToast('وضعیت مرور کارت «' + card.front + '» به کارت جدید بازنشانی شد');
          } else if (action === 'delete') {
            appState.cards.splice(cardIdx, 1);
            saveState();
            refreshDeckSelectors();
            renderBrowserTable();
            updateCountersAndStats();
            showToast('کارت حذف شد');
          }
        });

        // Export & Reset buttons in Browser tab
        document.getElementById('btnExportTxtList').addEventListener('click', () => {
          const lines = appState.cards.map(c => c.front + ' = ' + c.back + (c.note ? ' // ' + c.note : ''));
          const panel = document.getElementById('exportTextPanel');
          const area = document.getElementById('exportTextarea');
          area.value = lines.join('\n');
          panel.classList.remove('hidden');
        });

        document.getElementById('btnCopyExportText').addEventListener('click', () => {
          const area = document.getElementById('exportTextarea');
          area.select();
          try {
            document.execCommand('copy');
            showToast('لیست لغات در کلیپ‌بورد کپی شد 📋');
          } catch (err) {
            showToast('متن انتخاب شد؛ با Ctrl+C کپی کنید');
          }
        });

        document.getElementById('btnCloseExportPanel').addEventListener('click', () => {
          document.getElementById('exportTextPanel').classList.add('hidden');
        });

        document.getElementById('btnExportJsonBackup').addEventListener('click', () => {
          const blob = new Blob([JSON.stringify(appState, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'konkur_anki_backup.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          showToast('فایل پشتیبان JSON دانلود شد 💾');
        });

        document.getElementById('btnResetAllProgress').addEventListener('click', () => {
          const now = Date.now();
          appState.cards.forEach(c => {
            c.state = 'new';
            c.interval = 0;
            c.step = 0;
            c.ease = 2.5;
            c.due = now;
          });
          cramQueue = null;
          saveState();
          renderBrowserTable();
          updateCountersAndStats();
          showToast('وضعیت مرور همه کارت‌ها به حالت «جدید» بازنشانی شد 🔄');
        });

        // Keyboard shortcuts for fast Anki review (Space = flip, 1-4 = rate, P = pronounce)
        window.addEventListener('keydown', (e) => {
          const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
          if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
          const studyVisible = !document.getElementById('viewStudy').classList.contains('hidden');
          if (!studyVisible || !currentCardId) return;

          if (e.code === 'Space') {
            e.preventDefault();
            if (!isAnswerShown) {
              revealCurrentCardAnswer();
            } else {
              rateCurrentCard(3); // Space on revealed card = Good (3), just like Anki!
            }
          } else if (isAnswerShown && (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4')) {
            e.preventDefault();
            rateCurrentCard(parseInt(e.key, 10));
          } else if (e.key.toLowerCase() === 'p') {
            e.preventDefault();
            const card = appState.cards.find(c => c.id === currentCardId);
            if (card) speakEnglishText(card.front);
          }
        });
      }

      // Initialize app
      loadState();
      applyThemeAndPopupMode();
      refreshDeckSelectors();
      initEventListeners();
      renderTimerDisplay();
      renderStudyView();
      updateLiveBulkPreview();
    })();