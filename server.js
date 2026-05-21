'use strict';
// DNS 우회 (공유기가 SRV 쿼리 차단 방지)
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();

const express        = require('express');
const path           = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit      = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
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

function createFallbackReading({ mode, cards, question, lang, pl, lbl }) {
    if (lang !== 'ko') {
        const cardSummary = cards
            .map((card, index) => {
                const label = mode === '3card' ? [pl.past, pl.present, pl.future][index] : pl.today;
                return `- **${label}: ${card.name}** (${card.reversed ? pl.reversed : pl.upright})`;
            })
            .join('\n');

        return `## ${lbl.s1}

${cardSummary}

The AI reading service is temporarily unavailable, so this is a concise backup reading based on the selected cards. Treat the card as a mirror rather than a fixed prediction. If the card is upright, its energy is easier to express today; if reversed, the same lesson may need patience, honesty, and a slower pace.

## ${lbl.s2}

Your question was: ${question || 'No specific question was entered.'}

The cards suggest that today is asking you to pause, notice what your intuition already knows, and choose one practical next step instead of forcing a perfect answer.

## ${lbl.s3}

Move gently, but do not ignore what you feel. A small decision made with clarity is more useful than a large decision made from anxiety.

## ${lbl.s4}

Write down one thing you can do within the next 24 hours, and do only that first.`;
    }

    const cardDetails = cards
        .map((card, index) => {
            const label = mode === '3card' ? [pl.past, pl.present, pl.future][index] : pl.today;
            const direction = card.reversed ? pl.reversed : pl.upright;
            const tone = card.reversed
                ? '이 카드는 에너지가 막혀 있거나 아직 마음속에서 정리되지 않은 부분을 보여줍니다.'
                : '이 카드는 지금 자연스럽게 흘러나오는 힘과 가능성을 보여줍니다.';

            return `**${label} - ${card.name} (${direction})**

${tone} 지금의 질문에서 중요한 것은 서두르는 결론보다 내 마음이 어떤 방향을 가리키는지 차분히 확인하는 것입니다. ${card.name} 카드는 감정, 선택, 관계, 일의 흐름 중에서 이미 알고 있었지만 미뤄둔 신호를 다시 보라고 말합니다. 오늘은 큰 결정을 억지로 밀어붙이기보다, 작은 행동 하나를 통해 상황을 확인하는 편이 좋습니다.`;
        })
        .join('\n\n');

    return `## ${lbl.s1}

${cardDetails}

## ${lbl.s2}

질문: ${question || '별도의 질문 없이 오늘의 흐름을 물었습니다.'}

이번 카드의 흐름은 “지금 내가 통제하려는 것”과 “조용히 받아들여야 하는 것”을 구분하라는 메시지에 가깝습니다. 상황이 바로 움직이지 않더라도, 오늘의 작은 판단과 태도가 다음 흐름을 만듭니다. 특히 마음이 급해질수록 처음 질문으로 돌아가서 정말 원하는 결과가 무엇인지 확인해 보세요.

## ${lbl.s3}

오늘의 조언은 단순합니다. 완벽한 답을 찾으려 하기보다 지금 할 수 있는 가장 현실적인 행동을 하나 고르세요. 관계의 문제라면 먼저 듣고, 일의 문제라면 우선순위를 줄이고, 마음의 문제라면 스스로를 몰아붙이는 말을 멈추는 것이 좋습니다. 카드는 미래를 고정하지 않습니다. 대신 지금 선택할 수 있는 태도와 방향을 비춰줍니다.

## ${lbl.s4}

1. 오늘 안에 할 수 있는 작은 행동 하나를 정하고 바로 실행해 보세요.
2. 결정을 미루고 있다면, 두려움 때문인지 준비가 더 필요한 것인지 조용히 구분해 보세요.

_AI 해석 서버가 잠시 불안정해서 기본 카드 해석으로 안내했어요. 잠시 후 다시 뽑으면 더 자세한 AI 리딩을 받을 수 있습니다._`;
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
                    console.warn(`[AI Read] ${modelName} attempt ${attempt} failed: ${err.message}`);
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

    console.warn(`[AI Read] using fallback reading: ${lastErr?.message || 'unknown error'}`);
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
