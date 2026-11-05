/* ============================================================
   安颐照护 H5 · 应用逻辑（纯前端演示）
   数据持久化：localStorage（anyi-care-v1）
   ============================================================ */
(function () {
  'use strict';

  const D = window.CARE_DATA;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const viewEl = $('#view');
  const tabbarEl = $('#tabbar');
  const sheetRoot = $('#sheet-root');
  const toastEl = $('#toast');

  const STORAGE_KEY = 'anyi-care-v1';
  const BRAND = D.brand;
  const PHONE = BRAND.phone;
  const PHONE_TEL = PHONE.replace(/-/g, '');

  /* ============================================================
     Utilities
     ============================================================ */
  const pad2 = n => String(n).padStart(2, '0');
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function money(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }
  function icon(name, cls = '') {
    const id = String(name || '').replace(/^i-/, '');
    return `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  }
  function ymd(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function todayYmd() { return ymd(new Date()); }
  function tomorrowYmd() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return ymd(d);
  }
  function parseYmd(s) {
    if (!s) return new Date();
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function dateLabel(s) {
    const d = parseYmd(s);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`;
  }
  function dateTimeLabel(ts) {
    const d = new Date(ts);
    return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function hhmm(ts = Date.now()) {
    const d = new Date(ts);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function uid(prefix = 'o') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    let target = obj;
    keys.forEach(k => {
      if (!target[k] || typeof target[k] !== 'object') target[k] = {};
      target = target[k];
    });
    target[last] = value;
  }
  function getService(id) { return D.services.find(s => s.id === id); }
  function getCaregiver(id) { return D.caregivers.find(c => c.id === id); }
  function getOrder(id) { return state.orders.find(o => o.id === id); }
  function typeName(type) { return type === 'home' ? '居家照护' : '院内照护'; }
  function statusMeta(o) { return STATUS[o.status] || STATUS.pending; }

  /* ============================================================
     Toast / Sheet / Modal
     ============================================================ */
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 2300);
  }

  let sheetEl = null;
  function openSheet(opts) {
    closeSheet(true);
    const { title, sub = '', body = '', foot = '', className = '', onMount } = opts;
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `
      <div class="sheet-mask" data-act="close-sheet"></div>
      <div class="sheet ${className}">
        <div class="sheet__grab"></div>
        <div class="sheet__head">
          <div>
            <div class="sheet__title">${title}</div>
            ${sub ? `<div class="sheet__sub">${sub}</div>` : ''}
          </div>
          <button class="sheet__close" data-act="close-sheet" aria-label="关闭">${icon('close')}</button>
        </div>
        <div class="sheet__body">${body}</div>
        ${foot ? `<div class="sheet__foot">${foot}</div>` : ''}
      </div>`;
    sheetRoot.appendChild(wrap);
    sheetEl = wrap;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => wrap.classList.add('is-open'));
    if (onMount) onMount(wrap);
    return wrap;
  }
  function closeSheet(immediate) {
    if (!sheetEl) return;
    const el = sheetEl;
    sheetEl = null;
    document.body.style.overflow = '';
    el.classList.remove('is-open');
    if (immediate) el.remove();
    else setTimeout(() => el.remove(), 300);
  }

  function confirmDialog({ title, text, okText = '确认', cancelText = '取消' }) {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `
        <div class="modal-mask"></div>
        <div class="modal">
          <div class="modal__icon">${icon('info')}</div>
          <h3>${title}</h3>
          <p>${text}</p>
          <div class="modal__actions">
            <button class="btn btn--ghost" data-modal="cancel">${cancelText}</button>
            <button class="btn btn--primary" data-modal="ok">${okText}</button>
          </div>
        </div>`;
      document.body.appendChild(wrap);
      const done = val => {
        wrap.remove();
        resolve(val);
      };
      wrap.querySelector('[data-modal="ok"]').addEventListener('click', () => done(true));
      wrap.querySelector('[data-modal="cancel"]').addEventListener('click', () => done(false));
      wrap.querySelector('.modal-mask').addEventListener('click', () => done(false));
    });
  }

  /* ============================================================
     State
     ============================================================ */
  const DAY = 864e5;

  function defaultState() {
    return {
      profile: {
        name: '张女士',
        phone: '13800006721',
        city: BRAND.city,
        avatar: '张',
        points: 480,
        member: true,
        elderCount: 2
      },
      addresses: [
        { id: 'addr-1', name: '李桂芳', phone: '13800006721', city: '上海', district: '徐汇区', detail: '田林路 128 弄 12 号 502 室', tag: '父母家' },
        { id: 'addr-2', name: '张女士', phone: '13800006721', city: '上海', district: '浦东新区', detail: '锦绣路 800 弄 6 号 1201 室', tag: '我家' }
      ],
      orders: seedOrders(),
      seq: 12
    };
  }

  function normalizeState(s) {
    if (!s || typeof s !== 'object') return defaultState();
    if (!Array.isArray(s.orders)) s.orders = seedOrders();
    if (!Array.isArray(s.addresses)) s.addresses = [];
    if (!s.profile) s.profile = defaultState().profile;
    if (typeof s.seq !== 'number') s.seq = 12;
    s.orders.forEach(o => {
      if (o.status === 'unpaid') o.status = 'pending';
      if (Array.isArray(o.events)) o.events = o.events.filter(e => e.key !== 'paid');
      delete o.payMethod;
      delete o.paidAt;
    });
    return s;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return normalizeState(JSON.parse(raw));
    } catch (e) {
      return defaultState();
    }
  }

  let state = loadState();
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function seedOrders() {
    const now = Date.now();
    const start = new Date(now - 2 * DAY);
    start.setHours(8, 0, 0, 0);
    const doneStart = new Date(now - 18 * DAY);
    doneStart.setHours(9, 0, 0, 0);

    const serving = {
      id: 'seed-serve-1',
      no: 'AY' + ymd(start).replace(/-/g, '') + '0011',
      serviceId: 'hosp-24',
      type: 'hospital',
      title: '院内 24 小时陪护',
      price: 320, unit: '天', qty: 7, fee: 2240, discount: 100, total: 2140,
      status: 'serving',
      createdAt: now - 3 * DAY,
      appointmentDate: ymd(start),
      startTime: '08:00',
      patient: { name: '张建国', gender: '男', age: 76, relation: '父亲', phone: '13900001234' },
      selfCare: '不能自理',
      needs: ['术后康复', '夜间起夜', '血压监测'],
      hospital: { name: '复旦大学附属华山医院', dept: '骨科病区', bed: '12 床', no: 'ZY2026102807' },
      address: null,
      contact: { name: '张女士', phone: '13800006721' },
      emergency: { name: '张先生', phone: '13900005678' },
      note: '父亲术后行动不便，夜间需要协助起夜，请多留意引流管。',
      coupon: { id: 'c-hosp', title: '院内陪护满减', amount: 100 },
      caregiverId: 'cg-1',
      events: [
        { key: 'created', title: '订单已提交', desc: '等待护理员接单', time: new Date(now - 3 * DAY).toISOString() },
        { key: 'accepted', title: '护理员已接单', desc: '王秀兰 · 高级养老护理员', time: new Date(now - 3 * DAY + 22e5).toISOString() },
        { key: 'serving', title: '服务开始', desc: '护理员已到院签到，开始 24 小时陪护', time: new Date(start.getTime() + 2 * 6e4).toISOString() }
      ],
      records: [
        { type: '签到', time: '08:02', text: '护理员到院签到，与家属、护士站完成交接' },
        { type: '护理', time: '10:30', text: '协助翻身、拍背；体温 36.6℃，血压 128/78mmHg' },
        { type: '饮食', time: '12:15', text: '协助午餐，进食约 200g，饮水 150ml' },
        { type: '护理', time: '15:40', text: '协助床上活动，观察引流管通畅' },
        { type: '护理', time: '19:20', text: '擦身、更换衣物，协助晚餐' }
      ],
      review: null
    };

    const done = {
      id: 'seed-done-1',
      no: 'AY' + ymd(doneStart).replace(/-/g, '') + '0008',
      serviceId: 'home-long',
      type: 'home',
      title: '居家长期照护',
      price: 68, unit: '小时', qty: 4, fee: 272, discount: 30, total: 242,
      status: 'completed',
      createdAt: now - 19 * DAY,
      appointmentDate: ymd(doneStart),
      startTime: '09:00',
      patient: { name: '李桂芳', gender: '女', age: 78, relation: '母亲', phone: '13800006721' },
      selfCare: '半自理',
      needs: ['用药提醒', '康复锻炼'],
      address: { id: 'addr-1', name: '李桂芳', phone: '13800006721', city: '上海', district: '徐汇区', detail: '田林路 128 弄 12 号 502 室', tag: '父母家' },
      hospital: null,
      contact: { name: '张女士', phone: '13800006721' },
      emergency: { name: '张先生', phone: '13900005678' },
      note: '母亲膝盖不好，起身时需要扶一把，下午三点提醒吃药。',
      coupon: { id: 'c-new', title: '新客立减', amount: 30 },
      caregiverId: 'cg-2',
      events: [
        { key: 'created', title: '订单已提交', desc: '等待护理员接单', time: new Date(now - 19 * DAY).toISOString() },
        { key: 'accepted', title: '护理员已接单', desc: '李秀梅 · 中级养老护理员', time: new Date(now - 19 * DAY + 18e5).toISOString() },
        { key: 'serving', title: '服务开始', desc: '护理员上门签到，开始 4 小时照护', time: new Date(doneStart.getTime() + 3 * 6e4).toISOString() },
        { key: 'completed', title: '服务已完成', desc: '家属确认服务完成', time: new Date(doneStart.getTime() + 4 * 36e5).toISOString() }
      ],
      records: [
        { type: '签到', time: '09:03', text: '护理员上门签到，与家属完成交接' },
        { type: '护理', time: '10:10', text: '协助服药，测量血压 132/82mmHg' },
        { type: '康复', time: '11:00', text: '陪同室内步行 15 分钟，做膝关节伸展训练' },
        { type: '签退', time: '13:05', text: '服务结束，向家属交代下午注意事项' }
      ],
      review: { stars: 5, tags: ['专业耐心', '准时到达'], text: '李阿姨很细心，母亲第一次接受外人照护也没有抵触，下次还约她。', time: new Date(doneStart.getTime() + 26 * 36e5).toISOString() }
    };

    return [serving, done];
  }

  /* ============================================================
     Status definitions
     ============================================================ */
  const STATUS = {
    pending: { label: '待接单', title: '正在为您匹配护理员', desc: '预约已收到，正在为您匹配附近持证护理员', cls: '' },
    accepted: { label: '待服务', title: '护理员已接单', desc: '护理员将在约定时间到达，请保持电话畅通', cls: '' },
    serving: { label: '服务中', title: '服务进行中', desc: '护理员正在照护，服务记录会实时更新', cls: '' },
    completed: { label: '已完成', title: '服务已完成', desc: '感谢您的信任，期待再次为您服务', cls: 'completed' },
    cancelled: { label: '已取消', title: '订单已取消', desc: '订单已关闭，如仍需服务可随时重新预约', cls: 'cancelled' }
  };
  const STEPS = [
    { key: 'created', label: '填写信息' },
    { key: 'created', label: '提交订单' },
    { key: 'accepted', label: '护理员接单' },
    { key: 'serving', label: '服务开始' },
    { key: 'completed', label: '服务完成' }
  ];
  const STEP_DONE = { pending: 2, accepted: 3, serving: 4, completed: 5, cancelled: 0 };

  function stepStates(o) {
    if (o.status === 'cancelled') {
      const keys = o.events.map(e => e.key);
      const done = keys.includes('completed') ? 5 : keys.includes('serving') ? 4 : keys.includes('accepted') ? 3 : 2;
      return STEPS.map((s, i) => (i < done ? 'done' : ''));
    }
    const done = STEP_DONE[o.status] || 0;
    return STEPS.map((s, i) => {
      if (i < done) return 'done';
      if (i === done && o.status !== 'completed') return 'now';
      return '';
    });
  }

  /* ============================================================
     Pricing / coupons
     ============================================================ */
  function couponOk(c, svc, amount) {
    return amount >= c.min && (c.scope === 'all' || c.scope === svc.type);
  }
  function calcBook(svc) {
    const qty = draft.qty;
    const fee = svc.price * qty;
    const coupon = D.coupons.find(c => c.id === draft.couponId);
    const use = coupon && couponOk(coupon, svc, fee) ? coupon : null;
    return { fee, discount: use ? use.amount : 0, total: Math.max(1, fee - (use ? use.amount : 0)), coupon: use };
  }
  function syncCoupon(svc) {
    if (draft.couponTouched) {
      const c = D.coupons.find(x => x.id === draft.couponId);
      if (c && !couponOk(c, svc, svc.price * draft.qty)) draft.couponId = '';
      return;
    }
    const best = D.coupons
      .filter(c => couponOk(c, svc, svc.price * draft.qty))
      .sort((a, b) => b.amount - a.amount)[0];
    draft.couponId = best ? best.id : '';
  }

  /* ============================================================
     Draft
     ============================================================ */
  let draft = null;
  function createDraft(svc) {
    const addr = state.addresses[0];
    draft = {
      serviceId: svc.id,
      qty: svc.qtyOptions[0].v,
      patient: { name: '李桂芳', gender: '女', age: '78', relation: '母亲', phone: '13800006721' },
      addressId: addr ? addr.id : '',
      hospital: { name: '', dept: '', bed: '', no: '' },
      date: tomorrowYmd(),
      time: '09:00',
      selfCare: '半自理',
      needs: [],
      note: '',
      contact: { name: state.profile.name, phone: state.profile.phone },
      emergency: { name: '', phone: '' },
      couponId: '',
      couponTouched: false,
      agree: false
    };
    syncCoupon(svc);
    return draft;
  }

  /* ============================================================
     Router
     ============================================================ */
  let current = { path: '/', params: new URLSearchParams(), parts: [] };
  let sortMode = 'default';
  let searchQuery = '';

  function parseHash() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query] = raw.split('?');
    return { path: path || '/', params: new URLSearchParams(query || '') };
  }
  function go(path) {
    const hash = path.startsWith('#') ? path : '#' + path;
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function render(opts = {}) {
    const { path, params } = parseHash();
    const parts = path.split('/').filter(Boolean);
    current = { path, params, parts };
    let out = null;

    switch (parts[0]) {
      case undefined:
        out = viewHome();
        break;
      case 'services':
        out = viewServices(parts[1] || 'all');
        break;
      case 'service':
        out = viewService(parts[1]);
        break;
      case 'book':
        out = viewBook(parts[1]);
        break;
      case 'success':
        out = viewSuccess(parts[1]);
        break;
      case 'orders':
        out = viewOrders(parts[1] || 'all');
        break;
      case 'order':
        out = viewOrder(parts[1]);
        break;
      case 'mine':
        out = viewMine();
        break;
      case 'search':
        out = viewSearch();
        break;
      default:
        out = viewHome();
    }

    viewEl.innerHTML = out.html;
    viewEl.className = 'view'
      + (out.tabbar ? ' has-tabbar' : '')
      + (out.actionbar ? ' has-actionbar' : '');
    tabbarEl.hidden = !out.tabbar;
    if (out.tabbar) tabbarEl.innerHTML = tabbarHtml(out.tabKey || 'home');
    else tabbarEl.innerHTML = '';
    if (!opts.preserveScroll) window.scrollTo(0, 0);
    document.title = out.title ? `${out.title} · 安颐照护` : '安颐照护 · 居家与院内专业照护';
    if (out.after) out.after();
  }

  function tabbarHtml(active) {
    const items = [
      { key: 'home', label: '首页', icon: 'home', nav: '#/' },
      { key: 'services', label: '服务', icon: 'grid', nav: '#/services' },
      { key: 'orders', label: '订单', icon: 'receipt', nav: '#/orders' },
      { key: 'mine', label: '我的', icon: 'user', nav: '#/mine' }
    ];
    const hasActive = state.orders.some(o => ['pending', 'accepted', 'serving'].includes(o.status));
    return items.map(it => `
      <button class="tabbar__item ${active === it.key ? 'is-on' : ''}" data-nav="${it.nav}">
        ${icon(it.icon)}<span>${it.label}</span>
        ${it.key === 'orders' && hasActive ? '<i class="tabbar__dot"></i>' : ''}
      </button>`).join('');
  }

  /* ============================================================
     Shared components
     ============================================================ */
  function cover(svc, cls = '', iconName) {
    const isDetail = String(cls).includes('detail-cover');
    return `<div class="cover tone-${svc.tone} ${cls}">
      <span class="cover__ring"></span>
      ${icon(iconName || svc.icon, 'cover__ic')}
      <span class="cover__label">${typeName(svc.type)}</span>
      ${isDetail ? `<span class="detail-cover__tag">${icon('badge', 'ic-12')}持证护理员 · 全程留痕</span>` : ''}
    </div>`;
  }

  function starsHtml(stars, cls = '') {
    const list = [1, 2, 3, 4, 5];
    return `<span class="stars ${cls}" style="display:inline-flex;gap:1px;color:#EDA93C">${list.map(n => icon('star', n <= Math.round(stars) ? 'ic--fill' : '')).join('')}</span>`;
  }

  function serviceCard(svc) {
    return `<button class="svc-card" data-nav="#/service/${svc.id}">
      ${cover(svc, 'svc-card__cover')}
      <div class="svc-card__body">
        <div class="svc-card__name">${esc(svc.name)}</div>
        <div class="svc-card__sub ellipsis">${esc(svc.sub)}</div>
        <div class="svc-card__foot">
          <div class="rating">${icon('star', 'ic--fill')}${Number(svc.rating).toFixed(1)}<span class="sold">· ${svc.sold}单</span></div>
          <span class="svc-row__book">详情</span>
        </div>
      </div>
    </button>`;
  }

  function serviceRow(svc) {
    return `<button class="svc-row" data-nav="#/service/${svc.id}">
      ${cover(svc, 'svc-row__cover')}
      <div class="svc-row__main">
        <div class="svc-row__name">${esc(svc.name)}</div>
        <div class="svc-row__sub ellipsis">${esc(svc.sub)}</div>
        <div class="svc-row__tags">${svc.tags.slice(0, 2).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
        <div class="svc-row__foot">
          <span class="rating">${icon('star', 'ic--fill')}${Number(svc.rating).toFixed(1)}<span class="sold">· ${svc.sold}单</span></span>
          <span class="svc-row__book">查看详情</span>
        </div>
      </div>
    </button>`;
  }

  function reviewCard(r) {
    return `<div class="review">
      <div class="review__top">
        <span class="review__av">${esc(r.name.slice(0, 1))}</span>
        <span class="review__name">${esc(r.name)}</span>
        ${starsHtml(r.stars)}
        <span class="review__date">${esc(r.date)}</span>
      </div>
      <div class="review__text">${esc(r.text)}</div>
    </div>`;
  }

  function guaranteeBand() {
    return `<div class="guarantee">
      ${D.guarantees.map(g => `<div class="guarantee__item">
        <div class="guarantee__ic">${icon(g.icon)}</div>
        <div class="guarantee__t">${esc(g.title)}</div>
        <div class="guarantee__d">${esc(g.desc)}</div>
      </div>`).join('')}
    </div>`;
  }

  function pageHeader(title, opts = {}) {
    return `<header class="ph">
      <button class="ph__btn" data-act="back" aria-label="返回">${icon('chevL')}</button>
      <div><div class="ph__title">${title}</div>${opts.sub ? `<div class="ph__sub">${opts.sub}</div>` : ''}</div>
      <div class="ph__right">${opts.right || ''}</div>
    </header>`;
  }

  function emptyState(iconName, title, desc, action = '') {
    return `<div class="empty">
      <div class="empty__ic">${icon(iconName)}</div>
      <h3>${title}</h3>
      <p>${desc}</p>
      ${action}
    </div>`;
  }

  function heroArt() {
    return `<svg class="hero-art" viewBox="0 0 180 150" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ha-heart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#A9D9FF"/><stop offset="1" stop-color="#4C8DF6"/>
        </linearGradient>
        <linearGradient id="ha-window" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#124A8E"/><stop offset="1" stop-color="#0D356E"/>
        </linearGradient>
      </defs>
      <circle cx="143" cy="27" r="17" fill="rgba(255,255,255,.06)"/>
      <circle cx="143" cy="27" r="8" fill="rgba(255,255,255,.12)"/>
      <path d="M12 126h156" stroke="rgba(255,255,255,.16)" stroke-width="1" stroke-dasharray="3 6" stroke-linecap="round"/>
      <path d="M38 120V70l38-28 38 28v50" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.58)" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M38 70l38-28 38 28" stroke="rgba(255,255,255,.3)" stroke-width="1.2"/>
      <rect x="62" y="88" width="24" height="32" rx="3" fill="url(#ha-window)" stroke="rgba(255,255,255,.42)" stroke-width="1.2"/>
      <circle cx="81" cy="104" r="1.6" fill="rgba(255,255,255,.7)"/>
      <path d="M80 70c-7.5-5-11.5-8.8-11.5-13.6A6.2 6.2 0 0 1 80 52a6.2 6.2 0 0 1 11.5 4.4C91.5 61.2 87.5 65 80 70z" fill="url(#ha-heart)"/>
      <path d="M132 120v-20" stroke="rgba(255,255,255,.35)" stroke-width="1.4" stroke-linecap="round"/>
      <path d="M132 104c-6.4 0-10.6-3.8-10.6-8.6 5.7 0 10.6 3.2 10.6 8.6z" fill="rgba(125,190,255,.45)"/>
      <path d="M132 111c5.6 0 9.4-3.4 9.4-7.6-5.1 0-9.4 2.8-9.4 7.6z" fill="rgba(125,190,255,.28)"/>
      <circle cx="50" cy="121" r="3" fill="rgba(255,255,255,.16)"/>
      <circle cx="58" cy="125" r="1.8" fill="rgba(255,255,255,.12)"/>
    </svg>`;
  }

  /* ============================================================
     Home
     ============================================================ */
  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  /* ---------- Home 3D-ish illustrations ---------- */
  function artHouse() {
    return `<svg class="feature__art" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="fh-wall" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#DDF7F2"/></linearGradient>
        <linearGradient id="fh-roof" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8BEDDD"/><stop offset="1" stop-color="#1B9E90"/></linearGradient>
        <linearGradient id="fh-heart" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FFB6C0"/><stop offset="1" stop-color="#FF6F86"/></linearGradient>
      </defs>
      <ellipse cx="63" cy="102" rx="35" ry="7" fill="rgba(5,70,65,.18)"/>
      <path d="M31 57 62 32l29 25v37c0 4-3 7-7 7H38c-4 0-7-3-7-7z" fill="url(#fh-wall)"/>
      <path d="M27 59 62 30l35 29" fill="none" stroke="url(#fh-roof)" stroke-width="10" stroke-linecap="round"/>
      <rect x="54" y="73" width="16" height="26" rx="4" fill="#1B8F86"/>
      <circle cx="66" cy="86" r="1.6" fill="#DFF8F2"/>
      <circle cx="44" cy="66" r="6" fill="#B9F3E8"/>
      <path d="M82 62c-5-3.6-8-6.3-8-9.7a4.3 4.3 0 0 1 8-2.8 4.3 4.3 0 0 1 8 2.8c0 3.4-3 6.1-8 9.7z" fill="url(#fh-heart)"/>
      <circle cx="32" cy="93" r="3" fill="#DFF8F2" opacity=".7"/>
      <circle cx="96" cy="86" r="2" fill="#fff" opacity=".8"/>
    </svg>`;
  }

  function artHospital() {
    return `<svg class="feature__art" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="fho-wall" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFE3E3"/></linearGradient>
        <linearGradient id="fho-cross" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FF9A9A"/><stop offset="1" stop-color="#F05D5D"/></linearGradient>
      </defs>
      <ellipse cx="61" cy="102" rx="32" ry="7" fill="rgba(110,30,40,.18)"/>
      <rect x="35" y="25" width="50" height="76" rx="12" fill="url(#fho-wall)"/>
      <rect x="43" y="33" width="34" height="60" rx="7" fill="#FFF4F4"/>
      <circle cx="60" cy="52" r="12" fill="url(#fho-cross)"/>
      <path d="M60 44.5v15M52.5 52h15" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>
      <rect x="47" y="72" width="7" height="7" rx="2" fill="#FFD6D6"/>
      <rect x="66" y="72" width="7" height="7" rx="2" fill="#FFD6D6"/>
      <rect x="47" y="83" width="7" height="7" rx="2" fill="#FFD6D6"/>
      <rect x="66" y="83" width="7" height="7" rx="2" fill="#FFD6D6"/>
      <rect x="54" y="92" width="12" height="9" rx="3" fill="#FFB3B3"/>
      <circle cx="92" cy="88" r="3" fill="#fff" opacity=".8"/>
      <circle cx="27" cy="80" r="2" fill="#fff" opacity=".7"/>
    </svg>`;
  }

  function artClipboard() {
    return `<svg class="feature__art" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="fc-paper" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFF4DC"/></linearGradient>
      </defs>
      <ellipse cx="61" cy="102" rx="31" ry="7" fill="rgba(120,80,10,.16)"/>
      <rect x="41" y="27" width="40" height="72" rx="10" fill="url(#fc-paper)"/>
      <rect x="51" y="20" width="20" height="12" rx="6" fill="#F2A51F"/>
      <rect x="48" y="45" width="26" height="4" rx="2" fill="#E4D3AE"/>
      <rect x="48" y="54" width="18" height="4" rx="2" fill="#E4D3AE"/>
      <circle cx="55" cy="74" r="8" fill="#FFE7B0"/>
      <path d="M51 74l3 3 5-6" stroke="#F2A51F" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="78" cy="33" r="5" fill="#FFD36A"/>
      <path d="M78 30v6M75 33h6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="32" cy="72" r="2.6" fill="#fff" opacity=".8"/>
    </svg>`;
  }

  function artHeadset() {
    return `<svg class="feature__art" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="fhd-body" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCEBFF"/></linearGradient>
      </defs>
      <ellipse cx="61" cy="102" rx="33" ry="7" fill="rgba(20,60,120,.2)"/>
      <path d="M40 68V57a21 21 0 0 1 42 0v11" stroke="url(#fhd-body)" stroke-width="8" fill="none" stroke-linecap="round"/>
      <rect x="32" y="61" width="14" height="24" rx="7" fill="url(#fhd-body)"/>
      <rect x="76" y="61" width="14" height="24" rx="7" fill="url(#fhd-body)"/>
      <path d="M82 85c0 6-5 9-12 9" stroke="url(#fhd-body)" stroke-width="5" fill="none" stroke-linecap="round"/>
      <circle cx="92" cy="36" r="11" fill="#fff" opacity=".95"/>
      <path d="M87 33h10M87 38h7" stroke="#2A73E8" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="28" cy="82" r="2.4" fill="#fff" opacity=".8"/>
    </svg>`;
  }

  function artFamily() {
    return `<svg class="home-banner__art" viewBox="0 0 150 120" aria-hidden="true">
      <defs>
        <linearGradient id="fam-shield" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7FD8CE"/><stop offset="1" stop-color="#3C9FE0"/></linearGradient>
        <linearGradient id="fam-dad" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5A9CFF"/><stop offset="1" stop-color="#1B63D5"/></linearGradient>
        <linearGradient id="fam-mom" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5FD0DE"/><stop offset="1" stop-color="#1B8FA8"/></linearGradient>
      </defs>
      <ellipse cx="82" cy="108" rx="52" ry="8" fill="rgba(20,70,110,.12)"/>
      <path d="M78 10 122 26v34c0 27-25 43-44 51-19-8-44-24-44-51V26z" fill="url(#fam-shield)" opacity=".95"/>
      <path d="M78 26v30M63 41h30" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".9"/>
      <g>
        <circle cx="52" cy="68" r="9" fill="#F4C7A4"/>
        <path d="M42 78h20v19c0 4-4 6-10 6s-10-2-10-6z" fill="url(#fam-dad)"/>
        <path d="M43 66a9 9 0 0 1 18 0c0-6-4-9-9-9s-9 3-9 9z" fill="#3A2A24"/>
        <circle cx="79" cy="66" r="9" fill="#F7CFAE"/>
        <path d="M69 76h20l4 23c0 4-5 5-14 5s-14-1-14-5z" fill="url(#fam-mom)"/>
        <path d="M70 65a9 9 0 0 1 18 0c0-7-5-11-9-11s-9 4-9 11z" fill="#4A2F25"/>
        <circle cx="100" cy="82" r="6" fill="#F7CFAE"/>
        <path d="M92 89h16v13c0 3-4 4-8 4s-8-1-8-4z" fill="#FFC85A"/>
      </g>
      <circle cx="31" cy="48" r="4" fill="#fff" opacity=".55"/>
      <circle cx="120" cy="70" r="3" fill="#fff" opacity=".55"/>
    </svg>`;
  }

  const HOME_SERVICES = [
    { id: 'home-long', label: '长期照护', icon: 'i-care', tile: '#E3F7F1' },
    { id: 'home-rehab', label: '术后康复', icon: 'i-pulse', tile: '#E8F1FF' },
    { id: 'home-bath', label: '助浴助洁', icon: 'i-shower', tile: '#F0EAFF' },
    { id: 'home-night', label: '夜间陪护', icon: 'i-moon', tile: '#EAEDFF' },
    { id: 'home-nurse', label: '母婴护理', icon: 'i-baby', tile: '#FFE9F1' },
    { id: 'home-escort', label: '陪诊陪检', icon: 'i-escort', tile: '#E4F8FB' },
    { id: 'hosp-24', label: '院内陪护', icon: 'i-bed', tile: '#E9F1FF' },
    { id: 'hosp-critical', label: '重症专护', icon: 'i-stethoscope', tile: '#FFF3DC' }
  ];

  function homeActiveCard(o) {
    const meta = statusMeta(o);
    const cg = o.caregiverId ? getCaregiver(o.caregiverId) : null;
    const place = o.type === 'home'
      ? (o.address ? `${o.address.city}${o.address.district} ${o.address.detail}` : '待确认服务地址')
      : (o.hospital ? `${o.hospital.name} ${o.hospital.dept || ''} ${o.hospital.bed || ''}` : '待确认住院信息');
    const cgName = cg ? cg.name : '护理员待匹配';
    const cgMeta = cg
      ? `${cg.level} · ${cg.years}年经验`
      : '接单后短信通知';
    return `<button class="home-active" data-nav="#/order/${o.id}">
      <span class="home-active__glow"></span>
      <span class="home-active__head">
        <span class="home-active__eyebrow"><i></i>进行中的服务</span>
        <span class="home-active__status">${meta.label}</span>
      </span>
      <span class="home-active__title">
        <span>${esc(o.title)}</span>${icon('chevR', 'ic-16')}
      </span>
      <span class="home-active__grid">
        <span class="home-active__cell">
          <span class="home-active__label">服务时间</span>
          <span class="home-active__value">${dateLabel(o.appointmentDate)} ${esc(o.startTime)}</span>
        </span>
        <span class="home-active__cell">
          <span class="home-active__label">服务时长</span>
          <span class="home-active__value">${o.qty}${o.unit}</span>
        </span>
      </span>
      <span class="home-active__block">
        <span class="home-active__ic">${icon('pin')}</span>
        <span class="home-active__txt">
          <span class="home-active__label">服务地址</span>
          <span class="home-active__value">${esc(place)}</span>
        </span>
      </span>
      <span class="home-active__cg">
        <span class="home-active__avatar av--${cg ? cg.tone : 'sky'}">${cg ? esc(cg.name.slice(0, 1)) : icon('users')}</span>
        <span class="home-active__cg-main">
          <span class="home-active__cg-name">${esc(cgName)}${cg ? '<em>持证</em>' : ''}</span>
          <span class="home-active__cg-meta">${esc(cgMeta)}</span>
        </span>
        <span class="home-active__cg-more">${cg ? '查看资料' : '查看进度'}${icon('chevR')}</span>
      </span>
    </button>`;
  }

  function viewHome() {
    const active = state.orders.find(o => ['pending', 'accepted', 'serving'].includes(o.status));
    const features = [
      { cls: 'mint', title: '居家照护', sub: '专业护理员上门', nav: '#/services/home', art: artHouse() },
      { cls: 'coral', title: '院内照护', sub: '24 小时全程陪护', nav: '#/services/hospital', art: artHospital() }
    ];

    return {
      tabbar: true,
      tabKey: 'home',
      title: '安颐照护',
      html: `<div class="page home-page">
        <header class="home-top">
          <button class="home-loc" data-act="pick-city">
            ${icon('pin')}${esc(state.profile.city)}${icon('chevD', 'ic-12')}
          </button>
          <div class="home-actions">
            <button class="home-icon" data-act="notify" aria-label="消息">${icon('bell')}<i class="home-dot"></i></button>
            <button class="home-icon" data-act="contact" aria-label="客服">${icon('chat')}</button>
          </div>
        </header>

        ${active ? homeActiveCard(active) : ''}

        <div class="home-features">
          ${features.map(f => `<a class="feature feature--${f.cls}" href="${f.nav}" data-nav="${f.nav}">
            <span class="feature__text">
              <span class="feature__title">${f.title}</span>
              <span class="feature__sub">${f.sub}</span>
            </span>
            <span class="feature__arrow">${icon('arrowR')}</span>
            ${f.art}
          </a>`).join('')}
        </div>

        <section class="home-panel">
          <div class="home-panel__head">
            <h2>照护服务</h2>
            <button data-nav="#/services">全部 ${D.services.length} 项${icon('chevR')}</button>
          </div>
          <div class="home-svc-grid">
            ${HOME_SERVICES.map(s => `<button class="home-svc" data-nav="#/service/${s.id}">
              <span class="ico3d" style="--tile:${s.tile}">
                <span class="ico3d__base"></span>
                <span class="ico3d__disc">${icon(s.icon)}</span>
              </span>
              <span class="home-svc__label">${s.label}</span>
            </button>`).join('')}
          </div>
        </section>

        <button class="home-banner" data-act="contact">
          <span class="home-banner__text">
            <span class="home-banner__title">守护家人 安心照护</span>
            <span class="home-banner__sub">专业照护服务 · 全流程服务管理</span>
            <span class="home-banner__cta">立即咨询${icon('arrowR')}</span>
          </span>
          ${artFamily()}
        </button>

        <footer class="home-foot">安颐照护 · 服务热线 ${PHONE} · ${BRAND.hours}</footer>
      </div>`
    };
  }


  /* ============================================================
     Services list / search
     ============================================================ */
  function viewServices(type) {
    const tab = ['home', 'hospital'].includes(type) ? type : 'all';
    let list = D.services.filter(s => tab === 'all' || s.type === tab);
    if (sortMode === 'rating') list = [...list].sort((a, b) => b.rating - a.rating || b.sold - a.sold);

    const sorts = [
      { v: 'default', label: '综合推荐' },
      { v: 'rating', label: '好评优先' }
    ];

    return {
      tabbar: true,
      tabKey: 'services',
      title: '照护服务',
      html: `<div class="page">
        ${pageHeader('照护服务', {
          sub: '居家与院内，全场景照护',
          right: `<button class="ph__btn" data-nav="#/search" aria-label="搜索">${icon('search')}</button>`
        })}
        <div class="filters">
          <div class="seg">
            <button class="seg__btn ${tab === 'all' ? 'is-on' : ''}" data-nav="#/services">全部</button>
            <button class="seg__btn ${tab === 'home' ? 'is-on' : ''}" data-nav="#/services/home">居家照护</button>
            <button class="seg__btn ${tab === 'hospital' ? 'is-on' : ''}" data-nav="#/services/hospital">院内照护</button>
          </div>
        </div>
        <div class="chips">
          ${sorts.map(s => `<button class="chip ${sortMode === s.v ? 'is-on' : ''}" data-act="sort" data-value="${s.v}">${s.label}</button>`).join('')}
        </div>
        <div class="result-count">共 ${list.length} 项服务 · 持证护理员上门</div>
        <div class="svc-list">${list.map(serviceRow).join('')}</div>
        <div class="tip-band mt16">
          ${icon('info')}
          <span>服务范围与履约方式以照护顾问确认的方案为准；所有服务均含意外险与全程记录。</span>
        </div>
        <footer class="foot">
          <div class="foot__line">需要帮助？致电 ${PHONE} 由照护顾问为您推荐</div>
        </footer>
      </div>`
    };
  }

  function viewSearch() {
    const hot = ['居家照护', '院内陪护', '术后康复', '助浴', '月嫂', '夜间陪护'];
    const results = searchQuery ? searchServices(searchQuery) : [];
    return {
      title: '搜索服务',
      html: `<div class="page">
        <div class="search-head">
          <div class="search-box">
            ${icon('search')}
            <input id="search-input" type="search" enterkeyhint="search" value="${esc(searchQuery)}" placeholder="搜索服务名称或护理需求" autocomplete="off">
          </div>
          <button class="search-cancel" data-act="back">取消</button>
        </div>
        <div id="search-results">${searchResultHtml(results, hot)}</div>
      </div>`
    };
  }

  function searchServices(q) {
    const key = q.trim().toLowerCase();
    if (!key) return [];
    return D.services.filter(s => {
      const hay = [s.name, s.sub, s.intro, ...(s.tags || []), typeName(s.type)].join(' ').toLowerCase();
      return hay.includes(key);
    });
  }

  function searchResultHtml(results, hot) {
    if (!searchQuery.trim()) {
      return `<div class="hot-title">大家都在搜</div>
        <div class="hot-list">${hot.map(h => `<button class="hot-item" data-act="hot-search" data-value="${h}">${h}</button>`).join('')}</div>
        <div class="hot-title">按场景找服务</div>
        <div class="hot-list">
          <button class="hot-item" data-nav="#/services/home">居家照护</button>
          <button class="hot-item" data-nav="#/services/hospital">院内照护</button>
        </div>`;
    }
    if (!results.length) {
      return emptyState('search', '没有找到相关服务', '换个关键词试试，或直接联系照护顾问', `<button class="btn btn--soft" data-act="contact">咨询顾问</button>`);
    }
    return `<div class="result-count">找到 ${results.length} 项相关服务</div>
      <div class="svc-list">${results.map(serviceRow).join('')}</div>`;
  }

  function updateSearchResults() {
    const box = $('#search-results');
    if (!box) return;
    box.innerHTML = searchResultHtml(searchServices(searchQuery), []);
  }

  /* ============================================================
     Service detail
     ============================================================ */
  function viewService(id) {
    const svc = getService(id);
    if (!svc) return { html: `<div class="page">${emptyState('search', '服务不存在', '该服务可能已下架')}</div>` };
    const avg = svc.reviews.length
      ? (svc.reviews.reduce((s, r) => s + r.stars, 0) / svc.reviews.length).toFixed(1)
      : svc.rating;
    const faqs = svc.faqs || [];
    const stepIcons = ['chat', 'calendar', 'users', 'checkC'];

    return {
      title: svc.name,
      actionbar: true,
      html: `<div class="page sd-page">
        <section class="sd-hero">
          <header class="ph ph--float">
            <button class="ph__btn" data-act="back" aria-label="返回">${icon('chevL')}</button>
            <div class="ph__right">
              <button class="ph__btn" data-act="share" aria-label="分享">${icon('send')}</button>
            </div>
          </header>

          <div class="sd-hero__body">
            <span class="sd-hero__type">${typeName(svc.type)} · ${esc(svc.tags[0])}</span>
            <h1>${esc(svc.name)}</h1>
            <p>${esc(svc.sub)}</p>
            <div class="sd-hero__meta">
              <span class="sd-hero__rating">${icon('star', 'ic--fill')} ${Number(svc.rating).toFixed(1)}</span>
              <span>已服务 ${svc.sold} 单</span>
              <span>${esc(state.profile.city)} · 可预约</span>
            </div>
          </div>

          <div class="sd-hero__art">
            <span class="sd-hero__disc">${icon(svc.icon)}</span>
            <span class="sd-hero__spark sd-hero__spark--1"></span>
            <span class="sd-hero__spark sd-hero__spark--2"></span>
          </div>
        </section>

        <div class="sd-benefits">
          <div class="sd-benefit">
            <span class="sd-benefit__ic">${icon('badge')}</span>
            <div><b>持证上岗</b><i>实名认证可查</i></div>
          </div>
          <div class="sd-benefit">
            <span class="sd-benefit__ic">${icon('umbrella')}</span>
            <div><b>服务保险</b><i>每单赠送意外险</i></div>
          </div>
          <div class="sd-benefit">
            <span class="sd-benefit__ic">${icon('clock')}</span>
            <div><b>全程留痕</b><i>服务可追溯</i></div>
          </div>
        </div>

        <div class="sd-body">
          <p class="sd-intro">${esc(svc.intro)}</p>
          <div class="sd-tags">
            ${svc.tags.map(t => `<span>${icon('check', 'ic-12')}${esc(t)}</span>`).join('')}
          </div>

          <section class="sd-card">
            <div class="sd-ribbon">服务包含</div>
            <div class="sd-includes">
              ${svc.includes.map(item => `<div class="sd-include">
                <span class="sd-include__check">${icon('check')}</span>
                <span>${esc(item)}</span>
              </div>`).join('')}
            </div>
          </section>

          <section class="sd-card">
            <div class="sd-ribbon">适合人群</div>
            <div class="sd-suited">
              ${svc.suitable.map(s => `<span>${icon('checkC', 'ic-12')}${esc(s)}</span>`).join('')}
            </div>
          </section>

          <section class="sd-card">
            <div class="sd-ribbon">服务流程</div>
            <div class="sd-steps">
              ${svc.process.map((p, i) => `<div class="sd-step ${i === svc.process.length - 1 ? 'is-last' : ''}">
                <span class="sd-step__icon">${icon(stepIcons[i] || 'checkC')}</span>
                <span class="sd-step__rail"><span class="sd-step__num">${i + 1}</span></span>
                <span class="sd-step__body">
                  <span class="sd-step__title">${esc(p.t)}</span>
                  <span class="sd-step__desc">${esc(p.d)}</span>
                </span>
              </div>`).join('')}
            </div>
          </section>

          <section class="sd-card">
            <div class="sd-ribbon">用户评价</div>
            <div class="sd-rating">
              <div class="sd-rating__score">${avg}</div>
              <div class="sd-rating__main">
                <div class="sd-rating__stars">${starsHtml(Number(avg))}</div>
                <div class="sd-rating__meta">${svc.sold} 个家庭选择 · 好评率 98%</div>
              </div>
              <span class="sd-rating__tag">不满意可更换</span>
            </div>
            <div class="sd-reviews">
              ${svc.reviews.map(reviewCard).join('')}
            </div>
          </section>

          <section class="sd-card">
            <div class="sd-ribbon">常见问题</div>
            <div class="faq-list sd-faq">
              ${faqs.map(f => `<div class="faq">
                <button class="faq__q" data-act="toggle-faq"><span>${esc(f.q)}</span>${icon('chevD')}</button>
                <div class="faq__a">${esc(f.a)}</div>
              </div>`).join('')}
            </div>
          </section>

          <div class="sd-trust">
            <span>${icon('shield')}<b>标准流程</b></span>
            <span>${icon('users')}<b>专业服务</b></span>
            <span>${icon('umbrella')}<b>全程保障</b></span>
            <span>${icon('care')}<b>客户至上</b></span>
          </div>

          <p class="sd-note">本服务由安颐照护持证护理员提供，服务过程含签到、护理记录与签退；具体服务方案请与照护顾问确认。</p>
        </div>

        <div class="actionbar sd-actionbar">
          <button class="btn btn--ghost btn--icon" data-act="contact" aria-label="咨询">${icon('phone')}</button>
          <button class="btn sd-book" style="flex:1" data-nav="#/book/${svc.id}">立即预约</button>
        </div>
      </div>`
    };
  }


  /* ============================================================
     Booking form
     ============================================================ */
  function viewBook(id) {
    const svc = getService(id);
    if (!svc) return { html: `<div class="page">${emptyState('search', '服务不存在', '请返回重新选择服务')}</div>` };
    if (!draft || draft.serviceId !== svc.id) createDraft(svc);
    const isHome = svc.type === 'home';
    const minDate = todayYmd();

    return {
      title: '填写服务信息',
      actionbar: true,
      html: `<form class="page" id="book-form" novalidate>
        <header class="ph ph--center">
          <button class="ph__btn" type="button" data-act="back" aria-label="返回">${icon('chevL')}</button>
          <div class="ph__title">填写服务信息</div>
          <div class="ph__right">
            <button class="ph__ghost" type="button" data-act="contact">需要帮助</button>
          </div>
        </header>

        <div class="booking-steps">
          <div class="steps">
            ${STEPS.map((s, i) => `<div class="step ${i === 0 ? 'is-now' : ''}">
              <div class="step__dot"></div>
              <div class="step__label">${s.label}</div>
            </div>`).join('')}
          </div>
        </div>

        <div class="book-head">
          <div class="book-service">
            ${cover(svc, 'book-service__cover')}
            <div class="grow">
              <div class="book-service__name">${esc(svc.name)}</div>
              <div class="book-service__meta">${typeName(svc.type)} · ${esc(svc.tags[0])}</div>
            </div>
            <button class="book-service__change" type="button" data-nav="#/services/${svc.type}">更换</button>
          </div>
        </div>

        <!-- 01 服务对象 -->
        <section class="form-card">
          <div class="form-card__head">
            <span class="form-card__num">01</span>
            <span class="form-card__title">服务对象</span>
            <span class="form-card__aside">用于护理员匹配</span>
          </div>

          <div class="field" data-wrap="patient.name">
            <div class="field__label">姓名 <span class="req">*</span></div>
            <input class="input" data-field="patient.name" value="${esc(draft.patient.name)}" placeholder="请输入长辈姓名" maxlength="20" autocomplete="off">
            <div class="field__err"></div>
          </div>

          <div class="field">
            <div class="field__label">性别</div>
            <div class="chip-group">
              ${['女', '男'].map(g => `<button type="button" class="chip-opt ${draft.patient.gender === g ? 'is-on' : ''}" data-act="pick" data-group="patient.gender" data-value="${g}">${g}</button>`).join('')}
            </div>
          </div>

          <div class="field" data-wrap="patient.age">
            <div class="field__label">年龄 <span class="req">*</span></div>
            <div class="input-wrap">
              <input class="input" data-field="patient.age" value="${esc(draft.patient.age)}" inputmode="numeric" placeholder="请输入年龄" maxlength="3">
              <span class="input-suffix">岁</span>
            </div>
            <div class="field__err"></div>
          </div>

          <div class="field">
            <div class="field__label">与本人关系</div>
            <div class="chip-group">
              ${['本人', '父亲', '母亲', '配偶', '子女', '其他'].map(r => `<button type="button" class="chip-opt chip-opt--plain ${draft.patient.relation === r ? 'is-on' : ''}" data-act="pick" data-group="patient.relation" data-value="${r}">${r}</button>`).join('')}
            </div>
          </div>

          <div class="field" data-wrap="patient.phone" style="margin-bottom:0">
            <div class="field__label">服务对象电话 <span class="req">*</span></div>
            <input class="input" data-field="patient.phone" value="${esc(draft.patient.phone)}" inputmode="tel" placeholder="用于护理员上门前联系" maxlength="11">
            <div class="field__err"></div>
          </div>
        </section>

        <!-- 02 服务地点 -->
        <section class="form-card">
          <div class="form-card__head">
            <span class="form-card__num">02</span>
            <span class="form-card__title">${isHome ? '服务地址' : '住院信息'}</span>
            <span class="form-card__aside">${isHome ? '护理员上门地址' : '护理员到院陪护'}</span>
          </div>

          ${isHome ? `
            <div class="field" data-wrap="address">
              <div class="field__label">选择地址 <span class="req">*</span></div>
              <div id="addr-list">
                ${state.addresses.map(a => `<button type="button" class="addr ${draft.addressId === a.id ? 'is-on' : ''}" data-act="pick-address" data-id="${a.id}">
                  <span class="addr__radio"></span>
                  <span class="addr__main">
                    <span class="addr__top">${esc(a.name)} ${esc(a.phone)} ${a.tag ? `<span class="addr__tag">${esc(a.tag)}</span>` : ''}</span>
                    <span class="addr__detail">${esc(a.city)}${esc(a.district)} ${esc(a.detail)}</span>
                  </span>
                </button>`).join('')}
                <button type="button" class="addr__add" data-act="add-address">${icon('plus')}新增服务地址</button>
              </div>
              <div class="field__err"></div>
            </div>
          ` : `
            <div class="field" data-wrap="hospital.name">
              <div class="field__label">医院名称 <span class="req">*</span></div>
              <input class="input" data-field="hospital.name" value="${esc(draft.hospital.name)}" placeholder="请输入住院医院名称" maxlength="40">
              <div class="chip-group mt8">
                ${D.hospitals.slice(0, 3).map(h => `<button type="button" class="chip" data-act="fill-hospital" data-value="${esc(h)}">${esc(h)}</button>`).join('')}
              </div>
              <div class="field__err"></div>
            </div>
            <div class="grid-2">
              <div class="field" data-wrap="hospital.dept" style="margin-bottom:0">
                <div class="field__label">科室 / 病区 <span class="req">*</span></div>
                <input class="input" data-field="hospital.dept" value="${esc(draft.hospital.dept)}" placeholder="如：骨科病区" maxlength="20">
                <div class="field__err"></div>
              </div>
              <div class="field" data-wrap="hospital.bed" style="margin-bottom:0">
                <div class="field__label">床号 <span class="req">*</span></div>
                <input class="input" data-field="hospital.bed" value="${esc(draft.hospital.bed)}" placeholder="如：12 床" maxlength="12">
                <div class="field__err"></div>
              </div>
            </div>
            <div class="field" style="margin-top:13px">
              <div class="field__label">住院号（选填）</div>
              <input class="input" data-field="hospital.no" value="${esc(draft.hospital.no)}" placeholder="便于护理员与护士站核对" maxlength="24">
            </div>
          `}
        </section>

        <!-- 03 服务时间 -->
        <section class="form-card">
          <div class="form-card__head">
            <span class="form-card__num">03</span>
            <span class="form-card__title">服务时间</span>
            <span class="form-card__aside">可提前 30 天预约</span>
          </div>

          <div class="field" data-wrap="date">
            <div class="field__label">开始日期 <span class="req">*</span></div>
            <input class="input" type="date" data-field="date" value="${esc(draft.date)}" min="${minDate}">
            <div class="field__err"></div>
          </div>

          <div class="field">
            <div class="field__label">开始时间</div>
            <div class="chip-group">
              ${['08:00', '09:00', '10:00', '14:00', '16:00', '20:00'].map(t => `<button type="button" class="chip-opt chip-opt--plain ${draft.time === t ? 'is-on' : ''}" data-act="pick" data-group="time" data-value="${t}">${t}</button>`).join('')}
            </div>
          </div>

          <div class="field" style="margin-bottom:0">
            <div class="field__label">${svc.unit === '小时' ? '服务时长' : `服务${svc.unit}数`} <span class="req">*</span></div>
            <div class="opt-group" style="grid-template-columns:repeat(${svc.qtyOptions.length >= 4 ? 2 : 3},1fr)">
              ${svc.qtyOptions.map(q => `<button type="button" class="opt ${draft.qty === q.v ? 'is-on' : ''}" data-act="pick" data-group="qty" data-value="${q.v}">
                ${draft.qty === q.v ? '<span class="opt__tick"></span>' : ''}
                <div class="opt__label">${q.label}</div>
                ${q.note ? `<div class="opt__note">${q.note}</div>` : ''}
              </button>`).join('')}
            </div>
            <div class="field__hint">服务时间以照护顾问电话确认为准；连续服务可享长期折扣。</div>
          </div>
        </section>

        <!-- 04 照护需求 -->
        <section class="form-card">
          <div class="form-card__head">
            <span class="form-card__num">04</span>
            <span class="form-card__title">照护需求</span>
            <span class="form-card__aside">帮助匹配护理员</span>
          </div>

          <div class="field">
            <div class="field__label">自理能力</div>
            <div class="chip-group">
              ${['自理', '半自理', '不能自理', '术后康复期'].map(v => `<button type="button" class="chip-opt chip-opt--plain ${draft.selfCare === v ? 'is-on' : ''}" data-act="pick" data-group="selfCare" data-value="${v}">${v}</button>`).join('')}
            </div>
          </div>

          <div class="field">
            <div class="field__label">特殊照护需求（可多选）</div>
            <div class="chip-group">
              ${['鼻饲护理', '导尿护理', '压疮护理', '康复训练', '失智照护', '吸痰护理', '夜间起夜', '用药提醒'].map(n => `<button type="button" class="chip-opt ${draft.needs.includes(n) ? 'is-on' : ''}" data-act="pick" data-group="needs" data-value="${n}">${n}</button>`).join('')}
            </div>
          </div>

          <div class="field" style="margin-bottom:0">
            <div class="field__label">补充说明（选填）</div>
            <textarea class="input" data-field="note" maxlength="120" placeholder="如：行动不便需搀扶、对某类药物过敏、希望女护理员等">${esc(draft.note)}</textarea>
            <div class="field__hint">最多 120 字，照护顾问会与您进一步确认。</div>
          </div>
        </section>

        <!-- 05 联系人 -->
        <section class="form-card">
          <div class="form-card__head">
            <span class="form-card__num">05</span>
            <span class="form-card__title">联系人</span>
            <span class="form-card__aside">用于服务确认</span>
          </div>
          <div class="grid-2">
            <div class="field" data-wrap="contact.name">
              <div class="field__label">联系人 <span class="req">*</span></div>
              <input class="input" data-field="contact.name" value="${esc(draft.contact.name)}" placeholder="姓名" maxlength="20">
              <div class="field__err"></div>
            </div>
            <div class="field" data-wrap="contact.phone">
              <div class="field__label">手机号 <span class="req">*</span></div>
              <input class="input" data-field="contact.phone" value="${esc(draft.contact.phone)}" inputmode="tel" placeholder="11 位手机号" maxlength="11">
              <div class="field__err"></div>
            </div>
          </div>
          <div class="grid-2" style="margin-top:12px">
            <div class="field" style="margin-bottom:0">
              <div class="field__label">紧急联系人（选填）</div>
              <input class="input" data-field="emergency.name" value="${esc(draft.emergency.name)}" placeholder="姓名" maxlength="20">
            </div>
            <div class="field" data-wrap="emergency.phone" style="margin-bottom:0">
              <div class="field__label">紧急联系电话</div>
              <input class="input" data-field="emergency.phone" value="${esc(draft.emergency.phone)}" inputmode="tel" placeholder="手机号" maxlength="11">
              <div class="field__err"></div>
            </div>
          </div>
        </section>

        <button type="button" class="agree ${draft.agree ? 'is-on' : ''}" id="agree-row" data-act="toggle-agree">
          <span class="agree__box">${icon('check', 'ic-12')}</span>
          <span>我已阅读并同意<em>《安颐照护服务协议》</em>与<em>《隐私政策》</em>，确认服务信息真实有效</span>
        </button>

        <div class="actionbar booking-actionbar">
          <button class="btn btn--primary btn--lg btn--block" type="submit">提交订单</button>
        </div>
      </form>`
    };
  }

  function refreshBook() {
    const form = $('#book-form');
    if (!form || !draft) return;

    $$('[data-group]', form).forEach(el => {
      const { group, value } = el.dataset;
      if (group === 'needs') el.classList.toggle('is-on', draft.needs.includes(value));
      else if (group === 'qty') {
        el.classList.toggle('is-on', Number(value) === draft.qty);
        const tick = el.querySelector('.opt__tick');
        if (el.classList.contains('is-on') && !tick) el.insertAdjacentHTML('afterbegin', '<span class="opt__tick"></span>');
        if (!el.classList.contains('is-on') && tick) tick.remove();
      } else {
        el.classList.toggle('is-on', getPath(draft, group) === value);
      }
    });

    $$('[data-act="pick-address"]', form).forEach(el => el.classList.toggle('is-on', el.dataset.id === draft.addressId));

    const agree = $('#agree-row', form);
    if (agree) agree.classList.toggle('is-on', draft.agree);
  }

  function validateBook(svc) {
    const e = {};
    if (!draft.patient.name.trim()) e['patient.name'] = '请填写服务对象姓名';
    if (!String(draft.patient.age).trim()) e['patient.age'] = '请填写年龄';
    else if (!/^\d{1,3}$/.test(String(draft.patient.age).trim()) || +draft.patient.age < 1 || +draft.patient.age > 120) {
      e['patient.age'] = '请输入 1-120 之间的年龄';
    }
    if (!/^1[3-9]\d{9}$/.test(draft.patient.phone.trim())) e['patient.phone'] = '请输入正确的手机号';

    if (svc.type === 'home') {
      if (!draft.addressId) e['address'] = '请选择服务地址';
    } else {
      if (!draft.hospital.name.trim()) e['hospital.name'] = '请填写医院名称';
      if (!draft.hospital.dept.trim()) e['hospital.dept'] = '请填写科室或病区';
      if (!draft.hospital.bed.trim()) e['hospital.bed'] = '请填写床号';
    }

    if (!draft.date) e['date'] = '请选择服务开始日期';
    else if (draft.date < todayYmd()) e['date'] = '服务日期不能早于今天';

    if (!draft.contact.name.trim()) e['contact.name'] = '请填写联系人姓名';
    if (!/^1[3-9]\d{9}$/.test(draft.contact.phone.trim())) e['contact.phone'] = '请输入正确的联系人手机号';
    if (draft.emergency.phone && !/^1[3-9]\d{9}$/.test(draft.emergency.phone.trim())) e['emergency.phone'] = '请输入正确的紧急联系人手机号';
    if (!draft.agree) e['agree'] = '请阅读并同意服务协议';
    return e;
  }

  function showErrors(errors) {
    $$('#book-form [data-wrap]').forEach(el => {
      const msg = errors[el.dataset.wrap];
      el.classList.toggle('field--error', !!msg);
      const slot = el.querySelector('.field__err');
      if (slot && msg) slot.textContent = msg;
    });
    const agree = $('#agree-row');
    if (agree) agree.classList.toggle('field--error', !!errors['agree']);
    const first = $('#book-form .field--error');
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(Object.values(errors)[0]);
  }

  function clearFieldError(el) {
    const wrap = el.closest('[data-wrap]');
    if (wrap) wrap.classList.remove('field--error');
  }

  function submitBooking() {
    if (!draft) return;
    const svc = getService(draft.serviceId);
    const errors = validateBook(svc);
    if (Object.keys(errors).length) {
      showErrors(errors);
      return;
    }
    const calc = calcBook(svc);
    const addr = state.addresses.find(a => a.id === draft.addressId);
    state.seq = (state.seq || 0) + 1;

    const order = {
      id: uid('o'),
      no: 'AY' + todayYmd().replace(/-/g, '') + String(state.seq).padStart(4, '0'),
      serviceId: svc.id,
      type: svc.type,
      title: svc.name,
      price: svc.price,
      unit: svc.unit,
      qty: draft.qty,
      fee: calc.fee,
      discount: calc.discount,
      total: calc.total,
      status: 'pending',
      createdAt: Date.now(),
      appointmentDate: draft.date,
      startTime: draft.time,
      patient: { ...draft.patient, age: Number(draft.patient.age) },
      selfCare: draft.selfCare,
      needs: [...draft.needs],
      hospital: svc.type === 'hospital' ? { ...draft.hospital } : null,
      address: svc.type === 'home' && addr ? { ...addr } : null,
      contact: { ...draft.contact },
      emergency: { ...draft.emergency },
      note: draft.note.trim(),
      coupon: calc.coupon ? { id: calc.coupon.id, title: calc.coupon.title, amount: calc.coupon.amount } : null,
      caregiverId: null,
      events: [{ key: 'created', title: '订单已提交', desc: '等待护理员接单', time: new Date().toISOString() }],
      records: [],
      review: null
    };

    state.orders.unshift(order);
    save();
    draft = null;
    scheduleAutoAccept(order);
    go('/success/' + order.id);
  }

  /* ============================================================
     Success
     ============================================================ */
  function viewSuccess(id) {
    const o = getOrder(id);
    if (!o) return { html: `<div class="page">${emptyState('receipt', '订单不存在', '请前往订单列表查看')}</div>` };
    const addrText = o.type === 'home' && o.address
      ? `${o.address.city}${o.address.district} ${o.address.detail}`
      : (o.hospital ? `${o.hospital.name} ${o.hospital.dept} ${o.hospital.bed}` : '');

    return {
      title: '预约成功',
      html: `<div class="page success">
        <button class="success__close" data-nav="#/" aria-label="返回首页">${icon('close')}</button>
        <div class="success__badge">${icon('check', 'ic-30')}</div>
        <h2>预约提交成功</h2>
        <p class="success__sub">照护顾问将在 30 分钟内致电，确认服务细节</p>

        <div class="success__card">
          <div class="success__rows">
            <div class="kv"><span class="kv__k">订单编号</span><span class="kv__v">${esc(o.no)}</span></div>
            <div class="kv"><span class="kv__k">服务项目</span><span class="kv__v">${esc(o.title)} · ${o.qty}${o.unit}</span></div>
            <div class="kv"><span class="kv__k">服务对象</span><span class="kv__v">${esc(o.patient.name)} ${esc(o.patient.gender)} · ${o.patient.age}岁</span></div>
            <div class="kv"><span class="kv__k">服务时间</span><span class="kv__v">${dateLabel(o.appointmentDate)} ${esc(o.startTime)}</span></div>
            <div class="kv"><span class="kv__k">${o.type === 'home' ? '服务地址' : '住院信息'}</span><span class="kv__v">${esc(addrText)}</span></div>
          </div>
        </div>

        <div class="success__actions">
          <button class="btn btn--primary btn--lg btn--block" data-nav="#/order/${o.id}">查看订单进度</button>
          <button class="btn btn--ghost btn--block" data-nav="#/">返回首页</button>
          <div class="success__links"><button data-act="contact">联系照护顾问</button></div>
        </div>

        <div class="success__note">
          温馨提示：护理员将在服务开始前与您电话确认；如需修改时间或地址，可在订单详情中联系客服。服务开始前 4 小时可免费取消。
        </div>
      </div>`
    };
  }

  /* ============================================================
     Orders list
     ============================================================ */
  const ORDER_TABS = [
    { key: 'all', label: '全部' },
    { key: 'pending', label: '待服务' },
    { key: 'serving', label: '服务中' },
    { key: 'completed', label: '已完成' }
  ];

  function filterOrders(tab) {
    const list = [...state.orders].sort((a, b) => b.createdAt - a.createdAt);
    switch (tab) {
      case 'pending': return list.filter(o => ['pending', 'accepted'].includes(o.status));
      case 'serving': return list.filter(o => o.status === 'serving');
      case 'completed': return list.filter(o => o.status === 'completed');
      default: return list;
    }
  }

  function statusClass(o) {
    if (o.status === 'cancelled') return 'cancelled';
    if (o.status === 'completed') return 'done';
    return '';
  }

  function orderActions(o) {
    if (o.status === 'pending') {
      return `<button class="btn btn--ghost" data-act="cancel" data-id="${o.id}">取消订单</button>
        <button class="btn btn--soft" data-nav="#/order/${o.id}">查看进度</button>`;
    }
    if (o.status === 'accepted') {
      return `<button class="btn btn--ghost" data-act="contact">联系护理员</button>
        <button class="btn btn--soft" data-nav="#/order/${o.id}">查看进度</button>`;
    }
    if (o.status === 'serving') {
      return `<button class="btn btn--ghost" data-act="contact">联系护理员</button>
        <button class="btn btn--soft" data-nav="#/order/${o.id}">服务记录</button>`;
    }
    if (o.status === 'completed') {
      return `<button class="btn btn--ghost" data-act="rebook" data-service="${o.serviceId}">再次预约</button>
        <button class="btn ${o.review ? 'btn--soft' : 'btn--primary'}" data-act="${o.review ? 'view-review' : 'review'}" data-id="${o.id}">${o.review ? '查看评价' : '去评价'}</button>`;
    }
    return `<button class="btn btn--ghost" data-act="contact">联系客服</button>
      <button class="btn btn--primary" data-act="rebook" data-service="${o.serviceId}">重新预约</button>`;
  }

  function orderCard(o) {
    const svc = getService(o.serviceId);
    const meta = statusMeta(o);
    const place = o.type === 'home'
      ? (o.address ? `${o.address.district} ${o.address.detail}` : '')
      : (o.hospital ? `${o.hospital.name} ${o.hospital.dept || ''}` : '');
    return `<div class="ocard">
      <div class="ocard__head">
        ${icon('receipt')}<span>订单 ${esc(o.no)}</span>
        <span class="ocard__status ocard__status--${statusClass(o)}">${meta.label}</span>
      </div>
      <button class="ocard__body" data-nav="#/order/${o.id}">
        ${cover(svc, 'ocard__cover')}
        <div class="grow" style="text-align:left">
          <div class="ocard__name">${esc(o.title)}<span class="ocard__type">${typeName(o.type)}</span></div>
          <div class="ocard__meta-row">
            <div class="ocard__meta ocard__meta--time">${icon('calendar')}<span>${dateLabel(o.appointmentDate)} ${esc(o.startTime)} · ${o.qty}${o.unit}</span></div>
            <div class="ocard__meta ocard__meta--place">${icon('pin')}<span>${esc(place)}</span></div>
          </div>
        </div>
      </button>
      <div class="ocard__foot">
        <div class="ocard__actions">${orderActions(o)}</div>
      </div>
    </div>`;
  }

  function viewOrders(tab) {
    const active = ORDER_TABS.some(t => t.key === tab) ? tab : 'all';
    const list = filterOrders(active);
    return {
      tabbar: true,
      tabKey: 'orders',
      title: '我的订单',
      html: `<div class="page">
        ${pageHeader('我的订单', {
          sub: '服务进度与历史记录',
          right: `<button class="ph__ghost" data-act="contact">客服</button>`
        })}
        <div class="otabs">
          ${ORDER_TABS.map(t => `<button class="otab ${active === t.key ? 'is-on' : ''}" data-nav="#/orders/${t.key}">${t.label}</button>`).join('')}
        </div>
        <div class="order-list">
          ${list.length
            ? list.map(orderCard).join('')
            : emptyState('receipt', '暂无相关订单', '选一项服务，让专业照护帮到家人', `<button class="btn btn--primary" data-nav="#/services">去预约服务</button>`)}
        </div>
        <footer class="foot">
          <div class="foot__line">遇到问题？致电 ${PHONE} 或联系在线客服</div>
        </footer>
      </div>`
    };
  }

  /* ============================================================
     Order detail
     ============================================================ */
  function viewOrder(id) {
    const o = getOrder(id);
    if (!o) return { html: `<div class="page">${emptyState('receipt', '订单不存在', '请返回订单列表查看')}</div>` };
    const svc = getService(o.serviceId);
    const meta = statusMeta(o);
    const cg = o.caregiverId ? getCaregiver(o.caregiverId) : null;
    const states = stepStates(o);
    const events = [...o.events].reverse();
    const addrText = o.type === 'home' && o.address
      ? `${o.address.city}${o.address.district} ${o.address.detail}`
      : '';
    const hospitalText = o.hospital
      ? `${o.hospital.name} ${o.hospital.dept || ''} ${o.hospital.bed || ''}`
      : '';

    if (o.status === 'pending') scheduleAutoAccept(o);

    const heroTitle = o.status === 'accepted' && cg ? `${cg.name} 护理员已接单` : meta.title;
    const heroDesc = o.status === 'accepted' && cg
      ? `将在 ${dateLabel(o.appointmentDate)} ${o.startTime} 为您服务，请保持电话畅通`
      : (o.status === 'cancelled' ? '订单已关闭，如仍需服务可随时重新预约' : meta.desc);

    return {
      title: '订单详情',
      actionbar: true,
      html: `<div class="page">
        <header class="order-hero ${meta.cls ? 'order-hero--' + meta.cls : ''}">
          <div class="order-hero__nav">
            <button class="ph__btn" data-act="back" aria-label="返回">${icon('chevL')}</button>
            <button class="ph__btn" data-act="contact" aria-label="客服">${icon('headset')}</button>
          </div>
          <div class="order-hero__body">
            <span class="order-hero__pill"><i style="width:5px;height:5px;border-radius:50%;background:#2A73E8;display:inline-block"></i>${meta.label}</span>
            <h2>${esc(heroTitle)}</h2>
            <p>${esc(heroDesc)}</p>
            <div class="order-hero__meta">
              ${icon('calendar')}${dateLabel(o.appointmentDate)} ${esc(o.startTime)} · ${o.qty}${o.unit}
            </div>
            <div class="order-hero__no">
              订单号 ${esc(o.no)}
              <button data-act="copy-no" data-no="${esc(o.no)}">${icon('copy')}复制</button>
            </div>
          </div>
        </header>

        <div class="steps-card">
          <div class="steps">
            ${STEPS.map((s, i) => `<div class="step ${states[i] === 'done' ? 'is-done' : ''} ${states[i] === 'now' ? 'is-now' : ''}">
              <div class="step__dot">${states[i] === 'done' ? icon('check') : ''}</div>
              <div class="step__label">${s.label}</div>
            </div>`).join('')}
          </div>
        </div>

        <div class="detail-cards">
          <section class="dcard">
            <div class="dcard__head">
              <div class="dcard__title">订单进度</div>
              <span class="dcard__aside">更新于 ${dateTimeLabel(o.events[o.events.length - 1].time)}</span>
            </div>
            ${events.map((e, i) => `<div class="tl__item ${i === 0 ? 'is-latest' : ''}">
              <span class="tl__dot"></span>
              <div class="tl__main">
                <div class="tl__t">${esc(e.title)}</div>
                ${e.desc ? `<div class="tl__d">${esc(e.desc)}</div>` : ''}
              </div>
              <span class="tl__time">${dateTimeLabel(e.time)}</span>
            </div>`).join('')}
          </section>

          ${cg ? `<section class="dcard">
            <div class="dcard__head">
              <div class="dcard__title">服务护理员</div>
              <span class="dcard__aside">${o.status === 'serving' ? '正在服务' : '已接单'}</span>
            </div>
            <div class="cg">
              <span class="cg__avatar av--${cg.tone}">${esc(cg.name.slice(0, 1))}</span>
              <div class="grow">
                <div class="cg__name">${esc(cg.name)}<span class="cg__badge">${esc(cg.level)}</span></div>
                <div class="cg__meta">${cg.years} 年经验 · 服务 ${cg.orders} 单 · ${Number(cg.rating).toFixed(1)} 分</div>
              </div>
            </div>
            <div class="cg__intro">${esc(cg.intro)}</div>
            <div class="cg__certs">${cg.certs.map(c => `<span class="tag">${icon('badge', 'ic-12')}${esc(c)}</span>`).join('')}</div>
            <div class="cg__actions">
              <button class="btn btn--soft" data-act="contact">${icon('phone')}联系护理员</button>
              <button class="btn btn--ghost" data-act="contact">${icon('chat')}在线沟通</button>
            </div>
          </section>` : (o.status === 'pending' ? `<section class="dcard">
            <div class="dcard__head"><div class="dcard__title">护理员匹配</div><span class="dcard__aside">进行中</span></div>
            <div class="cg">
              <span class="cg__avatar av--sage">${icon('users')}</span>
              <div class="grow">
                <div class="cg__name">正在为您匹配护理员</div>
                <div class="cg__meta">已通知附近 12 位持证护理员，接单后短信通知</div>
              </div>
            </div>
          </section>` : '')}

          ${(o.status === 'serving' || o.status === 'completed') && o.records.length ? `<section class="dcard">
            <div class="dcard__head">
              <div class="dcard__title">服务打卡记录</div>
              <span class="dcard__aside">${o.records.length} 条</span>
            </div>
            ${o.records.map(r => `<div class="rec">
              <span class="rec__time">${esc(r.time)}</span>
              <div class="rec__text"><span class="rec__tag">${esc(r.type)}</span>${esc(r.text)}</div>
            </div>`).join('')}
          </section>` : ''}

          ${o.review ? `<section class="dcard">
            <div class="dcard__head"><div class="dcard__title">我的评价</div><span class="dcard__aside">${esc(dateTimeLabel(o.review.time))}</span></div>
            <div class="row gap8" style="margin-bottom:6px">
              <span style="display:flex;gap:2px;color:#EDA93C">${[1, 2, 3, 4, 5].map(n => icon('star', n <= o.review.stars ? 'ic--fill' : '')).join('')}</span>
              <span class="tiny muted">${o.review.stars}.0</span>
            </div>
            ${o.review.tags && o.review.tags.length ? `<div class="tags" style="margin-bottom:8px">${o.review.tags.map(t => `<span class="tag tag--brand">${esc(t)}</span>`).join('')}</div>` : ''}
            ${o.review.text ? `<div class="review__text">${esc(o.review.text)}</div>` : ''}
          </section>` : ''}

          <section class="dcard">
            <div class="dcard__head"><div class="dcard__title">服务信息</div>
              <span class="dcard__aside">${typeName(o.type)}</span></div>
            <div class="kv"><span class="kv__k">服务项目</span><span class="kv__v">${esc(o.title)} · ${o.qty}${o.unit}</span></div>
            <div class="kv"><span class="kv__k">服务对象</span><span class="kv__v">${esc(o.patient.name)} ${esc(o.patient.gender)} · ${o.patient.age}岁 · ${esc(o.patient.relation)}</span></div>
            <div class="kv"><span class="kv__k">服务时间</span><span class="kv__v">${dateLabel(o.appointmentDate)} ${esc(o.startTime)} 开始</span></div>
            <div class="kv"><span class="kv__k">${o.type === 'home' ? '服务地址' : '住院信息'}</span><span class="kv__v">${esc(o.type === 'home' ? addrText : hospitalText)}</span></div>
            ${o.hospital && o.hospital.no ? `<div class="kv"><span class="kv__k">住院号</span><span class="kv__v">${esc(o.hospital.no)}</span></div>` : ''}
            <div class="kv"><span class="kv__k">自理能力</span><span class="kv__v">${esc(o.selfCare || '未填写')}</span></div>
            <div class="kv"><span class="kv__k">照护需求</span><span class="kv__v">${o.needs && o.needs.length ? o.needs.map(n => `<span class="tag tag--brand" style="margin-left:4px">${esc(n)}</span>`).join('') : '无特殊需求'}</span></div>
            <div class="kv"><span class="kv__k">联系人</span><span class="kv__v">${esc(o.contact.name)} ${esc(o.contact.phone)}</span></div>
            ${o.emergency && o.emergency.phone ? `<div class="kv"><span class="kv__k">紧急联系人</span><span class="kv__v">${esc(o.emergency.name)} ${esc(o.emergency.phone)}</span></div>` : ''}
            ${o.note ? `<div class="kv"><span class="kv__k">备注</span><span class="kv__v">${esc(o.note)}</span></div>` : ''}
          </section>

          <section class="dcard">
            <div class="dcard__head"><div class="dcard__title">订单信息</div></div>
            <div class="kv"><span class="kv__k">订单编号</span><span class="kv__v">${esc(o.no)}<button data-act="copy-no" data-no="${esc(o.no)}" style="margin-left:6px;color:var(--brand);font-size:10px">复制</button></span></div>
            <div class="kv"><span class="kv__k">下单时间</span><span class="kv__v">${dateTimeLabel(o.createdAt)}</span></div>
          </section>

          <div style="height:4px"></div>
        </div>

        <div class="actionbar">${orderActionBar(o)}</div>
      </div>`
    };
  }

  function orderActionBar(o) {
    const gap = 'style="flex:1"';
    if (o.status === 'pending') {
      return `<button class="btn btn--ghost" ${gap} data-act="cancel" data-id="${o.id}">取消订单</button>
        <button class="btn btn--primary" style="flex:1.4" data-act="contact">联系客服</button>`;
    }
    if (o.status === 'accepted') {
      return `<button class="btn btn--ghost" ${gap} data-act="contact">联系护理员</button>
        <button class="btn btn--primary" style="flex:1.4" data-act="start" data-id="${o.id}">确认服务开始</button>`;
    }
    if (o.status === 'serving') {
      return `<button class="btn btn--ghost" ${gap} data-act="contact">联系护理员</button>
        <button class="btn btn--primary" style="flex:1.4" data-act="finish" data-id="${o.id}">确认服务完成</button>`;
    }
    if (o.status === 'completed') {
      return `<button class="btn btn--ghost" ${gap} data-act="rebook" data-service="${o.serviceId}">再次预约</button>
        <button class="btn ${o.review ? 'btn--soft' : 'btn--primary'}" style="flex:1.4" data-act="${o.review ? 'view-review' : 'review'}" data-id="${o.id}">${o.review ? '查看评价' : '评价服务'}</button>`;
    }
    return `<button class="btn btn--ghost" ${gap} data-act="contact">联系客服</button>
      <button class="btn btn--primary" style="flex:1.4" data-act="rebook" data-service="${o.serviceId}">重新预约</button>`;
  }

  /* ============================================================
     Mine
     ============================================================ */
  function viewMine() {
    const counts = {
      pending: state.orders.filter(o => ['pending', 'accepted'].includes(o.status)).length,
      serving: state.orders.filter(o => o.status === 'serving').length,
      completed: state.orders.filter(o => o.status === 'completed').length
    };
    const totalServiced = 6 + counts.completed;

    return {
      tabbar: true,
      tabKey: 'mine',
      title: '我的',
      html: `<div class="page">
        <header class="mine-hero">
          <div class="mine-user">
            <div class="mine-avatar">${esc(state.profile.avatar || '张')}</div>
            <div>
              <div class="mine-name">${esc(state.profile.name)}${state.profile.member ? '<span class="mine-vip">安心会员</span>' : ''}</div>
              <div class="mine-phone">${esc(state.profile.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'))}</div>
            </div>
            <button class="mine-set" data-act="settings" aria-label="设置">${icon('settings')}</button>
          </div>
          <div class="mine-stats">
            <div class="mine-stat"><b>${totalServiced}</b><span>累计服务</span></div>
            <div class="mine-stat"><b>${counts.serving}</b><span>服务中</span></div>
            <div class="mine-stat"><b>${counts.completed}</b><span>已完成</span></div>
          </div>
        </header>

        <div class="mine-card">
          <div class="mine-card__head">
            <div class="mine-card__title">我的订单</div>
            <button class="mine-card__more" data-nav="#/orders">全部订单${icon('chevR')}</button>
          </div>
          <div class="mine-orders">
            <button class="mine-order" data-nav="#/orders/pending">
              ${icon('clock')}待服务${counts.pending ? `<span class="mine-order__badge">${counts.pending}</span>` : ''}
            </button>
            <button class="mine-order" data-nav="#/orders/serving">
              ${icon('care')}服务中${counts.serving ? `<span class="mine-order__badge">${counts.serving}</span>` : ''}
            </button>
            <button class="mine-order" data-nav="#/orders/completed">
              ${icon('checkC')}已完成${counts.completed ? `<span class="mine-order__badge">${counts.completed}</span>` : ''}
            </button>
            <button class="mine-order" data-nav="#/orders">
              ${icon('receipt')}全部订单
            </button>
          </div>
        </div>

        <div class="menu">
          <button class="menu__item" data-act="elders">
            <span class="menu__ic">${icon('users')}</span>长辈档案
            <span class="menu__more">${state.profile.elderCount} 位${icon('chevR')}</span>
          </button>
          <button class="menu__item" data-act="manage-address">
            <span class="menu__ic">${icon('pin')}</span>常用地址
            <span class="menu__more">${state.addresses.length} 个${icon('chevR')}</span>
          </button>
        </div>

        <div class="menu">
          <button class="menu__item" data-act="contact">
            <span class="menu__ic">${icon('headset')}</span>在线客服
            <span class="menu__more">9:00-22:00${icon('chevR')}</span>
          </button>
          <button class="menu__item" data-act="help">
            <span class="menu__ic">${icon('info')}</span>帮助中心
            <span class="menu__more">${icon('chevR')}</span>
          </button>
          <button class="menu__item" data-act="about">
            <span class="menu__ic">${icon('badge')}</span>关于安颐
            <span class="menu__more">v1.0.0${icon('chevR')}</span>
          </button>
        </div>

        <div class="mine-note">
          ${BRAND.name} · ${BRAND.en}<br>
          服务热线 ${PHONE}（${BRAND.hours}）<br>
          演示版本，订单与操作记录保存在本机浏览器
        </div>

        <footer class="foot">
          <div class="foot__line">专业照护，就在身边</div>
        </footer>
      </div>`
    };
  }

  /* ============================================================
     Sheets
     ============================================================ */
  function openCitySheet() {
    openSheet({
      title: '选择服务城市',
      sub: '当前已覆盖 5 个城市主城区',
      body: `<div style="display:flex;flex-wrap:wrap;gap:9px;padding:4px 0 10px">
        ${D.cities.map(c => `<button class="chip-opt ${state.profile.city === c ? 'is-on' : ''}" data-act="choose-city" data-value="${c}">${c}</button>`).join('')}
      </div>
      <p class="sheet__hint">其他城市可联系客服登记，开放后第一时间通知您。</p>`,
      foot: `<button class="btn btn--ghost btn--block" data-act="close-sheet">关闭</button>`
    });
  }

  function openContactSheet() {
    openSheet({
      title: '联系安颐照护',
      sub: `服务时间 ${BRAND.hours}`,
      body: `<div class="pay-summary">
        <div class="pay-summary__label">全国服务热线</div>
        <div class="pay-summary__amount"><b style="font-size:28px;color:var(--brand)">${PHONE}</b></div>
        <div class="tiny muted" style="margin-top:4px">照护顾问 1 对 1 解答</div>
      </div>
      <button class="link-row" data-act="online-chat">
        <span class="link-row__ic">${icon('chat')}</span>在线客服<span class="link-row__val">平均 30 秒响应${icon('chevR')}</span>
      </button>
      <button class="link-row" data-act="help">
        <span class="link-row__ic">${icon('info')}</span>常见问题<span class="link-row__val">${icon('chevR')}</span>
      </button>
      <p class="sheet__hint">急诊或突发情况，请第一时间拨打 120。</p>`,
      foot: `<a class="btn btn--primary btn--block" href="tel:${PHONE_TEL}">${icon('phone')} 拨打 ${PHONE}</a>`
    });
  }

  function openAssessSheet() {
    openSheet({
      title: '免费照护评估',
      sub: '3 分钟了解长辈需要的照护',
      body: `<div class="link-row">
          <span class="link-row__ic">${icon('users')}</span>自理能力与行动情况<span class="link-row__val">1 分钟${icon('chevR')}</span>
        </div>
        <div class="link-row">
          <span class="link-row__ic">${icon('pulse')}</span>常见慢病与用药情况<span class="link-row__val">1 分钟${icon('chevR')}</span>
        </div>
        <div class="link-row">
          <span class="link-row__ic">${icon('home')}</span>居住环境与家属需求<span class="link-row__val">1 分钟${icon('chevR')}</span>
        </div>
        <p class="sheet__hint" style="text-align:left">照护顾问会根据长辈身体情况、居住环境和家庭预算，给出居家或院内的照护建议与服务方案。</p>`,
      foot: `<button class="btn btn--primary btn--block" data-act="contact">联系照护顾问</button>`
    });
  }

  function openFaqSheet() {
    openSheet({
      title: '帮助中心',
      sub: '关于服务与订单的常见问题',
      body: `<div class="faq-list" style="margin-top:2px">
        ${D.faqs.map(f => `<div class="faq">
          <button class="faq__q" data-act="toggle-faq"><span>${esc(f.q)}</span>${icon('chevD')}</button>
          <div class="faq__a">${esc(f.a)}</div>
        </div>`).join('')}
      </div>`,
      foot: `<button class="btn btn--ghost btn--block" data-act="contact">没解决？联系客服</button>`
    });
  }

  function openAboutSheet() {
    openSheet({
      title: `关于${BRAND.name}`,
      body: `<div style="text-align:center;padding:8px 0 4px">
        <div style="width:58px;height:58px;border-radius:18px;background:var(--mint);color:var(--brand);display:grid;place-items:center;margin:0 auto 12px">${icon('care', 'ic-30')}</div>
        <div style="font-size:16px;font-weight:600">${BRAND.name}</div>
        <div class="tiny muted" style="margin-top:4px">${BRAND.slogan} · v1.0.0</div>
      </div>
      <p style="font-size:11.5px;line-height:1.9;color:var(--ink-2);margin-top:14px">
        安颐照护为家庭提供居家照护与院内陪护服务，覆盖长期照护、术后康复、助浴助洁、母婴护理、陪诊陪检等场景。
        所有护理员均经过实名认证、技能考核与背景调查，服务过程含签到、护理记录与签退，全程可追溯。
      </p>
      <div class="kv"><span class="kv__k">服务热线</span><span class="kv__v">${PHONE}</span></div>
      <div class="kv"><span class="kv__k">服务时间</span><span class="kv__v">${BRAND.hours}</span></div>
      <div class="kv"><span class="kv__k">服务城市</span><span class="kv__v">${D.cities.join(' / ')}</span></div>
      <p class="sheet__hint" style="text-align:left;margin-top:12px">本页面为产品演示，订单、接单与服务进度均为模拟。</p>`,
      foot: `<button class="btn btn--ghost btn--block" data-act="close-sheet">知道了</button>`
    });
  }

  function openEldersSheet() {
    openSheet({
      title: '长辈档案',
      sub: '已添加 2 位长辈',
      body: `<div class="addr" style="margin-bottom:8px">
          <span class="cg__avatar av--rose" style="width:42px;height:42px;font-size:15px">李</span>
          <div class="addr__main">
            <div class="addr__top">李桂芳 <span class="addr__tag">母亲</span></div>
            <div class="addr__detail">78 岁 · 半自理 · 膝盖术后康复中</div>
          </div>
        </div>
        <div class="addr" style="margin-bottom:8px">
          <span class="cg__avatar av--sage" style="width:42px;height:42px;font-size:15px">张</span>
          <div class="addr__main">
            <div class="addr__top">张建国 <span class="addr__tag">父亲</span></div>
            <div class="addr__detail">76 岁 · 不能自理 · 骨折住院陪护中</div>
          </div>
        </div>
        <p class="sheet__hint" style="text-align:left">档案信息用于护理员匹配与服务风险评估，演示版暂不支持在线编辑。</p>`,
      foot: `<button class="btn btn--ghost btn--block" data-act="close-sheet">关闭</button>`
    });
  }

  function openAddressSheet() {
    openSheet({
      title: '常用地址',
      sub: '用于居家照护服务上门',
      body: `<div id="address-manage">
        ${state.addresses.map(a => `<div class="addr" style="align-items:flex-start">
          <span class="addr__main">
            <span class="addr__top">${esc(a.name)} ${esc(a.phone)} ${a.tag ? `<span class="addr__tag">${esc(a.tag)}</span>` : ''}</span>
            <span class="addr__detail">${esc(a.city)}${esc(a.district)} ${esc(a.detail)}</span>
          </span>
          <button class="ph__btn" style="width:30px;height:30px;font-size:14px;color:var(--ink-3);border:0;background:#F4F7F4" data-act="delete-address" data-id="${a.id}" aria-label="删除地址">${icon('trash')}</button>
        </div>`).join('')}
      </div>
      <button class="addr__add" data-act="add-address" style="padding-left:2px">${icon('plus')}新增地址</button>
      <p class="sheet__hint" style="text-align:left">演示版最多保存 5 个地址；删除后不可恢复。</p>`,
      foot: `<button class="btn btn--ghost btn--block" data-act="close-sheet">完成</button>`
    });
  }

  function openAddAddressSheet() {
    openSheet({
      title: '新增服务地址',
      sub: '请填写护理员上门地址',
      body: `<div class="field">
          <div class="field__label">联系人 <span class="req">*</span></div>
          <input class="input" id="addr-name" value="${esc(draft ? draft.patient.name : state.profile.name)}" placeholder="长者或家属姓名">
        </div>
        <div class="field">
          <div class="field__label">手机号 <span class="req">*</span></div>
          <input class="input" id="addr-phone" value="${esc(state.profile.phone)}" inputmode="tel" placeholder="11 位手机号" maxlength="11">
        </div>
        <div class="field">
          <div class="field__label">所在区域 <span class="req">*</span></div>
          <input class="input" id="addr-district" placeholder="如：徐汇区田林街道" value="">
        </div>
        <div class="field">
          <div class="field__label">详细地址 <span class="req">*</span></div>
          <input class="input" id="addr-detail" placeholder="小区 / 楼栋 / 门牌号">
        </div>
        <div class="field">
          <div class="field__label">标签</div>
          <div class="chip-group">
            ${['父母家', '我家', '其他'].map((t, i) => `<button type="button" class="chip-opt chip-opt--plain ${i === 0 ? 'is-on' : ''}" data-act="addr-tag" data-value="${t}">${t}</button>`).join('')}
          </div>
        </div>
        <p class="sheet__hint" style="text-align:left">地址仅用于服务匹配与护理员上门，不会对外展示。</p>`,
      foot: `<button class="btn btn--primary btn--block" data-act="save-address">保存地址</button>`
    });
  }

  function openReviewSheet(orderId) {
    const o = getOrder(orderId);
    if (!o) return;
    const tags = ['专业耐心', '准时到达', '沟通顺畅', '细致周到', '环境整洁'];
    const descs = { 1: '很不满意', 2: '不太满意', 3: '一般', 4: '满意', 5: '非常满意' };
    openSheet({
      title: '评价本次服务',
      sub: `${esc(o.title)} · ${esc(o.caregiverId ? getCaregiver(o.caregiverId).name : '护理员')}`,
      body: `<div class="rate-wrap">
        <div class="rate-title">您对本次服务满意吗？</div>
        <div class="rate-stars" id="rate-stars">
          ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-act="rate-star" data-value="${n}" class="is-on">${icon('star', 'ic--fill')}</button>`).join('')}
        </div>
        <div class="rate-desc" id="rate-desc">非常满意</div>
        <div class="rate-tags">
          ${tags.map(t => `<button type="button" class="chip-opt ${t === '专业耐心' ? 'is-on' : ''}" data-act="rate-tag" data-value="${t}">${t}</button>`).join('')}
        </div>
        <textarea class="rate-text" id="rate-text" maxlength="120" placeholder="说说护理员的服务细节，帮助更多家庭（选填）"></textarea>
      </div>`,
      foot: `<button class="btn btn--primary btn--block" data-act="submit-review" data-id="${o.id}">提交评价</button>`
    });
    const starsBox = $('#rate-stars');
    if (starsBox) {
      starsBox.addEventListener('click', ev => {
        const btn = ev.target.closest('[data-act="rate-star"]');
        if (!btn) return;
        const val = Number(btn.dataset.value);
        $$('#rate-stars button').forEach(b => b.classList.toggle('is-on', Number(b.dataset.value) <= val));
        const desc = $('#rate-desc');
        if (desc) desc.textContent = descs[val] || '';
      });
    }
  }

  function openReviewView(o) {
    if (!o.review) return;
    openSheet({
      title: '我的评价',
      sub: `${esc(o.title)} · ${esc(dateTimeLabel(o.review.time))}`,
      body: `<div style="text-align:center;padding:4px 0 12px">
        <div style="display:flex;justify-content:center;gap:3px;color:#EDA93C">${[1, 2, 3, 4, 5].map(n => icon('star', n <= o.review.stars ? 'ic--fill' : '')).join('')}</div>
        <div class="tiny muted" style="margin-top:6px">${o.review.stars}.0 分</div>
      </div>
      ${o.review.tags && o.review.tags.length ? `<div class="rate-tags">${o.review.tags.map(t => `<span class="tag tag--brand">${esc(t)}</span>`).join('')}</div>` : ''}
      ${o.review.text ? `<p style="margin-top:14px;font-size:12px;line-height:1.8;color:var(--ink-2)">${esc(o.review.text)}</p>` : ''}`,
      foot: `<button class="btn btn--ghost btn--block" data-act="close-sheet">关闭</button>`
    });
  }

  /* ============================================================
     Order actions
     ============================================================ */
  const acceptTimers = {};

  function pickCaregiver(order) {
    if (order.serviceId === 'home-nurse') return 'cg-3';
    if (order.serviceId === 'home-rehab') return 'cg-4';
    return order.type === 'hospital' ? 'cg-1' : 'cg-2';
  }

  function scheduleAutoAccept(order) {
    if (!order || order.status !== 'pending' || acceptTimers[order.id]) return;
    acceptTimers[order.id] = setTimeout(() => {
      delete acceptTimers[order.id];
      const o = getOrder(order.id);
      if (!o || o.status !== 'pending') return;
      const cg = getCaregiver(pickCaregiver(o));
      o.status = 'accepted';
      o.caregiverId = cg.id;
      o.events.push({
        key: 'accepted',
        title: '护理员已接单',
        desc: `${cg.name} · ${cg.level} · ${cg.years}年经验`,
        time: new Date().toISOString()
      });
      save();
      if (current.path === '/order/' + o.id || current.path === '/orders' || current.path === '/') {
        render({ preserveScroll: true });
      }
      toast(`${cg.name} 护理员已接单`);
    }, 6500);
  }

  function cancelOrder(id) {
    const o = getOrder(id);
    if (!o) return;
    confirmDialog({
      title: '取消订单',
      text: '取消后需要重新预约，确认取消该订单吗？',
      okText: '确认取消',
      cancelText: '再想想'
    }).then(ok => {
      if (!ok) return;
      o.status = 'cancelled';
      o.cancelledAt = Date.now();
      o.events.push({
        key: 'cancelled',
        title: '订单已取消',
        desc: '订单已关闭，可随时重新预约',
        time: new Date().toISOString()
      });
      save();
      render({ preserveScroll: true });
      toast('订单已取消');
    });
  }

  function startService(id) {
    const o = getOrder(id);
    if (!o) return;
    confirmDialog({
      title: '确认服务开始',
      text: '确认护理员已到岗并开始服务？开始后将按实际服务时长计费。',
      okText: '确认开始'
    }).then(ok => {
      if (!ok) return;
      o.status = 'serving';
      o.startedAt = Date.now();
      o.records = o.records || [];
      o.records.push({ type: '签到', time: hhmm(), text: '护理员已到岗签到，服务开始' });
      o.events.push({
        key: 'serving',
        title: '服务开始',
        desc: '护理员已到岗签到，开始计时服务',
        time: new Date().toISOString()
      });
      save();
      render({ preserveScroll: true });
      toast('服务已开始');
    });
  }

  function finishService(id) {
    const o = getOrder(id);
    if (!o) return;
    confirmDialog({
      title: '确认服务完成',
      text: '确认本次服务已完成？完成后可对护理员进行评价。',
      okText: '确认完成'
    }).then(ok => {
      if (!ok) return;
      o.status = 'completed';
      o.completedAt = Date.now();
      o.records = o.records || [];
      o.records.push({ type: '签退', time: hhmm(), text: '服务结束，护理员已签退并与家属交接' });
      o.events.push({
        key: 'completed',
        title: '服务已完成',
        desc: '家属确认服务完成',
        time: new Date().toISOString()
      });
      save();
      render({ preserveScroll: true });
      toast('服务已完成，请为本次服务评价');
    });
  }

  function submitReview(id) {
    const o = getOrder(id);
    if (!o) return;
    const stars = $$('#rate-stars button.is-on').length || 5;
    const tags = $$('.rate-tags .chip-opt.is-on').map(el => el.dataset.value);
    const textEl = $('#rate-text');
    const text = textEl ? textEl.value.trim() : '';
    o.review = { stars, tags, text, time: new Date().toISOString() };
    o.events.push({
      key: 'reviewed',
      title: '已提交评价',
      desc: `${stars} 星${tags.length ? ' · ' + tags.join(' / ') : ''}`,
      time: new Date().toISOString()
    });
    save();
    closeSheet(true);
    render({ preserveScroll: true });
    toast('感谢您的评价');
  }

  /* ============================================================
     Events
     ============================================================ */
  function handleAction(act, el) {
    switch (act) {
      case 'back': {
        if (history.length > 1) history.back();
        else go('/');
        break;
      }
      case 'sort': {
        sortMode = el.dataset.value;
        render({ preserveScroll: true });
        break;
      }
      case 'toggle-faq': {
        const faq = el.closest('.faq');
        if (faq) faq.classList.toggle('is-open');
        break;
      }
      case 'share': {
        const text = location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(() => toast('链接已复制，可分享给家人'));
        } else {
          toast('请复制浏览器地址分享给家人');
        }
        break;
      }
      case 'pick-city': openCitySheet(); break;
      case 'choose-city': {
        state.profile.city = el.dataset.value;
        save();
        closeSheet(true);
        render({ preserveScroll: true });
        toast(`已切换到${el.dataset.value}`);
        break;
      }
      case 'notify': toast('暂无新消息，服务进度会通过短信通知'); break;
      case 'contact': openContactSheet(); break;
      case 'online-chat': toast('在线客服已上线，将尽快回复您（演示）'); break;
      case 'help': openFaqSheet(); break;
      case 'assess': openAssessSheet(); break;
      case 'about': openAboutSheet(); break;
      case 'settings': toast('设置功能演示中'); break;
      case 'elders': openEldersSheet(); break;
      case 'close-sheet': closeSheet(); break;

      case 'pick': {
        if (!draft) break;
        const group = el.dataset.group;
        const value = el.dataset.value;
        if (group === 'needs') {
          const i = draft.needs.indexOf(value);
          if (i > -1) draft.needs.splice(i, 1);
          else draft.needs.push(value);
        } else if (group === 'qty') {
          draft.qty = Number(value);
          syncCoupon(getService(draft.serviceId));
        } else {
          setPath(draft, group, value);
        }
        refreshBook();
        break;
      }
      case 'pick-address': {
        if (!draft) break;
        draft.addressId = el.dataset.id;
        const wrap = el.closest('[data-wrap="address"]');
        if (wrap) wrap.classList.remove('field--error');
        refreshBook();
        break;
      }
      case 'add-address': openAddAddressSheet(); break;
      case 'addr-tag': {
        const group = el.closest('.chip-group');
        if (group) $$('.chip-opt', group).forEach(b => b.classList.toggle('is-on', b === el));
        break;
      }
      case 'save-address': {
        const name = (($('#addr-name') || {}).value || '').trim();
        const phone = (($('#addr-phone') || {}).value || '').trim();
        const district = (($('#addr-district') || {}).value || '').trim();
        const detail = (($('#addr-detail') || {}).value || '').trim();
        const tagEl = $('.sheet .chip-group .chip-opt.is-on');
        if (!name) { toast('请填写联系人姓名'); break; }
        if (!/^1[3-9]\d{9}$/.test(phone)) { toast('请填写正确的手机号'); break; }
        if (!district || !detail) { toast('请填写完整服务地址'); break; }
        const addr = {
          id: uid('addr'),
          name, phone,
          city: state.profile.city,
          district,
          detail,
          tag: tagEl ? tagEl.dataset.value : '其他'
        };
        state.addresses.push(addr);
        if (draft) {
          draft.addressId = addr.id;
          draft.patient.name = draft.patient.name || name;
          draft.patient.phone = draft.patient.phone || phone;
        }
        save();
        closeSheet(true);
        if (current.path.startsWith('/book/') || current.path === '/mine') render({ preserveScroll: true });
        toast('地址已保存');
        break;
      }
      case 'manage-address': openAddressSheet(); break;
      case 'delete-address': {
        const id = el.dataset.id;
        state.addresses = state.addresses.filter(a => a.id !== id);
        if (draft && draft.addressId === id) draft.addressId = state.addresses[0] ? state.addresses[0].id : '';
        save();
        closeSheet(true);
        if (current.path.startsWith('/book/')) render({ preserveScroll: true });
        toast('地址已删除');
        break;
      }
      case 'fill-hospital': {
        if (!draft) break;
        draft.hospital.name = el.dataset.value;
        const input = $('[data-field="hospital.name"]');
        if (input) { input.value = el.dataset.value; clearFieldError(input); }
        break;
      }
      case 'toggle-agree': {
        if (!draft) break;
        draft.agree = !draft.agree;
        const row = $('#agree-row');
        if (row) {
          row.classList.toggle('is-on', draft.agree);
          if (draft.agree) row.classList.remove('field--error');
        }
        break;
      }
      case 'cancel': cancelOrder(el.dataset.id); break;
      case 'start': startService(el.dataset.id); break;
      case 'finish': finishService(el.dataset.id); break;
      case 'review': openReviewSheet(el.dataset.id); break;
      case 'submit-review': submitReview(el.dataset.id); break;
      case 'view-review': {
        const o = getOrder(el.dataset.id);
        if (o) openReviewView(o);
        break;
      }
      case 'rebook': {
        draft = null;
        go('/book/' + el.dataset.service);
        break;
      }
      case 'copy-no': {
        const no = el.dataset.no || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(no).then(() => toast('订单号已复制'));
        } else {
          toast('订单号：' + no);
        }
        break;
      }
      case 'hot-search': {
        searchQuery = el.dataset.value;
        const input = $('#search-input');
        if (input) input.value = searchQuery;
        updateSearchResults();
        break;
      }
      default: break;
    }
  }

  document.addEventListener('click', ev => {
    const navEl = ev.target.closest('[data-nav]');
    if (navEl) {
      ev.preventDefault();
      go(navEl.dataset.nav);
      return;
    }
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;

    if (act === 'rate-tag') {
      el.classList.toggle('is-on');
      return;
    }
    if (act === 'rate-star') return; // handled in sheet

    handleAction(act, el);
  });

  document.addEventListener('input', ev => {
    const el = ev.target;

    if (el.id === 'search-input') {
      searchQuery = el.value;
      updateSearchResults();
      return;
    }

    const field = el.dataset.field;
    if (field && draft) {
      setPath(draft, field, el.value);
      clearFieldError(el);
      const wrap = el.closest('[data-wrap]');
      if (wrap && wrap.dataset.wrap === 'patient.age') {
        // 年龄仅允许数字
        el.value = el.value.replace(/\D/g, '');
        draft.patient.age = el.value;
      }
      if (field === 'date') {
        const today = todayYmd();
        if (el.value && el.value < today) {
          el.value = today;
          draft.date = today;
          toast('服务日期不能早于今天');
        }
      }
    }
  });

  document.addEventListener('submit', ev => {
    if (ev.target && ev.target.id === 'book-form') {
      ev.preventDefault();
      submitBooking();
    }
  });

  /* ============================================================
     Init
     ============================================================ */
  window.addEventListener('hashchange', () => render());

  render();
  const boot = $('#boot');
  if (boot) {
    setTimeout(() => boot.classList.add('is-hidden'), 350);
    setTimeout(() => boot.remove(), 1100);
  }

  // 暴露少量调试接口，便于自动化验收
  window.__ANYI__ = {
    getState: () => state,
    getDraft: () => draft,
    reset: () => {
      localStorage.removeItem(STORAGE_KEY);
      state = defaultState();
      draft = null;
      go('/');
    }
  };
})();
