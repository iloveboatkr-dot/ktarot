// ── i18n ────────────────────────────────────────────────────────
const I18N = {
  ko: {
    subtitle: '별빛이 당신의 길을 안내합니다',
    mode1: '오늘의 카드', mode1d: '오늘 하루를 위한 한 장의 카드',
    mode3: '과거·현재·미래', mode3d: '세 장의 카드로 흐름을 읽다',
    qLabel: '질문을 입력해주세요 *',
    qPh: '마음속 질문을 적어주세요...',
    qRequired: '타로를 뽑기 전에 질문을 입력해 주세요!',
    drawBtn: '🔮 카드 뽑기',
    readingTitle: 'AI 타로 해석',
    loading: '카드를 읽는 중...',
    again: '↺ 다시 뽑기',
    copy: '📋 결과 복사', copied: '✅ 복사됨!', copyFail: '❌ 복사 실패',
    past: '과거', present: '현재', future: '미래',
    today: '오늘의 카드',
    upright: '정방향', reversed: '역방향',
    clickCard: '카드를 클릭하세요',
    loginRequired: '로그인 후 타로를 이용하실 수 있습니다',
    loginDesc: '구글 계정으로 로그인하면 AI 타로 리딩을 무료로 이용할 수 있어요.',
    loginBtn: 'Google로 로그인',
  },
  en: {
    subtitle: 'Let the stars illuminate your path',
    mode1: "Today's Card", mode1d: 'One card for your day',
    mode3: 'Past · Present · Future', mode3d: 'Read the flow through three cards',
    qLabel: 'Your question *',
    qPh: 'What is on your mind?',
    qRequired: 'Please enter your question before drawing cards!',
    drawBtn: '🔮 Draw Cards',
    readingTitle: 'AI Tarot Reading',
    loading: 'Reading the cards...',
    again: '↺ Draw Again',
    copy: '📋 Copy Result', copied: '✅ Copied!', copyFail: '❌ Copy Failed',
    past: 'Past', present: 'Present', future: 'Future',
    today: "Today's Card",
    upright: 'Upright', reversed: 'Reversed',
    clickCard: 'Click the cards',
    loginRequired: 'Sign in to use Tarot Reading',
    loginDesc: 'Log in with your Google account to access free AI Tarot readings.',
    loginBtn: 'Sign in with Google',
  },
  ja: {
    subtitle: '星々があなたの道を照らします',
    mode1: '今日のカード', mode1d: '今日のための一枚のカード',
    mode3: '過去・現在・未来', mode3d: '三枚で流れを読む',
    qLabel: '質問を入力してください *',
    qPh: 'ここに質問を入力...',
    qRequired: 'カードを引く前に質問を入力してください！',
    drawBtn: '🔮 カードを引く',
    readingTitle: 'AI タロット占い',
    loading: 'カードを読んでいます...',
    again: '↺ もう一度',
    copy: '📋 結果をコピー', copied: '✅ コピーしました!', copyFail: '❌ コピー失敗',
    past: '過去', present: '現在', future: '未来',
    today: '今日のカード',
    upright: '正位置', reversed: '逆位置',
    clickCard: 'カードをクリック',
    loginRequired: 'タロットを利用するにはログインが必要です',
    loginDesc: 'Googleアカウントでログインして、AIタロット占いを無料でご利用ください。',
    loginBtn: 'Googleでログイン',
  },
  zh: {
    subtitle: '让星光照亮您的道路',
    mode1: '今日牌', mode1d: '为您今天抽一张牌',
    mode3: '过去·现在·未来', mode3d: '三张牌读懂命运流向',
    qLabel: '请输入您的问题 *',
    qPh: '您心中在想什么？',
    qRequired: '抽牌前请先输入您的问题！',
    drawBtn: '🔮 抽牌',
    readingTitle: 'AI 塔罗解读',
    loading: '正在解读牌意...',
    again: '↺ 再次抽牌',
    copy: '📋 复制结果', copied: '✅ 已复制!', copyFail: '❌ 复制失败',
    past: '过去', present: '现在', future: '未来',
    today: '今日牌',
    upright: '正位', reversed: '逆位',
    clickCard: '点击牌面',
    loginRequired: '请登录后使用塔罗牌解读',
    loginDesc: '使用Google账号登录，即可免费体验AI塔罗解读。',
    loginBtn: '用Google登录',
  },
};

// ── State ─────────────────────────────────────────────────────
let lang = 'ko';
let mode = '1card';
let drawnCards = [];
let revealedCount = 0;
let currentUser = null; // 로그인 상태 (비회원: null)

// ── Client-side rate limit (mirrors server: 2회/3분) ──────────
const CL_MAX    = 2;
const CL_WINDOW = 3 * 60 * 1000; // 3분

function clGetReqs() {
  try {
    const saved = JSON.parse(localStorage.getItem('kt_reqs') || '[]');
    const now = Date.now();
    return saved.filter(ts => now - ts < CL_WINDOW);
  } catch { return []; }
}
function clCanDraw() { return clGetReqs().length < CL_MAX; }
function clRecord()  {
  const reqs = clGetReqs();
  reqs.push(Date.now());
  try { localStorage.setItem('kt_reqs', JSON.stringify(reqs)); } catch {}
}
function clRemainSec() {
  const reqs = clGetReqs();
  if (reqs.length === 0) return 0;
  const oldest = Math.min(...reqs);
  return Math.max(0, Math.ceil((oldest + CL_WINDOW - Date.now()) / 1000));
}

// ── DOM refs ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const heroSub = $('hero-sub');
const mode1Card = $('mode-1card');
const mode3Card = $('mode-3card');
const mode1Title = $('mode-1-title');
const mode1Desc = $('mode-1-desc');
const mode3Title = $('mode-3-title');
const mode3Desc = $('mode-3-desc');
const qLabel = $('q-label');
const qInput = $('q-input');
const btnDraw = $('btn-draw');
const stage = $('stage');
const resultWrap = $('result-wrap');
const resultTitle = $('result-title');
const resultCards = $('result-cards');
const reportBox = $('report-box');
const aiReport = $('ai-report');
const loadingEl = $('loading');
const btnAgain = $('btn-again');
const btnCopy = $('btn-copy');

// ── i18n apply ────────────────────────────────────────────────
function applyLang() {
  const t = I18N[lang];
  heroSub.textContent = t.subtitle;
  mode1Title.textContent = t.mode1;
  mode1Desc.textContent = t.mode1d;
  mode3Title.textContent = t.mode3;
  mode3Desc.textContent = t.mode3d;
  qLabel.textContent = t.qLabel;
  qInput.placeholder = t.qPh;
  btnDraw.textContent = t.drawBtn;
  resultTitle.textContent = t.readingTitle;
  btnAgain.textContent = t.again;
  btnCopy.textContent = t.copy;
  document.querySelectorAll('.lang-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
}

document.querySelectorAll('.lang-btn').forEach(b => {
  b.addEventListener('click', () => { lang = b.dataset.lang; applyLang(); });
});

// ── Mode selection ────────────────────────────────────────────
mode1Card.addEventListener('click', () => { mode = '1card'; mode1Card.classList.add('active'); mode3Card.classList.remove('active'); });
mode3Card.addEventListener('click', () => { mode = '3card'; mode3Card.classList.add('active'); mode1Card.classList.remove('active'); });

// ── Draw ──────────────────────────────────────────────────────
btnDraw.addEventListener('click', drawCards);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCards() {
  // 로그인 체크 — 비회원 차단
  if (!currentUser) {
    showLoginRequired();
    return;
  }

  // 버튼 잠금 중이면 실행 차단
  if (btnDraw.disabled) return;

  // 클라이언트 rate limit 체크 → 카드 뽑기 전에 막기
  if (!clCanDraw()) {
    const remain = clRemainSec();
    const m = Math.floor(remain / 60);
    const s = String(remain % 60).padStart(2, '0');
    const msg = I18N[lang].qRequired
      ? (I18N[lang].rateMsg || `잠시 쉬어가세요 🌙 3분에 2번까지만 카드를 뽑을 수 있어요.`)
      : `잠시 쉬어가세요 🌙 3분에 2번까지만 카드를 뽑을 수 있어요.`;

    // 메시지 표시
    resultWrap.classList.add('visible');
    reportBox.style.display = 'block';
    aiReport.innerHTML = `<div style="text-align:center;padding:20px;font-size:1.1rem;color:#c8a8ff">${I18N[lang].rateMsg || msg}</div>`;
    btnAgain.style.display = 'inline-block';

    // 버튼 잠금
    btnDraw.disabled = true;
    btnDraw.textContent = `🌙 ${m}:${s}`;
    let t = remain;
    const lockTimer = setInterval(() => {
      t--;
      const mm = Math.floor(t / 60);
      const ss = String(t % 60).padStart(2, '0');
      btnDraw.textContent = `🌙 ${mm}:${ss}`;
      if (t <= 0) {
        clearInterval(lockTimer);
        btnDraw.disabled = false;
        btnDraw.textContent = I18N[lang].drawBtn;
      }
    }, 1000);
    return;
  }

  const question = qInput.value.trim();
  if (!question) {
    qInput.classList.add('shake');
    qInput.focus();
    const prev = qInput.placeholder;
    qInput.placeholder = I18N[lang].qRequired;
    setTimeout(() => {
      qInput.classList.remove('shake');
      qInput.placeholder = prev;
    }, 700);
    return;
  }
  const count = mode === '3card' ? 3 : 1;
  const shuffled = shuffle(TAROT_CARDS);
  drawnCards = shuffled.slice(0, count).map(c => ({
    ...c,
    reversed: Math.random() < 0.3
  }));
  revealedCount = 0;
  renderStage();
  resultWrap.classList.remove('visible');
  aiReport.innerHTML = '';
  reportBox.style.display = 'none';
}

// ── Render stage ──────────────────────────────────────────────
function renderStage() {
  const t = I18N[lang];
  const positions = mode === '3card'
    ? [t.past, t.present, t.future]
    : [t.today];

  stage.innerHTML = '';

  drawnCards.forEach((card, i) => {
    const slot = document.createElement('div');
    slot.className = 'card-slot';
    slot.dataset.index = i;

    const label = document.createElement('div');
    label.className = 'card-label';
    label.textContent = positions[i];

    const flip = document.createElement('div');
    flip.className = 'flip-card';
    flip.innerHTML = `
      <div class="flip-inner">
        <div class="card-back"></div>
        <div class="card-face" id="face-${i}"></div>
      </div>`;

    const info = document.createElement('div');
    info.className = 'card-info';
    info.innerHTML = `
      <div class="ci-name">${card.name[lang]}</div>
      <div class="ci-dir">${card.reversed ? t.reversed : t.upright}</div>
      <div class="ci-keys">${card.keywords[lang]}</div>`;

    slot.appendChild(label);
    slot.appendChild(flip);
    slot.appendChild(info);
    stage.appendChild(slot);

    // Animate in with delay
    setTimeout(() => {
      flip.addEventListener('click', () => revealCard(i), { once: true });
      // Auto reveal after slight delay for 1-card mode feel
      if (mode === '1card') {
        setTimeout(() => revealCard(0), 500);
      }
    }, i * 200);
  });
}

function revealCard(i) {
  const slot = stage.querySelector(`[data-index="${i}"]`);
  const flip = slot.querySelector('.flip-card');
  if (flip.classList.contains('flipped') || flip.classList.contains('reversed')) return;

  // Build face content
  const card = drawnCards[i];
  const face = document.getElementById(`face-${i}`);
  const imgPath = `images/${card.id}.png`;

  const img = new Image();
  img.onload = () => {
    // CSS .reversed 클래스가 rotateZ(180deg)로 카드를 뒤집음 — 이미지엔 별도 스타일 불필요
    face.innerHTML = `<img src="${imgPath}" alt="${card.name[lang]}">`;
    doFlip();
  };
  img.onerror = () => {
    face.className = 'card-face no-img';
    face.innerHTML = `<div class="card-name">${card.name[lang]}</div><div class="card-keys">${card.keywords[lang]}</div>`;
    doFlip();
  };
  img.src = imgPath;

  function doFlip() {
    flip.classList.add(card.reversed ? 'reversed' : 'flipped');
    slot.classList.add('revealed');
    revealedCount++;
    if (revealedCount === drawnCards.length) {
      setTimeout(fetchReading, 600);
    }
  }
}

// ── AI Reading ────────────────────────────────────────────────
async function fetchReading() {
  const t = I18N[lang];
  const positions = mode === '3card'
    ? [t.past, t.present, t.future]
    : [t.today];

  // Show result wrap + result cards
  resultWrap.classList.add('visible');
  resultCards.innerHTML = '';
  drawnCards.forEach((card, i) => {
    const rotate = card.reversed ? 'transform:rotate(180deg);' : '';
    resultCards.innerHTML += `
      <div class="result-card-item">
        <div class="result-card-pos">${positions[i]}</div>
        <div class="result-card-img" style="background-image:url('images/${card.id}.png');${rotate}"></div>
        <div class="result-card-name">${card.name[lang]}</div>
        <div class="result-card-dir">${card.reversed ? t.reversed : t.upright}</div>
      </div>`;
  });

  loadingEl.style.display = 'flex';
  reportBox.style.display = 'none';
  aiReport.innerHTML = '';
  btnAgain.style.display = 'none';
  btnCopy.style.display = 'none';

  // AI 읽는 동안 카드뽑기 비활성화
  btnDraw.disabled = true;
  btnDraw.textContent = '🔮 읽는 중...';

  try {
    const res = await fetch('/api/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        cards: drawnCards.map(c => ({ name: c.name[lang], reversed: c.reversed })),
        question: qInput.value.trim(),
        lang,
      }),
    });
    const data = await res.json();
    loadingEl.style.display = 'none';
    reportBox.style.display = 'block';
    if (data.success) {
      if (typeof marked !== 'undefined') {
        aiReport.innerHTML = marked.parse(data.reading);
      } else {
        aiReport.innerHTML = data.reading.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
      }
      // 읽기 완료 → 카운터 기록 + 버튼 즉시 복구
      clRecord();
      btnDraw.disabled = false;
      btnDraw.textContent = I18N[lang].drawBtn;
    } else {
      // 429 Rate Limit: 메시지 표시 + 버튼 잠금 카운트다운
      aiReport.innerHTML = `<div style="text-align:center;padding:20px;font-size:1.1rem;color:#c8a8ff">${data.error || 'Error'}</div>`;

      const resetHeader = res.headers.get('RateLimit-Reset');
      const remainSec = resetHeader
        ? Math.max(1, Math.ceil(parseInt(resetHeader) - Date.now() / 1000))
        : 300; // 기본 5분 대기

      btnDraw.disabled = true;
      btnDraw.textContent = `🌙 ${Math.floor(remainSec/60)}:${String(remainSec%60).padStart(2,'0')}`;
      let t = remainSec;
      const lockTimer = setInterval(() => {
        t--;
        const m = Math.floor(t / 60);
        const s = String(t % 60).padStart(2, '0');
        btnDraw.textContent = `🌙 ${m}:${s}`;
        if (t <= 0) {
          clearInterval(lockTimer);
          btnDraw.disabled = false;
          btnDraw.textContent = I18N[lang].drawBtn;
        }
      }, 1000);
    }
  } catch (e) {
    console.error('[fetchReading error]', e);
    loadingEl.style.display = 'none';
    reportBox.style.display = 'block';
    // 에러 종류에 따라 적절한 메시지 표시
    const errMsg = e instanceof SyntaxError
      ? '서버 응답 파싱 오류. 다시 시도해주세요.'
      : '연결 오류. 네트워크를 확인하거나 다시 시도해주세요.';
    aiReport.innerHTML = `<div style="text-align:center;padding:20px;font-size:1rem;color:#ff8888">❌ ${errMsg}<br><small style="opacity:.5">${e.message}</small></div>`;
    btnDraw.disabled = false;
    btnDraw.textContent = I18N[lang].drawBtn;
  }
  btnAgain.style.display = 'inline-block';
  btnCopy.style.display = 'inline-block';
}

// ── Copy result ───────────────────────────────────────────────
btnCopy.addEventListener('click', () => {
  const t = I18N[lang];
  const text = aiReport.innerText;
  navigator.clipboard.writeText(text).then(() => {
    btnCopy.textContent = t.copied;
    setTimeout(() => { btnCopy.textContent = t.copy; }, 2000);
  }).catch(() => {
    btnCopy.textContent = t.copyFail;
    setTimeout(() => { btnCopy.textContent = t.copy; }, 2000);
  });
});

// ── Again ─────────────────────────────────────────────────────
btnAgain.addEventListener('click', () => {
  // 잠금 중이면 결과창만 닫고 카드 초기화 안 함
  resultWrap.classList.remove('visible');
  resultCards.innerHTML = '';
  reportBox.style.display = 'none';
  aiReport.innerHTML = '';
  stage.innerHTML = '';
  qInput.value = '';
  btnAgain.style.display = 'none';
  btnCopy.style.display = 'none';
});

// ── Stars canvas ──────────────────────────────────────────────
(function stars() {
  const canvas = $('stars-canvas');
  const ctx = canvas.getContext('2d');
  let dots = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    dots = Array.from({ length: 150 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + .3,
      a: Math.random(),
      da: (Math.random() * .01 + .002) * (Math.random() < .5 ? 1 : -1),
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const d of dots) {
      d.a += d.da;
      if (d.a > 1 || d.a < 0) d.da *= -1;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,180,255,${d.a})`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', resize);
  resize(); draw();
})();

// ── Again ─────────────────────────────────────────────────────
btnAgain.addEventListener('click', () => {
  // 쿨다운 취소
  if (cooldownTimer) { clearTimeout(cooldownTimer); cooldownTimer = null; }
  btnDraw.disabled = false;
  btnDraw.textContent = I18N[lang].drawBtn;
  // 결과 초기화
  resultWrap.classList.remove('visible');
  resultCards.innerHTML = '';
  reportBox.style.display = 'none';
  aiReport.innerHTML = '';
  stage.innerHTML = '';
  qInput.value = '';
  btnAgain.style.display = 'none';
  btnCopy.style.display  = 'none';
});

// ── Logo → Home ───────────────────────────────────────────────
document.getElementById('logo').addEventListener('click', () => {
  // 결과 초기화
  resultWrap.classList.remove('visible');
  resultCards.innerHTML = '';
  reportBox.style.display = 'none';
  aiReport.innerHTML = '';
  btnAgain.style.display = 'none';
  btnCopy.style.display = 'none';
  // 스테이지 초기화
  stage.innerHTML = '';
  qInput.value = '';
  drawnCards = [];
  revealedCount = 0;
  // 맨 위로 스크롤
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Init
applyLang();

// ── Google 로그인 상태 & 접근 제어 ───────────────────────────
const authArea = document.getElementById('auth-area');

// 타로 UI 요소 모음
const tarotUI = document.querySelector('.modes');
const questionWrap = document.querySelector('.question-wrap');
const drawBtnWrap = document.getElementById('btn-draw');

// 로그인 필요 화면
function showLoginRequired() {
  const t = I18N[lang];
  // 타로 UI 숨기기
  tarotUI.style.display = 'none';
  questionWrap.style.display = 'none';
  drawBtnWrap.style.display = 'none';
  stage.innerHTML = '';
  resultWrap.classList.remove('visible');

  // 로그인 유도 박스 삽입 (없으면)
  if (!document.getElementById('login-gate')) {
    const gate = document.createElement('div');
    gate.id = 'login-gate';
    gate.innerHTML = `
      <div class="login-gate-box">
        <div class="login-gate-orb">🔮</div>
        <h2 class="login-gate-title" id="lg-title">${t.loginRequired}</h2>
        <p class="login-gate-desc" id="lg-desc">${t.loginDesc}</p>
        <a href="/auth/google" class="btn-google-lg" id="lg-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span id="lg-btn-text">${t.loginBtn}</span>
        </a>
      </div>`;
    // 모드 카드 바로 아래 삽입
    tarotUI.insertAdjacentElement('afterend', gate);
  }
}

// 언어 변경 시 로그인 게이트 텍스트도 업데이트
const origApplyLang = applyLang;
applyLang = function() {
  origApplyLang();
  const t = I18N[lang];
  const lgTitle = document.getElementById('lg-title');
  const lgDesc  = document.getElementById('lg-desc');
  const lgBtn   = document.getElementById('lg-btn-text');
  if (lgTitle) lgTitle.textContent = t.loginRequired;
  if (lgDesc)  lgDesc.textContent  = t.loginDesc;
  if (lgBtn)   lgBtn.textContent   = t.loginBtn;
};

// 타로 UI 표시 (로그인 후)
function showTarotUI() {
  tarotUI.style.display = '';
  questionWrap.style.display = '';
  drawBtnWrap.style.display = '';
  const gate = document.getElementById('login-gate');
  if (gate) gate.remove();
}

fetch('/api/me')
  .then(r => r.json())
  .then(user => {
    if (user.loggedIn) {
      currentUser = user; // 로그인 상태 저장
      // 헤더: 클릭 가능한 아바타 + 이름만 표시
      authArea.innerHTML = `
        <div class="user-badge" id="profile-trigger" onclick="toggleProfilePanel()" title="프로필 보기">
          <img src="${user.avatar}" alt="${user.name}" class="user-avatar" onerror="this.style.display='none'">
          <span class="user-name">${user.name}</span>
          <span class="profile-chevron">▾</span>
        </div>`;
      showTarotUI();
      injectProfilePanel(user);
      injectWithdrawModal();
    } else {
      // 헤더 로그인 버튼
      authArea.innerHTML = `
        <a href="/auth/google" class="btn-google-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google 로그인
        </a>`;
      showLoginRequired();
    }
  })
  .catch(() => {
    // 네트워크 오류 시 안전하게 로그인 요구
    showLoginRequired();
  });

// ── 프로필 드롭다운 패널 ──────────────────────────────────────
function injectProfilePanel(user) {
  if (document.getElementById('profile-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'profile-panel';
  panel.innerHTML = `
    <div class="pp-avatar-wrap">
      <img src="${user.avatar}" alt="${user.name}" class="pp-avatar" onerror="this.style.display='none'">
      <div class="pp-google-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Google 계정
      </div>
    </div>
    <div class="pp-name">${user.name}</div>
    <div class="pp-email">${user.email}</div>
    <div class="pp-divider"></div>
    <a href="/logout" class="pp-btn-logout">
      <span>🚪</span> 로그아웃
    </a>
    <button class="pp-btn-withdraw" onclick="hideProfilePanel(); showWithdrawModal();">
      <span>⚠️</span> 회원탈퇴
    </button>`;
  // 헤더 auth-area 바로 아래에 삽입
  document.getElementById('auth-area').style.position = 'relative';
  document.getElementById('auth-area').appendChild(panel);

  // 외부 클릭 시 닫기
  document.addEventListener('click', (e) => {
    const trigger = document.getElementById('profile-trigger');
    const pp = document.getElementById('profile-panel');
    if (pp && trigger && !trigger.contains(e.target) && !pp.contains(e.target)) {
      hideProfilePanel();
    }
  });
}

function toggleProfilePanel() {
  const panel = document.getElementById('profile-panel');
  const chevron = document.querySelector('.profile-chevron');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (chevron) chevron.textContent = isOpen ? '▴' : '▾';
}

function hideProfilePanel() {
  const panel = document.getElementById('profile-panel');
  const chevron = document.querySelector('.profile-chevron');
  if (panel) panel.classList.remove('open');
  if (chevron) chevron.textContent = '▾';
}

// ── 회원탈퇴 모달 ─────────────────────────────────────────────
function injectWithdrawModal() {
  if (document.getElementById('withdraw-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'withdraw-modal';
  modal.innerHTML = `
    <div class="wm-backdrop" onclick="hideWithdrawModal()"></div>
    <div class="wm-box">
      <div class="wm-icon">⚠️</div>
      <h3 class="wm-title">정말 탈퇴하시겠어요?</h3>
      <p class="wm-desc">
        탈퇴하면 계정 정보가 <strong>완전히 삭제</strong>되며<br>
        복구할 수 없습니다.
      </p>
      <div class="wm-btns">
        <button class="wm-btn-cancel" onclick="hideWithdrawModal()">취소</button>
        <button class="wm-btn-confirm" onclick="deleteAccount()">탈퇴하기</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function showWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (modal) modal.classList.add('visible');
}

function hideWithdrawModal() {
  const modal = document.getElementById('withdraw-modal');
  if (modal) modal.classList.remove('visible');
}

async function deleteAccount() {
  const confirmBtn = document.querySelector('.wm-btn-confirm');
  const cancelBtn  = document.querySelector('.wm-btn-cancel');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '처리 중...'; }
  if (cancelBtn)  { cancelBtn.style.display = 'none'; }

  try {
    const res  = await fetch('/api/delete-account', { method: 'DELETE' });
    const data = await res.json();

    if (data.success) {
      // ── 탈퇴 완료 화면으로 모달 내용 교체 ──
      const box = document.querySelector('.wm-box');
      if (box) {
        box.innerHTML = `
          <div class="wm-success-icon">✅</div>
          <h3 class="wm-title" style="color:#88ffaa">탈퇴가 완료되었습니다</h3>
          <p class="wm-desc">
            계정 정보가 <strong style="color:#aaffcc">완전히 삭제</strong>되었습니다.<br>
            KTarot를 이용해 주셔서 감사합니다 🔮
          </p>
          <p class="wm-countdown" id="wm-count">3초 후 자동으로 이동합니다...</p>`;
      }
      // 3초 카운트다운 후 이동
      let sec = 3;
      const timer = setInterval(() => {
        sec--;
        const el = document.getElementById('wm-count');
        if (el) el.textContent = `${sec}초 후 자동으로 이동합니다...`;
        if (sec <= 0) {
          clearInterval(timer);
          window.location.href = '/';
        }
      }, 1000);

    } else {
      alert(data.error || '탈퇴 처리 중 오류가 발생했습니다.');
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '탈퇴하기'; }
      if (cancelBtn)  { cancelBtn.style.display = ''; }
    }
  } catch (e) {
    alert('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '탈퇴하기'; }
    if (cancelBtn)  { cancelBtn.style.display = ''; }
  }
}
