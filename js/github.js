// The Archive — GitHub REST integration (lazy, cached, optional token)
const API = 'https://api.github.com';
const mem = new Map();
const LS_KEY = 'archive-gh-cache-v1';
const LS_TOKEN = 'archive-gh-token';

let disk = {};
try { disk = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { disk = {}; }
const DISK_TTL = 1000 * 60 * 60 * 6; // 6h

function diskGet(key) {
  const it = disk[key];
  if (it && Date.now() - it.t < DISK_TTL) return it.v;
  return null;
}
function diskSet(key, v) {
  disk[key] = { t: Date.now(), v };
  const keys = Object.keys(disk);
  if (keys.length > 120) delete disk[keys[0]];
  try { localStorage.setItem(LS_KEY, JSON.stringify(disk)); } catch (e) {}
}

export const Github = {
  rate: { remaining: null, limit: null },

  get token() { return localStorage.getItem(LS_TOKEN) || ''; },
  set token(t) { t ? localStorage.setItem(LS_TOKEN, t) : localStorage.removeItem(LS_TOKEN); },

  async _fetch(path) {
    const key = path;
    if (mem.has(key)) return mem.get(key);
    const cached = diskGet(key);
    if (cached) { mem.set(key, cached); return cached; }
    const headers = { 'Accept': 'application/vnd.github+json' };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const res = await fetch(API + path, { headers });
    const rem = res.headers.get('x-ratelimit-remaining');
    const lim = res.headers.get('x-ratelimit-limit');
    if (rem !== null) { this.rate.remaining = +rem; this.rate.limit = +lim; }
    if (res.status === 404) throw Object.assign(new Error('not-found'), { code: 404 });
    if (res.status === 403 || res.status === 429) throw Object.assign(new Error('rate-limited'), { code: 403 });
    if (!res.ok) throw new Error('http-' + res.status);
    const data = await res.json();
    mem.set(key, data); diskSet(key, data);
    return data;
  },

  // Profile for one cabinet
  async user(login) {
    const u = await this._fetch('/users/' + encodeURIComponent(login));
    return {
      login: u.login, name: u.name, avatar: u.avatar_url,
      repos: u.public_repos, followers: u.followers, bio: u.bio,
      created: u.created_at, url: u.html_url,
    };
  },

  // Repositories = drawers (first 100, most recently pushed)
  async repos(login) {
    const list = await this._fetch('/users/' + encodeURIComponent(login) + '/repos?per_page=100&sort=pushed');
    return list
      .map((r) => ({
        name: r.name, desc: r.description, stars: r.stargazers_count,
        forks: r.forks_count, lang: r.language, url: r.html_url,
        updated: r.pushed_at, fork: r.fork,
      }))
      .sort((a, b) => b.stars - a.stars);
  },

  // Search: exact user first, then /search/users
  async resolve(q) {
    q = q.trim().replace(/^@/, '');
    if (!q) throw new Error('empty');
    try { return await this.user(q); } catch (e) {
      if (e.code !== 404) throw e;
    }
    const res = await this._fetch('/search/users?q=' + encodeURIComponent(q) + '&per_page=1');
    if (!res.items || !res.items.length) throw Object.assign(new Error('not-found'), { code: 404 });
    return await this.user(res.items[0].login);
  },
};
