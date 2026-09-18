(function () {
  'use strict';

  const content = window.PVP_CONTENT || {};
  const articles = Array.isArray(content.articles) ? content.articles : [];
  const catalog = window.PVP_CATALOG || {};
  const glossary = Array.isArray(window.PVP_GLOSSARY) ? window.PVP_GLOSSARY : [];
  const posters = window.PVP_POSTERS || {};
  const bySlug = new Map(articles.map((article) => [article.slug, article]));
  const main = document.getElementById('main-content');
  const searchDialog = document.getElementById('search-dialog');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const mediaDialog = document.getElementById('media-dialog');
  const mediaViewer = document.getElementById('media-viewer');
  const mediaCaption = document.getElementById('media-caption');
  const progressKey = 'block-combat-read';
  const savedKey = 'block-combat-saved';
  const themeKey = 'block-combat-theme';
  const languageKey = 'block-combat-language';
  let selectedSearchIndex = 0;
  let lastSearchResults = [];
  let toastTimer;

  const labels = {
    sword: { name: '검 PvP', icon: '⚔', description: '기본 공격부터 콤보, 방어와 고급 기술까지 검 전투를 단계별로 익힙니다.' },
    science: { name: '전투 과학', icon: '⌁', description: '피해 계산, 장비, 상태 효과, 이동과 설정을 수치와 원리로 이해합니다.' }
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function meta(article) {
    return catalog[article.slug] || {
      title: article.channel,
      eyebrow: article.category === 'sword' ? '검 전투' : '전투 과학',
      description: '제공된 PvP 자료를 정리한 문서입니다.',
      level: '참고', order: 0, tags: [], takeaways: []
    };
  }

  function sorted(category) {
    return articles.filter((article) => !category || article.category === category)
      .sort((a, b) => (meta(a).order || 0) - (meta(b).order || 0));
  }

  function readSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
    catch (error) { return new Set(); }
  }

  function writeSet(key, values) {
    localStorage.setItem(key, JSON.stringify(Array.from(values)));
    updateSidebar();
  }

  function getRead() { return readSet(progressKey); }
  function getSaved() { return readSet(savedKey); }

  function updateSidebar() {
    const read = getRead();
    const saved = getSaved();
    const total = articles.length;
    const percent = total ? Math.round(read.size / total * 100) : 0;
    const nodes = {
      percent: document.getElementById('progress-percent'),
      bar: document.getElementById('learning-progress-bar'),
      progress: document.getElementById('learning-progress'),
      copy: document.getElementById('progress-copy'),
      sword: document.getElementById('sword-nav-count'),
      science: document.getElementById('science-nav-count'),
      saved: document.getElementById('saved-count')
    };
    if (nodes.percent) nodes.percent.textContent = percent + '%';
    if (nodes.bar) nodes.bar.style.width = percent + '%';
    if (nodes.progress) nodes.progress.setAttribute('aria-valuenow', String(percent));
    if (nodes.copy) nodes.copy.textContent = read.size ? `${total}개 중 ${read.size}개 문서를 읽었습니다.` : '읽은 문서가 아직 없습니다.';
    if (nodes.sword) nodes.sword.textContent = `${sorted('sword').length}개 문서`;
    if (nodes.science) nodes.science.textContent = `${sorted('science').length}개 문서`;
    if (nodes.saved) nodes.saved.textContent = saved.size ? String(saved.size) : '';
  }

  function categoryPill(article) {
    return `<span class="category-pill ${article.category}">${escapeHtml(labels[article.category].name)}</span>`;
  }

  function categoryCard(article) {
    const item = meta(article);
    const read = getRead().has(article.slug);
    return `<a class="category-guide" data-category="${article.category}" data-level="${escapeHtml(item.level)}" href="#guide/${article.slug}">
      <span class="guide-order">${String((item.order || 0) + 1).padStart(2, '0')}</span>
      <span><span class="card-kicker">${escapeHtml(item.eyebrow)}</span><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.description)}</p>
      <span class="guide-tags">${(item.tags || []).slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</span></span>
      <span class="guide-state ${read ? 'done' : ''}">${read ? '완료 ✓' : `${article.readingMinutes || '—'}분 · 보기 →`}</span>
    </a>`;
  }

  function renderHome() {
    const sword = sorted('sword');
    const science = sorted('science');
    const stats = content.stats || {};
    const featuredSlugs = ['sword-begin-sword', 'sword-basic-knowledge', 'sword-core-techniques', 'sword-combo-set-up', 'science-combat-science'];
    const featured = featuredSlugs.map((slug) => bySlug.get(slug)).filter(Boolean);
    main.innerHTML = `<div class="page-container">
      <section class="home-hero"><div class="hero-content">
        <span class="hero-badge">JAVA EDITION · 1.9+</span>
        <h1>전투를 읽고,<br><em>다음 한 타를 준비하세요.</em></h1>
        <p>검 PvP 기술과 전투 시스템의 원리를 한국어로 익히는 종합 가이드입니다. 입력법부터 피해 계산, 실전 영상까지 한곳에서 찾아보세요.</p>
        <div class="hero-actions"><a class="button primary" href="#guide/sword-begin-sword">첫 가이드 시작하기 →</a><a class="button secondary" href="#library">영상·도표 보기</a></div>
      </div></section>
      <div class="home-stats">
        <div class="stat"><strong>${stats.articles || articles.length}</strong><span>한국어 가이드</span></div>
        <div class="stat"><strong>${stats.media || 0}</strong><span>영상·이미지 자료</span></div>
        <div class="stat"><strong>${stats.translatedMessages || stats.textMessages || 0}</strong><span>번역된 원문 단락</span></div>
      </div>
      <div class="section-head"><div><p class="section-kicker">LEARNING TRACKS</p><h2>어디서 시작할까요?</h2><p>플레이 목적에 맞는 경로를 고르면 문서가 학습 순서대로 이어집니다.</p></div></div>
      <div class="path-grid">
        <a class="path-card" href="#category/sword"><div class="path-icon">⚔</div><span class="path-number">01</span><h3>검 PvP</h3><p>${labels.sword.description}</p><div class="path-meta"><b>${sword.length}개 문서</b><span>입문 → 심화</span></div></a>
        <a class="path-card science" href="#category/science"><div class="path-icon">⌁</div><span class="path-number">02</span><h3>전투 과학</h3><p>${labels.science.description}</p><div class="path-meta"><b>${science.length}개 문서</b><span>원리 → 데이터</span></div></a>
      </div>
      <div class="section-head"><div><p class="section-kicker">START HERE</p><h2>입문자 추천 순서</h2><p>처음이라면 아래 다섯 문서를 차례로 읽어 보세요.</p></div><a class="text-link" href="#category/sword">전체 과정 보기 →</a></div>
      <div class="recent-list">${featured.map((article, index) => `<a class="recent-item" href="#guide/${article.slug}"><span class="recent-number">${String(index + 1).padStart(2, '0')}</span><span><strong>${escapeHtml(meta(article).title)}</strong><small>${escapeHtml(meta(article).description)}</small></span><span class="recent-time">${article.readingMinutes || '—'}분</span><span class="recent-arrow">→</span></a>`).join('')}</div>
      <section class="feature-strip"><div><span>⌕</span><strong>한국어 본문 검색</strong><small>기술명과 설명을 바로 찾습니다.</small></div><div><span>▶</span><strong>자료를 설명 옆에서</strong><small>영상과 도표를 문맥과 함께 봅니다.</small></div><div><span>✓</span><strong>학습 진도 저장</strong><small>이 브라우저에서 읽은 문서를 기억합니다.</small></div></section>
      <div class="site-note"><div class="site-note-icon">i</div><div><h2>자료 범위 안내</h2><p>제공된 Discord HTML의 글·영상·도표를 빠짐없이 보존하고 한국어로 번역했습니다. 수치와 버전 표기는 원문의 작성 시점을 따르며, 영어 원문도 각 문서에서 바로 비교할 수 있습니다.</p></div></div>
    </div>`;
  }

  function renderCategory(category) {
    const item = labels[category];
    if (!item) return renderNotFound();
    const list = sorted(category);
    const levels = ['전체', ...new Set(list.map((article) => meta(article).level))];
    main.innerHTML = `<div class="page-container">
      <div class="breadcrumbs"><a href="#home">홈</a><span>/</span><span aria-current="page">${item.name}</span></div>
      <div class="category-header"><div><p class="page-kicker">${category === 'sword' ? 'SWORD COMBAT' : 'COMBAT SCIENCE'}</p><h1 class="page-title">${item.name}</h1><p class="page-lead">${item.description}</p></div><div class="category-mark ${category}">${item.icon}</div></div>
      <div class="category-toolbar"><span class="category-count"><strong>${list.length}</strong>개 문서 · 학습 순서대로 정렬</span><div class="filter-row" role="group" aria-label="난이도 필터">${levels.map((level, index) => `<button class="filter-button" type="button" data-filter="${escapeHtml(level)}" aria-pressed="${index === 0}">${escapeHtml(level)}</button>`).join('')}</div></div>
      <div class="category-list">${list.map(categoryCard).join('')}</div>
    </div>`;
  }

  function renderArticle(slug, targetId) {
    const article = bySlug.get(slug);
    if (!article) return renderNotFound();
    const item = meta(article);
    const list = sorted(article.category);
    const index = list.findIndex((entry) => entry.slug === slug);
    const previous = list[index - 1];
    const next = list[index + 1];
    const read = getRead().has(slug);
    const saved = getSaved().has(slug);
    const preferred = localStorage.getItem(languageKey) || 'ko';
    const htmlKo = (article.htmlKo || article.html || '').trim() ? (article.htmlKo || article.html) : '';
    const empty = !article.sourceText;
    const koreanAvailable = Boolean(htmlKo) || empty;
    const language = preferred === 'en' || !koreanAvailable ? 'en' : 'ko';
    const headingsKo = (Array.isArray(article.headingsKo) && article.headingsKo.length) ? article.headingsKo : null;
    const headingsEn = (Array.isArray(article.headings) && article.headings.length) ? article.headings : [];
    const headings = language === 'ko' ? (headingsKo || headingsEn) : headingsEn;
    const articleHtml = language === 'ko' ? (article.htmlKo || article.html) : article.html;
    const koFallback = language === 'ko' && (article.translatedCount === 0) && (article.textMessageCount > 0);
    main.innerHTML = `<div class="page-container">
      <div class="breadcrumbs"><a href="#home">홈</a><span>/</span><a href="#category/${article.category}">${escapeHtml(labels[article.category].name)}</a><span>/</span><span aria-current="page">${escapeHtml(item.title)}</span></div>
      <div class="guide-shell"><article class="guide-article">
        <header class="guide-header"><div class="guide-meta">${categoryPill(article)}<span class="level-pill">${escapeHtml(item.level)}</span>${article.translated ? '<span class="translation-pill">한국어 완역</span>' : ''}</div>
          <h1>${escapeHtml(item.title)}</h1><p class="guide-description">${escapeHtml(item.description)}</p>
          <div class="guide-byline"><span>읽는 시간 ${article.readingMinutes || '—'}분</span><span>${article.media.length}개 자료</span><span>원문 작성자 ${escapeHtml((article.authors || []).join(', ') || '미상')}</span></div>
          <div class="article-actions"><div class="language-switch" role="group" aria-label="본문 언어"><button type="button" data-language="ko" aria-pressed="${language === 'ko'}" ${koreanAvailable ? '' : 'disabled'}>한국어</button><button type="button" data-language="en" aria-pressed="${language === 'en'}">English 원문</button></div><button class="save-button" type="button" data-save-slug="${slug}" aria-pressed="${saved}">${saved ? '★ 저장됨' : '☆ 저장'}</button></div>
        </header>
        <section class="takeaway-box"><h2><span>◆</span> 먼저 기억할 것</h2><ul>${(item.takeaways || []).map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ul></section>
        ${empty ? `<div class="empty-source"><strong>제공된 원본에 본문이 없습니다.</strong><p>관련 내용은 위 요약의 연결 문서에서 확인할 수 있습니다.</p></div>` : `<div class="source-label"><span>${language === 'ko' ? (koFallback ? 'ENGLISH SOURCE · 한국어 번역 준비 중' : '한국어 번역') : 'ENGLISH SOURCE'}</span><i>${language === 'ko' ? (koFallback ? '아직 한국어 번역이 없어 영어 원문을 보여줍니다' : '원문의 의미·수치·링크를 보존한 전체 번역') : '제공된 HTML에 포함된 영어 원문'}</i></div><div class="original-content" lang="${koFallback ? 'en' : language}">${articleHtml}</div>`}
        <footer class="guide-footer"><button class="button read-toggle" type="button" data-read-slug="${slug}" aria-pressed="${read}">${read ? '학습 완료 ✓' : '이 문서를 학습 완료로 표시'}</button>
          <div class="guide-pagination">${previous ? `<a class="page-link" href="#guide/${previous.slug}"><small>이전 문서</small><strong>← ${escapeHtml(meta(previous).title)}</strong></a>` : '<span></span>'}${next ? `<a class="page-link next" href="#guide/${next.slug}"><small>다음 문서</small><strong>${escapeHtml(meta(next).title)} →</strong></a>` : '<span></span>'}</div></footer>
      </article><aside class="toc"><h2>이 문서의 목차</h2><nav>${headings.length ? headings.map((heading) => `<a data-level="${heading.level}" href="#guide/${slug}/${heading.id}">${escapeHtml(heading.text)}</a>`).join('') : '<span class="toc-empty">세부 목차가 없습니다.</span>'}</nav></aside></div>
    </div>`;
    prepareArticleMedia(article, item);
    renderChapterNav(article.category, slug);
    window.requestAnimationFrame(() => {
      if (targetId) document.getElementById(targetId)?.scrollIntoView({ block: 'start' });
      else window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  function normalizeMediaSrc(src) {
    if (!src) return '';
    return src.startsWith('assets/') ? '../' + src : src;
  }

  function allMedia() {
    const seen = new Set();
    return articles.flatMap((article) => (article.media || []).map((media) => ({ ...media, article })))
      .filter((item) => {
        const key = `${item.type}|${item.src}`;
        if (!item.src || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function mediaCard(item, index) {
    const src = normalizeMediaSrc(item.src);
    const title = meta(item.article).title;
    const visual = item.type === 'image'
      ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)} 참고 이미지" loading="lazy">`
      : item.type === 'video'
        ? `<div class="video-thumb" ${posters[item.src] ? `style="background-image:url('${escapeHtml(normalizeMediaSrc(posters[item.src]))}')"` : ''}><span>▶</span></div>`
        : '<div class="file-thumb"><span>↓</span><strong>첨부 파일</strong></div>';
    return `<button class="media-card" type="button" data-media-index="${index}" data-media-type="${item.type}">${visual}<span class="media-card-copy"><small>${item.type === 'video' ? '영상' : item.type === 'image' ? '도표 · 이미지' : '파일'} · ${escapeHtml(labels[item.article.category].name)}</small><strong>${escapeHtml(title)}</strong><span>${escapeHtml(item.caption || '참고 자료')}</span></span></button>`;
  }

  function renderLibrary(type = 'all') {
    const media = allMedia();
    const filtered = type === 'all' ? media : media.filter((item) => item.type === type);
    window.__visibleMedia = filtered;
    const counts = media.reduce((result, item) => { result[item.type] = (result[item.type] || 0) + 1; return result; }, {});
    main.innerHTML = `<div class="page-container">
      <div class="breadcrumbs"><a href="#home">홈</a><span>/</span><span aria-current="page">영상 & 도표 자료실</span></div>
      <div class="library-header"><p class="page-kicker">MEDIA LIBRARY</p><h1 class="page-title">영상 & 도표 자료실</h1><p class="page-lead">가이드에 포함된 실전 영상과 비교표를 한곳에서 찾습니다. 자료를 열면 연결된 한국어 문서로 이동할 수 있습니다.</p></div>
      <div class="library-toolbar"><div class="filter-row" role="group" aria-label="자료 종류"><button data-media-filter="all" aria-pressed="${type === 'all'}">전체 ${media.length}</button><button data-media-filter="video" aria-pressed="${type === 'video'}">영상 ${counts.video || 0}</button><button data-media-filter="image" aria-pressed="${type === 'image'}">이미지 ${counts.image || 0}</button><button data-media-filter="file" aria-pressed="${type === 'file'}">파일 ${counts.file || 0}</button></div></div>
      <div class="media-grid">${filtered.map(mediaCard).join('')}</div>
    </div>`;
  }

  function openMedia(item) {
    if (!item) return;
    const src = normalizeMediaSrc(item.src);
    const title = meta(item.article).title;
    document.getElementById('media-title').textContent = title;
    if (item.type === 'image') mediaViewer.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)} 참고 이미지">`;
    else if (item.type === 'video') mediaViewer.innerHTML = `<video src="${escapeHtml(src)}" controls autoplay playsinline ${posters[item.src] ? `poster="${escapeHtml(normalizeMediaSrc(posters[item.src]))}"` : ''}></video>`;
    else mediaViewer.innerHTML = `<div class="download-panel"><span>↓</span><p>이 첨부 파일을 새 창에서 엽니다.</p><a class="button primary" href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer">파일 열기</a></div>`;
    mediaCaption.innerHTML = `<span>${escapeHtml(item.caption || '참고 자료')}</span><a href="#guide/${item.article.slug}/message-${item.messageId}">설명이 있는 문서로 이동 →</a>`;
    if (!mediaDialog.open) mediaDialog.showModal();
  }

  function renderGlossary(query = '') {
    const normalized = query.trim().toLowerCase();
    const entries = glossary.filter((entry) => !normalized || [entry.term, entry.en, entry.description, ...(entry.aliases || [])].join(' ').toLowerCase().includes(normalized));
    main.innerHTML = `<div class="page-container">
      <div class="breadcrumbs"><a href="#home">홈</a><span>/</span><span aria-current="page">PvP 용어 사전</span></div>
      <div class="library-header"><p class="page-kicker">GLOSSARY</p><h1 class="page-title">PvP 용어 사전</h1><p class="page-lead">가이드에서 반복해서 등장하는 전투 용어를 짧고 정확하게 정리했습니다.</p></div>
      <label class="inline-search"><span class="sr-only">용어 검색</span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/></svg><input id="glossary-search" type="search" value="${escapeHtml(query)}" placeholder="예: 넉백, W 탭, 포화도"></label>
      <div class="glossary-count">${entries.length}개 용어</div>
      <div class="glossary-grid">${entries.map((entry) => `<article class="term-card"><div class="term-head"><span>${escapeHtml(entry.term.charAt(0))}</span><div><h2>${escapeHtml(entry.term)}</h2><small>${escapeHtml(entry.en)}</small></div></div><p>${escapeHtml(entry.description)}</p>${entry.slug ? `<a href="#guide/${entry.slug}">관련 가이드 읽기 →</a>` : ''}</article>`).join('') || '<div class="empty-source">일치하는 용어가 없습니다.</div>'}</div>
    </div>`;
    const input = document.getElementById('glossary-search');
    input?.addEventListener('input', () => renderGlossary(input.value));
    input?.focus({ preventScroll: true });
  }

  function renderSaved() {
    const saved = getSaved();
    const list = articles.filter((article) => saved.has(article.slug));
    main.innerHTML = `<div class="page-container">
      <div class="breadcrumbs"><a href="#home">홈</a><span>/</span><span aria-current="page">저장한 가이드</span></div>
      <div class="library-header"><p class="page-kicker">BOOKMARKS</p><h1 class="page-title">저장한 가이드</h1><p class="page-lead">나중에 다시 볼 문서를 모아 둡니다. 저장 정보는 이 브라우저에만 보관됩니다.</p></div>
      ${list.length ? `<div class="category-list">${list.map(categoryCard).join('')}</div>` : '<div class="empty-state"><span>☆</span><h2>아직 저장한 가이드가 없습니다.</h2><p>문서 상단의 ‘저장’ 버튼을 누르면 이곳에 모입니다.</p><a class="button primary" href="#category/sword">가이드 둘러보기</a></div>'}
    </div>`;
  }

  function renderChapterNav(category, currentSlug) {
    const host = document.getElementById('chapter-nav');
    if (!host) return;
    if (!category) { host.innerHTML = ''; return; }
    host.innerHTML = `<div class="chapter-heading">${labels[category].name} 목차</div>${sorted(category).map((article) => `<a class="chapter-link ${article.slug === currentSlug ? 'active' : ''}" href="#guide/${article.slug}"><span>${String((meta(article).order || 0) + 1).padStart(2, '0')}</span>${escapeHtml(meta(article).title)}</a>`).join('')}`;
  }

  function channelToSlugMap() {
    const map = {};
    articles.forEach((entry) => { if (entry.id) map[entry.id] = entry.slug; });
    return map;
  }

  function prettifyInternalLink(anchor) {
    const text = (anchor.textContent || '').trim();
    if (text.indexOf('discord.com/channels') === -1 && text.indexOf('https://discord') !== 0) return;
    const href = anchor.getAttribute('href') || '';
    if (href.indexOf('#guide/') !== 0) return;
    const slug = href.slice(7).split('/')[0];
    const title = (catalog[slug] && catalog[slug].title) || slug || '관련 문서';
    anchor.textContent = href.indexOf('/message-') !== -1 ? title + ' · 해당 위치로 이동 →' : title;
    anchor.classList.add('internal-link');
    anchor.removeAttribute('target');
  }

  function linkifyDiscordUrls(root, channelMap) {
    const pattern = /https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/\d+\/(\d+)(?:\/(\d+))?/g;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || node.nodeValue.indexOf('discord.com/channels') === -1) return NodeFilter.FILTER_REJECT;
        if (node.parentElement && node.parentElement.closest('a, code, pre')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);
    targets.forEach((textNode) => {
      const value = textNode.nodeValue;
      let match; let lastIndex = 0;
      const fragment = document.createDocumentFragment();
      pattern.lastIndex = 0;
      let found = false;
      while ((match = pattern.exec(value))) {
        found = true;
        const url = match[0];
        const channelId = match[1];
        const messageId = match[2];
        const slug = channelMap[channelId];
        fragment.appendChild(document.createTextNode(value.slice(lastIndex, match.index)));
        if (slug) {
          const link = document.createElement('a');
          link.href = '#guide/' + slug + (messageId ? '/message-' + messageId : '');
          const title = (catalog[slug] && catalog[slug].title) || slug;
          link.textContent = messageId ? title + ' · 해당 위치로 이동 →' : title;
          link.className = 'internal-link';
          fragment.appendChild(link);
        } else {
          const link = document.createElement('a');
          link.href = url;
          link.textContent = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'external-link';
          fragment.appendChild(link);
        }
        lastIndex = match.index + url.length;
      }
      if (found) {
        fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
        textNode.parentNode.replaceChild(fragment, textNode);
      }
    });
  }

  function prepareArticleMedia(article, item) {
    const channelMap = channelToSlugMap();
    const contentRoot = main.querySelector('.original-content');
    if (contentRoot) {
      linkifyDiscordUrls(contentRoot, channelMap);
      contentRoot.querySelectorAll('a[href^="#guide/"]').forEach(prettifyInternalLink);
    }
    main.querySelectorAll('.original-content a').forEach((anchor) => {
      const href = anchor.getAttribute('href') || '';
      if (href.indexOf('#guide/') === 0) {
        anchor.classList.add('internal-link');
        return;
      }
      if (/^https?:/i.test(anchor.href)) {
        anchor.classList.add('external-link');
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      }
    });
    main.querySelectorAll('.original-content table').forEach((table) => {
      if (table.parentElement.classList.contains('table-scroll')) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'table-scroll';
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
    main.querySelectorAll('.original-content img').forEach((image) => {
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', `${item.title} 이미지 확대`);
      const open = () => openMedia({ type: 'image', src: image.getAttribute('src'), caption: image.alt, article, messageId: image.closest('.guide-section')?.id.replace('message-', '') || '' });
      image.addEventListener('click', open);
      image.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });
  }

  function renderNotFound() {
    main.innerHTML = '<div class="page-container not-found"><div><div class="not-found-code">404</div><h1>페이지를 찾을 수 없습니다.</h1><p>주소가 바뀌었거나 자료에 없는 경로입니다.</p><a class="button primary" href="#home">가이드 홈으로</a></div></div>';
  }

  function route() {
    const raw = window.location.hash.replace(/^#/, '') || 'home';
    const parts = raw.split('/');
    renderChapterNav();
    if (parts[0] === 'home') renderHome();
    else if (parts[0] === 'category') { renderCategory(parts[1]); renderChapterNav(parts[1]); }
    else if (parts[0] === 'guide') renderArticle(parts[1], parts[2]);
    else if (parts[0] === 'library') renderLibrary(parts[1] || 'all');
    else if (parts[0] === 'glossary') renderGlossary();
    else if (parts[0] === 'saved') renderSaved();
    else renderNotFound();
    updateSidebar();
    document.querySelectorAll('[data-route]').forEach((link) => {
      link.toggleAttribute('aria-current', link.dataset.route === `${parts[0]}${parts[1] && parts[0] === 'category' ? '/' + parts[1] : ''}`);
    });
    closeMenu();
    if (parts[0] !== 'guide') window.scrollTo({ top: 0, behavior: 'instant' });
    updateReadingProgress();
  }

  function openSearch() {
    if (!searchDialog.open) searchDialog.showModal();
    document.body.classList.add('search-open');
    searchInput.value = '';
    renderSearch('');
    searchInput.focus();
  }

  function renderSearch(query) {
    const normalized = query.trim().toLowerCase();
    lastSearchResults = articles.filter((article) => {
      const item = meta(article);
      return !normalized || [item.title, item.description, (item.tags || []).join(' '), article.textKo, article.text].join(' ').toLowerCase().includes(normalized);
    }).slice(0, 40);
    selectedSearchIndex = 0;
    document.getElementById('search-hint').textContent = normalized ? `“${query.trim()}” 검색 결과 ${lastSearchResults.length}개` : '제목·태그·한국어 본문·영어 원문을 모두 검색합니다.';
    searchResults.innerHTML = lastSearchResults.length ? lastSearchResults.map((article, index) => {
      const item = meta(article);
      return `<button class="search-result ${index === 0 ? 'selected' : ''}" type="button" data-search-index="${index}"><span><span class="search-result-title"><strong>${escapeHtml(item.title)}</strong>${categoryPill(article)}</span><p>${escapeHtml(item.description)}</p></span><span class="search-result-type">${escapeHtml(item.level)}</span></button>`;
    }).join('') : '<div class="search-empty">일치하는 문서가 없습니다.<br>다른 기술명이나 영어 용어로 검색해 보세요.</div>';
  }

  function chooseSearch(index) {
    const article = lastSearchResults[index];
    if (!article) return;
    searchDialog.close();
    window.location.hash = 'guide/' + article.slug;
  }

  function closeMenu() {
    document.body.classList.remove('menu-open');
    document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
  }

  function updateReadingProgress() {
    const height = document.documentElement.scrollHeight - window.innerHeight;
    const percent = height > 0 ? Math.min(100, Math.max(0, window.scrollY / height * 100)) : 0;
    document.getElementById('reading-progress-bar').style.width = percent + '%';
    document.getElementById('back-to-top').classList.toggle('visible', window.scrollY > 500);
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
  }

  document.getElementById('search-trigger').addEventListener('click', openSearch);
  document.getElementById('search-close').addEventListener('click', () => searchDialog.close());
  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.body.classList.toggle('menu-open');
    document.getElementById('menu-toggle').setAttribute('aria-expanded', String(document.body.classList.contains('menu-open')));
  });
  document.getElementById('sidebar-scrim').addEventListener('click', closeMenu);
  document.getElementById('back-to-top').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const light = document.documentElement.dataset.theme !== 'light';
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    localStorage.setItem(themeKey, document.documentElement.dataset.theme);
    document.getElementById('theme-toggle').setAttribute('aria-label', light ? '어두운 테마로 전환' : '밝은 테마로 전환');
  });
  document.getElementById('media-close').addEventListener('click', () => mediaDialog.close());
  searchDialog.addEventListener('close', () => document.body.classList.remove('search-open'));
  mediaDialog.addEventListener('close', () => { mediaViewer.innerHTML = ''; });
  searchInput.addEventListener('input', () => renderSearch(searchInput.value));
  searchResults.addEventListener('click', (event) => { const result = event.target.closest('[data-search-index]'); if (result) chooseSearch(Number(result.dataset.searchIndex)); });
  searchDialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!lastSearchResults.length) return;
      selectedSearchIndex = (selectedSearchIndex + (event.key === 'ArrowDown' ? 1 : -1) + lastSearchResults.length) % lastSearchResults.length;
      searchResults.querySelectorAll('.search-result').forEach((node, index) => node.classList.toggle('selected', index === selectedSearchIndex));
      searchResults.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    }
    if (event.key === 'Enter') { event.preventDefault(); chooseSearch(selectedSearchIndex); }
  });
  main.addEventListener('click', (event) => {
    const readButton = event.target.closest('[data-read-slug]');
    if (readButton) {
      const read = getRead(); const slug = readButton.dataset.readSlug;
      read.has(slug) ? read.delete(slug) : read.add(slug); writeSet(progressKey, read);
      readButton.setAttribute('aria-pressed', String(read.has(slug)));
      readButton.textContent = read.has(slug) ? '학습 완료 ✓' : '이 문서를 학습 완료로 표시';
      showToast(read.has(slug) ? '학습 완료로 표시했습니다.' : '학습 완료 표시를 해제했습니다.');
    }
    const saveButton = event.target.closest('[data-save-slug]');
    if (saveButton) {
      const saved = getSaved(); const slug = saveButton.dataset.saveSlug;
      saved.has(slug) ? saved.delete(slug) : saved.add(slug); writeSet(savedKey, saved);
      saveButton.setAttribute('aria-pressed', String(saved.has(slug)));
      saveButton.textContent = saved.has(slug) ? '★ 저장됨' : '☆ 저장';
      showToast(saved.has(slug) ? '저장한 가이드에 추가했습니다.' : '저장을 해제했습니다.');
    }
    const languageButton = event.target.closest('[data-language]');
    if (languageButton && !languageButton.disabled) {
      localStorage.setItem(languageKey, languageButton.dataset.language);
      const parts = window.location.hash.replace(/^#/, '').split('/');
      renderArticle(parts[1], parts[2]);
    }
    const filter = event.target.closest('[data-filter]');
    if (filter) {
      main.querySelectorAll('[data-filter]').forEach((button) => button.setAttribute('aria-pressed', String(button === filter)));
      main.querySelectorAll('.category-guide').forEach((cardNode) => { cardNode.hidden = filter.dataset.filter !== '전체' && cardNode.dataset.level !== filter.dataset.filter; });
    }
    const mediaFilter = event.target.closest('[data-media-filter]');
    if (mediaFilter) window.location.hash = `library/${mediaFilter.dataset.mediaFilter}`;
    const mediaButton = event.target.closest('[data-media-index]');
    if (mediaButton) openMedia((window.__visibleMedia || [])[Number(mediaButton.dataset.mediaIndex)]);
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('scroll', updateReadingProgress, { passive: true });
  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    if (event.key === 'Escape') closeMenu();
  });

  const savedTheme = localStorage.getItem(themeKey);
  if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
  updateSidebar();
  route();
}());
