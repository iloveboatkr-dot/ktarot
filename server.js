'use strict';
// DNS 우회 (공유기가 SRV 쿼리 차단 방지)
require('dns').setServers(['8.8.8.8', '8.8.4.4']);
require('dotenv').config();

const express        = require('express');
const path           = require('path');
const session        = require('express-session');
const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose       = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const rateLimit      = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── MongoDB 연결 ───────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('🍃 MongoDB 연결 성공'))
  .catch(err => console.error('❌ MongoDB 연결 실패:', err.message));

// ── User 모델 ─────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  googleId:  { type: String, required: true, unique: true },
  name:      String,
  email:     String,
  avatar:    String,
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now },
});
const User = mongoose.model('User', userSchema);

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'ktarot-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7일
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'www')));

// ── Passport Google OAuth ─────────────────────────────────────
passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.CALLBACK_URL,
}, async (_accessToken, _refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ googleId: profile.id });
    if (user) {
      // 기존 유저 → 마지막 로그인 업데이트
      user.lastLogin = new Date();
      await user.save();
    } else {
      // 신규 유저 → DB에 저장 (자동 가입)
      user = await User.create({
        googleId: profile.id,
        name:     profile.displayName,
        email:    profile.emails?.[0]?.value || '',
        avatar:   profile.photos?.[0]?.value || '',
      });
      console.log(`✨ 신규 가입: ${user.name} (${user.email})`);
    }
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done)   => done(null, user._id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// ── Gemini AI ─────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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

// ── Auth Routes ───────────────────────────────────────────────
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// 현재 유저 정보 API
app.get('/api/me', (req, res) => {
  if (!req.isAuthenticated()) return res.json({ loggedIn: false });
  res.json({
    loggedIn: true,
    name:   req.user.name,
    email:  req.user.email,
    avatar: req.user.avatar,
  });
});

// ── Auth Middleware ───────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  const lang = req.body?.lang || 'ko';
  const msgs = {
    ko: '타로 리딩은 회원만 이용할 수 있어요. Google 로그인 후 이용해 주세요 🔮',
    en: 'Tarot reading is available for members only. Please sign in with Google 🔮',
    ja: 'タロット占いは会員限定です。Googleでサインインしてください 🔮',
    zh: '塔罗解读仅限会员使用。请用Google登录 🔮',
  };
  return res.status(401).json({ error: msgs[lang] || msgs.ko });
}

// ── Tarot AI Reading ──────────────────────────────────────────
app.post('/api/read', requireAuth, readLimiter, async (req, res) => {
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
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
        try {
            const model = genAI.getGenerativeModel({
                model: 'gemini-2.5-flash',
                systemInstruction: systemRole,
                generationConfig: { maxOutputTokens: 8192, temperature: 0.9 }
            });
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            return res.json({ success: true, reading: text });
        } catch (err) {
            lastErr = err;
            const is500 = err.message?.includes('500') || err.message?.includes('Internal Server Error');
            console.warn(`[AI Read] attempt ${attempt} failed: ${err.message}`);
            if (is500 && attempt < MAX_RETRY) {
                await new Promise(r => setTimeout(r, 1500));
                continue;
            }
            break;
        }
    }
    const errMsgs = {
        ko: '카드 해석 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요 🌙',
        en: 'An error occurred during reading. Please try again in a moment 🌙',
        ja: '解読中にエラーが発生しました。しばらくしてからもう一度お試しください 🌙',
        zh: '解读过程中出现错误，请稍后再试 🌙',
    };
    res.status(500).json({ error: errMsgs[lang] || errMsgs.ko });
});

// ── SPA fallback ──────────────────────────────────────────────
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'www', 'index.html'));
});

app.listen(PORT, () => console.log(`🔮 KTarot running → http://localhost:${PORT}`));
