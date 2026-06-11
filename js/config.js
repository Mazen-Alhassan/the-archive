// The Archive — shared constants + event bus
export const C = {
  pitch: 44,          // grid spacing between cabinet centers
  cabW: 30, cabH: 16, cabD: 30,
  viewCells: 12,      // cells rendered in each direction around player
  fogDensity: 0.0058,
  lightColor: '#bfe8ee',
  bloom: 0.45,
  camDist: 6.5,
  moveSpeed: 7,
};

// Single event bus between modules + the tweaks bridge
export const bus = new EventTarget();
export function emit(type, detail) { bus.dispatchEvent(new CustomEvent(type, { detail })); }
export function on(type, fn) { bus.addEventListener(type, (e) => fn(e.detail)); }

// Deterministic hash for cell -> ambient user assignment
export function hash2(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177 | 0;
  return Math.abs(h ^ (h >> 16));
}
export function hashStr(s) {
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) | 0;
  return Math.abs(h);
}

// Ambient population: real public GitHub accounts that fill unclaimed cabinets
export const CURATED = [
  'torvalds', 'gaearon', 'sindresorhus', 'mrdoob', 'yyx990803', 'Rich-Harris',
  'tj', 'addyosmani', 'kentcdodds', 'antirez', 'dhh', 'wycats', 'jashkenas',
  'substack', 'isaacs', 'ry', 'fabpot', 'taylorotwell', 'rauchg', 'leerob',
  'shadcn', 'gvanrossum', 'brendangregg', 'mitchellh', 'jessfraz', 'kelseyhightower',
  'tpope', 'junegunn', 'JakeWharton', 'romainguy', 'chriscoyier', 'paulirish',
  'developit', 'lukeed', 'antfu', 'patak-dev', 'sokra', 'zkat', 'ljharb',
  'mafintosh', 'feross', 'dominictarr', 'Raynos', 'maxogden', 'mikeal',
  'bnoordhuis', 'indutny', 'trevnorris', 'cjihrig', 'addaleax',
  'simonw', 'kennethreitz', 'mitsuhiko', 'asottile', 'hynek',
  'dtolnay', 'BurntSushi', 'alexcrichton', 'steveklabnik', 'carllerche',
  'fogleman', 'munificent', 'pganssle', 'nedbat', 'brettcannon',
];
