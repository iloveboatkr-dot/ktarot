'use strict';
// DNS 우회 (공유기가 SRV 쿼리 차단 방지)
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();

const express        = require('express');
const fs             = require('fs');
const path           = require('path');
const vm             = require('vm');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit      = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'www')));

// ── Gemini AI ─────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const GEMINI_MODELS = (process.env.GEMINI_MODEL || 'gemini-2.5-flash,gemini-2.0-flash,gemini-1.5-flash')
    .split(',')
    .map(model => model.trim())
    .filter(Boolean);

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function loadTarotCards() {
    try {
        const tarotData = fs.readFileSync(path.join(__dirname, 'www', 'tarot_data.js'), 'utf8');
        return vm.runInNewContext(`${tarotData}\nTAROT_CARDS;`, {});
    } catch (err) {
        console.warn(`[Tarot Data] failed to load card catalog: ${err.message}`);
        return [];
    }
}

const TAROT_CARDS = loadTarotCards();

function normalizeCardName(value) {
    return String(value || '').trim().toLowerCase();
}

function findCardInfo(cardName) {
    const target = normalizeCardName(cardName);
    return TAROT_CARDS.find(card =>
        Object.values(card.name || {}).some(name => normalizeCardName(name) === target)
    );
}

function getCardKeywords(card, lang) {
    const info = findCardInfo(card.name);
    return info?.keywords?.[lang] || info?.keywords?.ko || '';
}

function getCardTheme(card, lang) {
    const keywords = getCardKeywords(card, lang);
    if (lang !== 'ko') return keywords || 'intuition, reflection, direction';

    if (/컵|사랑|감정|공감|돌봄|직관|행복|상실|추억|만족|낭만/.test(`${card.name} ${keywords}`)) {
        return '감정과 관계, 마음의 회복, 직관적인 판단';
    }
    if (/소드|명확|진실|갈등|불안|결정|분석|상처|생각/.test(`${card.name} ${keywords}`)) {
        return '생각의 정리, 대화, 판단, 불안에서 벗어나는 선택';
    }
    if (/완드|열정|창의|행동|도전|승리|리더십|속도/.test(`${card.name} ${keywords}`)) {
        return '행동력, 도전, 추진력, 새로운 가능성';
    }
    if (/펜타클|기회|번영|균형|노력|성공|실용|책임|풍요/.test(`${card.name} ${keywords}`)) {
        return '현실적인 성과, 돈과 일, 안정, 꾸준한 관리';
    }
    return '삶의 큰 흐름, 내면의 전환, 지금 필요한 태도';
}

function sanitizeGeminiError(err) {
    const raw = String(err?.message || err || 'unknown error');
    const redacted = raw
        .replace(/api_key:[A-Za-z0-9_-]+/g, 'api_key:[redacted]')
        .replace(/AIza[0-9A-Za-z_-]+/g, '[redacted-google-api-key]');
    if (redacted.includes('CONSUMER_SUSPENDED') || redacted.includes('has been suspended')) {
        return 'Gemini API key consumer is suspended';
    }
    if (redacted.includes('403') || redacted.includes('Forbidden')) {
        return 'Gemini API permission denied';
    }
    if (redacted.includes('429') || redacted.includes('quota')) {
        return 'Gemini API quota or rate limit reached';
    }
    if (redacted.includes('404') || redacted.includes('not found')) {
        return 'Gemini model is unavailable';
    }
    return redacted.slice(0, 300);
}

function createFallbackReading({ mode, cards, question, lang, pl, lbl }) {
    if (lang !== 'ko') {
        const cardSummary = cards
            .map((card, index) => {
                const label = mode === '3card' ? [pl.past, pl.present, pl.future][index] : pl.today;
                const keywords = getCardKeywords(card, lang);
                return `### ${label}: **${card.name}** (${card.reversed ? pl.reversed : pl.upright})

Keywords: ${keywords || getCardTheme(card, lang)}

This card asks you to slow down and read the emotional weather around the question, not only the visible facts. In this position, ${card.name} points to the part of the situation that is asking for attention now. If the card is upright, its energy can be used directly; if it is reversed, it may be showing a lesson that is blocked, delayed, or being avoided. Look at where your choices are coming from: fear, habit, hope, or genuine clarity.`;
            })
            .join('\n\n');

        return `## ${lbl.s1}

${cardSummary}

## ${lbl.s2}

Your question was: ${question || 'No specific question was entered.'}

The cards suggest that the answer is not simply yes or no. They are describing a process: what you are feeling, what needs to be acknowledged, and what kind of action would keep you aligned. If this is about love, choose honesty over guessing. If this is about work or money, reduce the decision to one practical next step. If this is about your inner state, trust the quiet signal that keeps returning.

## ${lbl.s3}

The central message is to move with emotional intelligence instead of urgency. You do not need to solve the whole future today, but you do need to stop ignoring the part of you that already knows what feels right. Choose one action that makes the situation clearer. A small decision made with calm awareness will help more than a dramatic move made from pressure.

## ${lbl.s4}

1. Write one sentence that names what you truly want from this situation.
2. Take one small action within 24 hours that supports that sentence.`;
    }

    const cardDetails = cards
        .map((card, index) => {
            const label = mode === '3card' ? [pl.past, pl.present, pl.future][index] : pl.today;
            const direction = card.reversed ? pl.reversed : pl.upright;
            const keywords = getCardKeywords(card, lang);
            const theme = getCardTheme(card, lang);
            const tone = card.reversed
                ? '역방향으로 나온 이 카드는 본래의 힘이 아직 자연스럽게 흐르지 못하고 있음을 보여줍니다.'
                : '정방향으로 나온 이 카드는 지금 사용할 수 있는 힘과 가능성이 비교적 분명하게 열려 있음을 보여줍니다.';

            return `### ${label} - **${card.name}** (${direction})

핵심 키워드: ${keywords || theme}

${tone} 이 카드가 건드리는 주제는 **${theme}**입니다. 지금 질문에서 ${card.name} 카드는 겉으로 드러난 사건보다 그 밑에 깔린 마음의 방향을 보라고 말합니다. 누군가와의 관계라면 상대의 말보다 반복되는 태도와 내 감정의 반응을 함께 보아야 합니다. 일이나 돈의 문제라면 당장 큰 결론을 내기보다, 내가 통제할 수 있는 범위와 기다려야 하는 범위를 구분하는 것이 중요합니다. 내면의 문제라면 스스로를 몰아붙이는 방식이 답을 흐리게 만들 수 있으니, 오늘은 판단보다 관찰이 먼저입니다.`;
        })
        .join('\n\n');

    return `## ${lbl.s1}

${cardDetails}

## ${lbl.s2}

질문: ${question || '별도의 질문 없이 오늘의 흐름을 물었습니다.'}

이번 리딩의 핵심은 “감정은 신호이고, 행동은 선택”이라는 메시지입니다. 마음이 흔들릴수록 바로 결론을 내리려 하기 쉽지만, 카드는 먼저 상황을 읽는 감각을 회복하라고 말합니다. 지금 필요한 것은 더 많은 걱정이 아니라 더 선명한 기준입니다. 내가 원하는 것, 상대나 상황이 실제로 보여주는 것, 오늘 현실적으로 할 수 있는 일을 분리해 보면 흐름이 훨씬 또렷해집니다.

## ${lbl.s3}

종합 메시지는 조급함을 내려놓고, 내가 지킬 수 있는 중심을 먼저 세우라는 것입니다. 관계의 문제라면 상대를 바꾸려 하기 전에 내 마음이 원하는 안정감과 존중이 무엇인지 확인하세요. 일의 문제라면 가능성만 보지 말고 시간, 비용, 책임, 반복 가능한 실행까지 함께 보아야 합니다. 마음의 문제라면 지금 느끼는 불안이 예감인지 습관인지 구분하는 시간이 필요합니다. 카드가 말하는 좋은 흐름은 극적인 반전보다, 오늘의 작은 선택이 내일의 불안을 줄이는 방향에 가깝습니다.

## ${lbl.s4}

1. 오늘 안에 할 수 있는 행동을 하나만 정하세요. 연락하기, 정리하기, 확인하기, 쉬기 중 하나면 충분합니다.
2. 결정을 미루고 있다면 “두려워서 미루는 것인지, 정보가 부족해서 기다리는 것인지”를 적어보세요.
3. 마음이 복잡할수록 말과 행동을 크게 만들지 말고, 작고 정확한 선택을 하세요.`;
}

// ── Rate Limiter ──────────────────────────────────────────────
const readLimiter = rateLimit({
    windowMs: 3 * 60 * 1000,
    max: 2,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        const lang = req.body?.lang || 'ko';
        const msgs = {
            ko: '잠시 쉬어가세요 🌙 3분에 2번까지만 카드를 뽑을 수 있어요.',
            en: 'Take a breath 🌙 You can draw cards 2 times per 3 minutes.',
            ja: '少し休みましょう 🌙 3分間に2回までカードを引けます。',
            zh: '休息一下 🌙 每3分钟最多可以抽2次牌。',
        };
        res.status(429).json({ error: msgs[lang] || msgs.ko });
    }
});

// ── Tarot AI Reading ──────────────────────────────────────────
app.post('/api/read', readLimiter, async (req, res) => {
    const { mode, cards, question, lang } = req.body;
    if (!cards || !cards.length) return res.status(400).json({ error: 'cards required' });

    const langName = { ko: '한국어', en: 'English', ja: '日本語', zh: '中文' }[lang] || '한국어';

    const posLabels = {
        ko: { past:'과거', present:'현재', future:'미래', today:'오늘의 카드', upright:'정방향', reversed:'역방향' },
        en: { past:'Past', present:'Present', future:'Future', today:"Today's Card", upright:'Upright', reversed:'Reversed' },
        ja: { past:'過去', present:'現在', future:'未来', today:'今日のカード', upright:'正位置', reversed:'逆位置' },
        zh: { past:'过去', present:'现在', future:'未来', today:'今日牌', upright:'正位', reversed:'逆位' }
    };
    const pl = posLabels[lang] || posLabels.ko;

    let cardLines;
    if (mode === '3card') {
        cardLines = cards.map((c, i) =>
            `${[pl.past, pl.present, pl.future][i]}: ${c.name} (${c.reversed ? pl.reversed : pl.upright})`
        ).join('\n');
    } else {
        cardLines = `${pl.today}: ${cards[0].name} (${cards[0].reversed ? pl.reversed : pl.upright})`;
    }

    const lbl = {
        ko: { s1:'🃏 카드 해석', s2:'🌊 카드의 흐름', s3:'✨ 종합 메시지와 조언', s4:'💡 오늘의 실천 팁' },
        en: { s1:'🃏 Card Reading', s2:'🌊 Flow of the Cards', s3:'✨ Overall Message & Advice', s4:"💡 Today's Action Tip" },
        ja: { s1:'🃏 カード解釈', s2:'🌊 カードの流れ', s3:'✨ 総合メッセージとアドバイス', s4:'💡 今日の実践ヒント' },
        zh: { s1:'🃏 牌面解读', s2:'🌊 牌面流向', s3:'✨ 综合信息与建议', s4:'💡 今日行动小贴士' }
    }[lang] || { s1:'🃏 카드 해석', s2:'🌊 카드의 흐름', s3:'✨ 종합 메시지와 조언', s4:'💡 오늘의 실천 팁' };

    const systemRole = {
        ko: '당신은 30년 경력의 타로 마스터입니다. 라이더-웨이트 덱, 점성술, 카발라, 심리학에 정통합니다. 모든 응답은 반드시 한국어로만 작성하세요.',
        en: 'You are a tarot master with 30 years of experience, expert in Rider-Waite symbolism, astrology, Kabbalah, and psychology. Write ALL responses exclusively in English.',
        ja: 'あなたは30年の経験を持つタロットマスターです。ライダー・ウェイト、占星術、カバラ、心理学の専門家です。すべての回答を必ず日本語のみで記述してください。',
        zh: '您是拥有30年经验的塔罗牌大师，精通莱特-韦特体系、占星术、卡巴拉和心理学。所有回答必须只用中文书写。'
    }[lang] || '당신은 30년 경력의 타로 마스터입니다. 반드시 한국어로만 답하세요.';

    const prompt = `IMPORTANT: Your entire response MUST be written ONLY in ${langName}. Do not use any other language.

---
Question: ${question || '(none)'}
Cards:
${cardLines}
---

Please provide a very detailed and rich tarot reading using the structure below.
Use markdown ## headings for each section and write each section at sufficient length.

## ${lbl.s1}

For EACH card, write at least 5-7 sentences covering:
- Card name in **bold**
- Core symbolism and visual imagery (Rider-Waite deck)
- Specific energy meaning for upright/reversed position
- Concrete message this card brings to the querent's situation
- Insights on love / career / inner growth (whichever is relevant)
- Connected planet, element, or numerology if applicable

## ${lbl.s2}

Describe in 3-5 sentences how the cards tell a story together:
- Energy flow and connections between cards
- Overall narrative arc (past-present-future or today)
- Any special pattern or warning in this combination

## ${lbl.s3}

Write a warm and hopeful overall message in 4-6 sentences:
- Core message from all the cards combined
- At least 2 concrete action steps to take right now
- What to be mindful of / cautions
- Close with encouraging and hopeful words

## ${lbl.s4}

1-2 specific, practical tips to act on today.

---
REMINDER: Write ONLY in ${langName}. Minimum 1500 characters of meaningful content.`;

    const MAX_RETRY = 2;
    let lastErr;

    if (process.env.GEMINI_API_KEY) {
        for (const modelName of GEMINI_MODELS) {
            for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
                try {
                    const model = genAI.getGenerativeModel({
                        model: modelName,
                        systemInstruction: systemRole,
                        generationConfig: { maxOutputTokens: 8192, temperature: 0.9 }
                    });
                    const result = await model.generateContent(prompt);
                    const text = result.response.text();
                    if (text && text.trim()) {
                        return res.json({ success: true, reading: text, model: modelName });
                    }
                    throw new Error('Gemini returned an empty reading');
                } catch (err) {
                    lastErr = err;
                    console.warn(`[AI Read] ${modelName} attempt ${attempt} failed: ${sanitizeGeminiError(err)}`);
                    if (attempt < MAX_RETRY) {
                        await wait(1200);
                    }
                }
            }
        }
    } else {
        lastErr = new Error('GEMINI_API_KEY is missing');
        console.warn('[AI Read] GEMINI_API_KEY is missing. Using fallback reading.');
    }

    console.warn(`[AI Read] using fallback reading: ${sanitizeGeminiError(lastErr)}`);
    return res.json({
        success: true,
        fallback: true,
        reading: createFallbackReading({ mode, cards, question, lang, pl, lbl })
    });
});

// ── SPA fallback ──────────────────────────────────────────────
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

app.listen(PORT, () => console.log(`🔮 KTarot running → http://localhost:${PORT}`));
