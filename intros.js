const fsp = require('fs/promises');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'intros.json');
let cache = null;
let writing = Promise.resolve();

// <br>, \n
function normalize(raw) {
  return String(raw ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .trim();
}

async function load() {
  if (cache) return cache;
  try {
    const buf = await fsp.readFile(FILE, 'utf8');
    cache = JSON.parse(buf);
  } catch {
    cache = {};
  }
  return cache;
}

async function saveAtomic(obj) {
  await fsp.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await fsp.rename(tmp, FILE);
}

async function getIntro(userId) {
  const db = await load();
  return db[String(userId)]?.text ?? null;
}

async function setIntro(userId, rawText, maxLen = 256) {
  const text = normalize(rawText);
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > maxLen) return { ok: false, reason: 'too_long' }; // Length limit

  const db = await load();
  db[String(userId)] = { text, updatedAt: new Date().toISOString() };

  writing = writing.then(() => saveAtomic(db));
  await writing;
  return { ok: true, text };
}

async function deleteIntro(userId) {
  const db = await load();
  const key = String(userId);
  const existed = Boolean(db[key]);
  delete db[key];

  writing = writing.then(() => saveAtomic(db));
  await writing;
  return existed;
}

// Export
module.exports = { getIntro, setIntro, deleteIntro };
