// The Archive — overlay UI: intro, search, identity plaque, drawer browser
import { C, emit, on, hashStr } from './config.js';
import { Github } from './github.js';

const $ = (id) => document.getElementById(id);
const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Go: '#00ADD8',
  Rust: '#dea584', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600', Java: '#b07219',
  Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Shell: '#89e051',
  HTML: '#e34c26', CSS: '#563d7c', Vue: '#41b883', Dart: '#00B4AB', Lua: '#000080',
  Zig: '#ec915c', Haskell: '#5e5086', Elixir: '#6e4a7e', Scala: '#c22d40',
};

export class UI {
  constructor(cabinets) {
    this.cabinets = cabinets;
    this.nearCell = null;     // {i,j,login}
    this.nearUser = null;     // fetched profile
    this.panelOpen = false;
    this._fetchSeq = 0;
    this._bind();
  }

  _bind() {
    // intro
    $('intro').addEventListener('click', () => {
      $('intro').classList.add('gone');
      emit('enter');
    });

    // search
    $('search-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = $('search-input').value.trim();
      if (!q) return;
      this.status('LOCATING…');
      try {
        const user = await Github.resolve(q);
        const cell = this._cellFor(user.login);
        this.cabinets.claim(cell.i, cell.j, user.login);
        this.status('CABINET ' + this._cabId(cell.i, cell.j) + ' — TRAVELLING');
        this.closePanel();
        $('search-input').blur();
        emit('travel', { i: cell.i, j: cell.j, user });
      } catch (err) {
        this.status(err.code === 404 ? 'NO RECORD FOUND' : err.code === 403 ? 'RATE LIMITED — ADD A TOKEN' : 'CONNECTION FAILED');
      }
    });
    on('travel-end', () => this.status(''));

    // token popover
    $('token-btn').addEventListener('click', () => {
      $('token-pop').classList.toggle('open');
      $('token-input').value = Github.token;
    });
    $('token-save').addEventListener('click', () => {
      Github.token = $('token-input').value.trim();
      $('token-pop').classList.remove('open');
      this.status(Github.token ? 'TOKEN SAVED' : 'TOKEN CLEARED');
      setTimeout(() => this.status(''), 1800);
    });

    // panel close
    $('panel-close').addEventListener('click', () => this.closePanel());
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape') this.closePanel();
      if (e.code === 'KeyE' && e.target.tagName !== 'INPUT' && this.nearUser && !this.panelOpen) this.openPanel();
    });
    // re-lock pointer when clicking back into the world
    $('panel').addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  // deterministic cabinet cell for a username (reused if already claimed)
  _cellFor(login) {
    for (const key in this.cabinets.claims) {
      if (this.cabinets.claims[key].toLowerCase() === login.toLowerCase()) {
        const [i, j] = key.split(',').map(Number);
        return { i, j };
      }
    }
    const h = hashStr(login.toLowerCase());
    return { i: 1 + (h % 38), j: 1 + (Math.floor(h / 38) % 38) };
  }

  _cabId(i, j) { return String(i).padStart(3, '0') + '-' + String(j).padStart(3, '0'); }

  status(msg) {
    $('search-status').textContent = msg;
    const r = Github.rate;
    $('rate').textContent = r.remaining !== null ? 'API ' + r.remaining + '/' + r.limit : '';
  }

  // ---------- proximity (called from main) ----------
  async approach(i, j) {
    const login = this.cabinets.loginFor(i, j);
    if (this.nearCell && this.nearCell.i === i && this.nearCell.j === j) return;
    this.nearCell = { i, j, login };
    this.nearUser = null;
    const seq = ++this._fetchSeq;

    $('plaque').classList.add('show');
    $('plaque-avatar').style.backgroundImage = '';
    $('plaque-login').textContent = login.toUpperCase();
    $('plaque-meta').textContent = 'CABINET ' + this._cabId(i, j) + ' — RETRIEVING RECORD…';
    $('plaque-hint').textContent = '';

    try {
      const user = await Github.user(login);
      if (seq !== this._fetchSeq) return;
      this.nearUser = user;
      $('plaque-avatar').style.backgroundImage = `url("${user.avatar}")`;
      $('plaque-login').textContent = user.login.toUpperCase();
      $('plaque-meta').textContent =
        (user.name ? user.name + ' — ' : '') + user.repos + ' RECORDS — ' + user.followers + ' FOLLOWERS';
      $('plaque-hint').textContent = 'PRESS E TO OPEN CABINET';
      emit('identified', { i, j, user });
    } catch (err) {
      if (seq !== this._fetchSeq) return;
      $('plaque-meta').textContent = err.code === 403 ? 'RATE LIMITED — ADD A TOKEN (TOP RIGHT)' : 'RECORD UNAVAILABLE';
    }
  }

  leave() {
    if (!this.nearCell) return;
    this.nearCell = null; this.nearUser = null;
    this._fetchSeq++;
    $('plaque').classList.remove('show');
    this.closePanel();
    emit('left');
  }

  // ---------- drawer panel ----------
  async openPanel() {
    if (!this.nearUser) return;
    const user = this.nearUser;
    this.panelOpen = true;
    document.exitPointerLock && document.exitPointerLock();
    $('panel').classList.add('open');
    $('panel-login').textContent = user.login.toUpperCase();
    $('panel-sub').textContent = 'CABINET ' + this._cabId(this.nearCell.i, this.nearCell.j);
    $('panel-list').innerHTML = '<div class="panel-empty">RETRIEVING ' + user.repos + ' RECORDS…</div>';
    $('panel-detail').classList.remove('open');
    try {
      const repos = await Github.repos(user.login);
      if (!this.panelOpen) return;
      this._renderList(repos);
    } catch (err) {
      $('panel-list').innerHTML = '<div class="panel-empty">' +
        (err.code === 403 ? 'RATE LIMITED — ADD A TOKEN' : 'RETRIEVAL FAILED') + '</div>';
    }
  }

  _renderList(repos) {
    const list = $('panel-list');
    list.innerHTML = '';
    if (!repos.length) {
      list.innerHTML = '<div class="panel-empty">EMPTY CABINET</div>';
      return;
    }
    repos.forEach((r) => {
      const row = document.createElement('button');
      row.className = 'repo-row';
      row.innerHTML =
        '<span class="repo-name">' + this._esc(r.name) + '</span>' +
        '<span class="repo-side">' +
        (r.lang ? '<span class="lang-dot" style="background:' + (LANG_COLORS[r.lang] || '#8b949e') + '"></span>' : '') +
        '<span class="repo-stars">★ ' + this._fmt(r.stars) + '</span></span>';
      row.addEventListener('click', () => this._showDetail(r, row));
      list.appendChild(row);
    });
  }

  _showDetail(r, row) {
    document.querySelectorAll('.repo-row.sel').forEach((el) => el.classList.remove('sel'));
    row.classList.add('sel');
    const d = $('panel-detail');
    d.classList.add('open');
    $('detail-name').textContent = r.name;
    $('detail-desc').textContent = r.desc || 'No description.';
    $('detail-meta').innerHTML =
      (r.lang ? '<span><span class="lang-dot" style="background:' + (LANG_COLORS[r.lang] || '#8b949e') + '"></span>' + this._esc(r.lang) + '</span>' : '') +
      '<span>★ ' + this._fmt(r.stars) + '</span><span>⑂ ' + this._fmt(r.forks) + '</span>' +
      (r.fork ? '<span>FORK</span>' : '');
    $('detail-link').href = r.url;
    emit('drawer', { repo: r });
  }

  closePanel() {
    if (!this.panelOpen) return;
    this.panelOpen = false;
    $('panel').classList.remove('open');
    $('panel-detail').classList.remove('open');
    emit('drawer-close');
  }

  _fmt(n) { return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : '' + n; }
  _esc(s) { const d = document.createElement('span'); d.textContent = s || ''; return d.innerHTML; }
}
