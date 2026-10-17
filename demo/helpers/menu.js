/**
 * Settings panel helper for the main demo
 * Styles live in demo/index.html under "settings panels"
 */

let instance = 0;

let theme = {
  chartLine: '#22d3ee',
  chartFill: 'rgba(167, 139, 250, 0.28)',
  chartText: '#8d92a6',
};

const escape = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function rangeFill(input) {
  const min = parseFloat(input.min);
  const max = parseFloat(input.max);
  const pct = max > min ? (100 * (parseFloat(input.value) - min)) / (max - min) : 0;
  input.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
}

class Menu {
  constructor(parent, title, position, userTheme) {
    if (userTheme) theme = { ...theme, ...userTheme };
    this.createMenu(parent, title, position);
    this.id = 0;
    this.instance = instance;
    instance++;
    this.hidden = false;
  }

  createMenu(parent, title = '', position = { top: null, left: null, bottom: null, right: null }) {
    /** @type {HTMLDivElement} */
    this.menu = document.createElement('div');
    this.menu.id = `menu-${instance}`;
    this.menu.className = 'menu closed';
    this.menu.setAttribute('role', 'dialog');
    if (position) {
      if (position.top) this.menu.style.top = `${position.top}`;
      if (position.bottom) this.menu.style.bottom = `${position.bottom}`;
      if (position.left) this.menu.style.left = `${position.left}`;
      if (position.right) this.menu.style.right = `${position.right}`;
    }
    if (title) this.addHeader(title);
    this.container = document.createElement('div');
    this.container.id = `menu-container-${instance}`;
    this.container.className = 'menu-container';
    this.menu.appendChild(this.container);
    if (typeof parent === 'object') parent.appendChild(this.menu);
    else document.getElementById(parent).appendChild(this.menu);
  }

  get newID() {
    this.id++;
    return `menu-${this.instance}-${this.id}`;
  }

  get ID() {
    return `menu-${this.instance}-${this.id}`;
  }

  get width() {
    return this.menu ? this.menu.offsetWidth : 0;
  }

  get height() {
    return this.menu ? this.menu.offsetHeight : 0;
  }

  hide() {
    this.menu?.classList.add('closed');
  }

  show() {
    this.menu?.classList.remove('closed');
  }

  visible() {
    return this.menu ? !this.menu.classList.contains('closed') : false;
  }

  toggle() {
    if (this.visible()) this.hide();
    else this.show();
    return this.visible();
  }

  /** panel header with icon, title and subtitle; icon is an id of an svg symbol defined in index.html */
  addHeader(title, subtitle = '', icon = '') {
    const el = document.createElement('div');
    el.className = 'menu-header';
    el.innerHTML = `
      ${icon ? `<div class="menu-header-icon"><svg class="i"><use href="#${icon}"/></svg></div>` : ''}
      <div><div class="menu-header-title">${escape(title)}</div>${subtitle ? `<div class="menu-header-sub">${escape(subtitle)}</div>` : ''}</div>`;
    this.menu.insertBefore(el, this.container || null);
    return el;
  }

  addTitle(title) {
    return this.addLabel(title);
  }

  addLabel(title) {
    const el = document.createElement('div');
    el.className = 'menu-label';
    el.id = this.newID;
    el.innerText = title;
    if (this.container) this.container.appendChild(el);
    return el;
  }

  addBool(title, object, variable, callback) {
    const el = document.createElement('label');
    el.className = 'menu-item menu-switch';
    el.htmlFor = this.newID;
    el.innerHTML = `<span class="menu-text">${escape(title)}</span><input type="checkbox" role="switch" id="${this.ID}" ${object[variable] ? 'checked' : ''}/><span class="switch" aria-hidden="true"></span>`;
    if (this.container) this.container.appendChild(el);
    el.addEventListener('change', (evt) => {
      if (evt.target) {
        object[variable] = evt.target['checked'];
        if (callback) callback(evt.target['checked']);
      }
    });
    return el;
  }

  async addList(title, items, selected, callback) {
    const el = document.createElement('div');
    el.className = 'menu-item';
    const options = items.map((item) => `<option value="${escape(item)}" ${item === selected ? 'selected' : ''}>${escape(item)}</option>`).join('');
    el.innerHTML = `<span class="menu-text">${escape(title)}</span><select id="${this.newID}" title="${escape(title)}" class="menu-list-item">${options}</select>`;
    if (this.container) this.container.appendChild(el);
    el.addEventListener('change', (evt) => {
      if (callback && evt.target) callback(items[evt.target['selectedIndex']]);
    });
    return el;
  }

  addRange(title, object, variable, min, max, step, callback) {
    const el = document.createElement('div');
    el.className = 'menu-item menu-range-item';
    el.innerHTML = `
      <div class="menu-range-head"><span>${escape(title)}</span><output>${object[variable]}</output></div>
      <input class="menu-range" type="range" title="${escape(title)}" id="${this.newID}" min="${min}" max="${max}" step="${step}" value="${object[variable]}">`;
    if (this.container) this.container.appendChild(el);
    const input = el.querySelector('input');
    const output = el.querySelector('output');
    rangeFill(input);
    input.addEventListener('input', () => {
      output.value = input.value;
      rangeFill(input);
    });
    el.addEventListener('change', (evt) => {
      if (evt.target) {
        object[variable] = parseInt(evt.target['value']) === parseFloat(evt.target['value']) ? parseInt(evt.target['value']) : parseFloat(evt.target['value']);
        evt.target.setAttribute('value', evt.target['value']);
        if (callback) callback(evt.target['value']);
      }
    });
    el['input'] = input;
    el['setValue'] = (val) => { // update slider without triggering callbacks
      input.value = val;
      input.setAttribute('value', val);
      output.value = val;
      rangeFill(input);
    };
    return el;
  }

  addHTML(html) {
    const el = document.createElement('div');
    el.className = 'menu-item';
    el.id = this.newID;
    if (html) el.innerHTML = html;
    if (this.container) this.container.appendChild(el);
    return el;
  }

  addButton(titleOn, titleOff, callback) {
    const el = document.createElement('button');
    el.className = 'menu-item menu-button';
    el.type = 'button';
    el.id = this.newID;
    el.innerText = titleOn;
    if (this.container) this.container.appendChild(el);
    el.addEventListener('click', () => {
      if (el.innerText === titleOn) el.innerText = titleOff;
      else el.innerText = titleOn;
      if (callback) callback(el.innerText !== titleOn);
    });
    return el;
  }

  addValue(title, val, suffix = '') {
    const el = document.createElement('div');
    el.className = 'menu-item';
    el.id = `menu-val-${title}`;
    el.innerText = `${title}: ${val}${suffix}`;
    if (this.container) this.container.appendChild(el);
    return el;
  }

  updateValue(title, val, suffix = '') {
    const el = document.getElementById(`menu-val-${title}`);
    if (el) el.innerText = `${title}: ${val}${suffix}`;
    else this.addValue(title, val);
  }

  addChart(title, id, width, height, color) {
    if (color) theme.chartLine = color;
    width = width || 300; // eslint-disable-line no-param-reassign
    height = height || 64; // eslint-disable-line no-param-reassign
    const el = document.createElement('div');
    el.className = 'menu-item menu-chart-title';
    el.id = this.newID;
    el.innerHTML = `<div class="menu-range-head"><span>${escape(title)}</span><output id="menu-chart-value-${id}">-</output></div><canvas id="menu-canvas-${id}" class="menu-chart-canvas" width="${width}" height="${height}"></canvas>`;
    if (this.container) this.container.appendChild(el);
    return el;
  }

  async updateChart(id, values) {
    if (!values || (values.length === 0) || !this.visible()) return;
    /** @type {HTMLCanvasElement} */
    const canvas = document.getElementById(`menu-canvas-${id}`);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    const max = Math.max(1, ...values) * 1.15;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const points = values.map((v, i) => [i * step, height - (v / max) * (height - 6) - 3]);
    ctx.clearRect(0, 0, width, height);
    const fill = ctx.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, theme.chartFill);
    fill.addColorStop(1, 'rgba(167, 139, 250, 0)');
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (const [x, y] of points) ctx.lineTo(x, y);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = theme.chartLine;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    const last = values[values.length - 1];
    const label = document.getElementById(`menu-chart-value-${id}`);
    if (label) label.value = `${Math.round(10 * last) / 10} fps`;
  }
}

export default Menu;
