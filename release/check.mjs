#!/usr/bin/env node
// Martha release checks. Copies a tree (the working tree, the staged index, or HEAD) into a temp
// folder and checks exactly what would be published:
//   C1 personal data: nothing from release/deny-list.local.txt (kept local, never published)
//   C2 secrets: no credential files, no filled-in secret values, no token-shaped strings
//   C3 references: every file the docs name exists in the tree
//   C4 skill and plugin: SKILL.md frontmatter is valid, `claude plugin validate` and `test` pass
//   C5 README: images resolve, GIFs stay small, the Clawd fan note is present
// Usage: node release/check.mjs [--from worktree|index|head|<commit>] [--only C1,C2] [--list] [--keep] [--no-plugin]
// Exits 1 when any check fails. Without the deny-list, C1 checks only the shapes of personal
// data (emails, phone numbers, street addresses) and says so.
// The pre-commit hook (.githooks/pre-commit) runs `--from index --only C1,C2`; the pre-push hook
// runs `--from <the pushed commit> --only C1,C2` on every push to the public repository.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const from = opt('--from', 'worktree');
const only = opt('--only', '') ? new Set(opt('--only', '').toUpperCase().split(',')) : null;
const wanted = (id) => !only || only.has(id);
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { maxBuffer: 64 << 20 });
const split0 = (b) => b.toString().split('\0').filter(Boolean);

// ---- Export: the exact files that would be published -------------------------------------
// --from head, or any commit or tag, reads that commit's tree.
const rev = from === 'head' ? 'HEAD' : from;
function listFiles() {
  if (from === 'worktree') return split0(git('ls-files', '-co', '--exclude-standard', '-z')).filter((p) => existsSync(join(ROOT, p)));
  if (from === 'index') return split0(git('ls-files', '-z'));
  try {
    git('rev-parse', '--verify', '--quiet', `${rev}^{tree}`);
  } catch {
    throw new Error(`--from must be worktree, index, head or a commit, not ${from}`);
  }
  return split0(git('ls-tree', '-r', '--name-only', '-z', rev));
}
const readOne = (p) => (from === 'worktree' ? readFileSync(join(ROOT, p)) : git('show', `${from === 'index' ? '' : rev}:${p}`));

const OUT = mkdtempSync(join(tmpdir(), 'martha-export-'));
const files = listFiles().sort();
const BINARY = /\.(gif|png|jpe?g|webp|ico|zip|pdf|woff2?)$/i;
const text = new Map();
for (const p of files) {
  const buf = readOne(p);
  const dest = join(OUT, p);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  if (!BINARY.test(p)) text.set(p, buf.toString('utf8'));
}
const fileSet = new Set(files);
const baseNames = new Set(files.map((p) => posix.basename(p)));

const results = [];
const report = (id, title, fails, note = '') => results.push({ id, title, fails, note });
const lineOf = (s, index) => s.slice(0, index).split('\n').length;
const wordRe = (term) => new RegExp(`(?<![A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'gi');

// ---- C1 Personal data ---------------------------------------------------------------------
{
  // Shapes of personal data any household has, checked with or without a deny-list. Made-up
  // values in the docs use example.com addresses and 555 phone numbers.
  const GENERIC = [
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, 'an email address',
      (m) => /@(?:[a-z0-9-]+\.)*example\.(?:com|org|net)$/i.test(m) || /^(?:no-?reply|git)@/i.test(m)],
    [/(?<![\d.-])(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\d.-])/g, 'a phone number',
      (m) => /(?:^|\D)555\D/.test(m)],
    [/\b\d{1,6}\s+(?:[NSEW]\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Boulevard|Blvd|Place|Pl|Terrace|Ter|Circle|Cir|Parkway|Pkwy)\b/g,
      'a street address', () => false],
  ];
  const fails = [];
  for (const [p, body] of text) {
    for (const [re, what, fine] of GENERIC) {
      for (const m of body.matchAll(re)) if (!fine(m[0])) fails.push(`${p}:${lineOf(body, m.index)} ${what}`);
    }
  }
  const denyFile = join(ROOT, 'release', 'deny-list.local.txt');
  if (!existsSync(denyFile)) {
    report('C1', 'personal data', fails, 'emails, phones and addresses only: no release/deny-list.local.txt here');
  } else {
    const terms = [];
    const allowed = new Set();
    for (const raw of readFileSync(denyFile, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^allow\s+(\S+)\s+(.+)$/);
      if (m) allowed.add(`${m[1]}\0${m[2].toLowerCase()}`);
      else terms.push(line);
    }
    for (const p of files) {
      for (const term of terms) {
        if (allowed.has(`${p}\0${term.toLowerCase()}`)) continue;
        if (wordRe(term).test(p)) fails.push(`${p}: the file name contains "${term}"`);
        const body = text.get(p);
        if (body === undefined) continue;
        for (const m of body.matchAll(wordRe(term))) fails.push(`${p}:${lineOf(body, m.index)} "${term}"`);
      }
    }
    report('C1', 'personal data', fails, `${terms.length} terms, plus emails, phones and addresses`);
  }
}

// ---- C2 Secrets -----------------------------------------------------------------------------
{
  const FORBIDDEN = [
    [/(^|\/)\.env(\.|$)/i, 'an .env file'],
    [/credentials[^/]*\.json$/i, 'a credentials file'],
    [/(^|\/)secrets?\.json$/i, 'a secrets file'],
    [/(^|\/)[^/]*token[^/]*\.json$/i, 'a token file'],
    [/(^|\/)settings\.local\.json$/i, 'local Claude settings'],
    [/\.local\.[^/]+$/i, 'a .local. file'],
    [/(^|\/)(martha-config\.md|martha-memory\.json|config\.md|profile-location\.txt)$/i, "a household's own config, memory or profile location"],
    [/(^|\/)tmpclaude-/i, 'a Claude scratch file'],
    [/^\.claude\/plans\//, 'a Claude plan'],
  ];
  // A placeholder starts with a hint word or is written in CAPS_LIKE_THIS (case-sensitive on purpose).
  const isPlaceholder = (v) => /^(your|paste|replace|change|example|placeholder|xxx|\.\.\.|<)/i.test(v) || /^[A-Z0-9_]+$/.test(v);
  // A secret-named key given a value, in JSON, YAML, Python, shell or .env, with any prefix
  // (KROGER_CLIENT_SECRET=...). A value of letters, dots and underscores only is a name in
  // code (refresh_token=refresh_token), not a secret.
  const isName = (v) => /^[A-Za-z_.]+$/.test(v);
  const SECRET = [
    [/(?<![A-Za-z0-9])(?:[A-Za-z0-9]+_)*(client_secret|refresh_token|access_token|app_secret|api_key|apikey|secret_key|password|passwd)['"]?\s*[:=]\s*['"]?([^'"\s,;(){}[\]]{12,})/gi, 'a filled-in secret', 2],
    [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, 'a JSON web token', 0],
    [/\bBearer\s+([A-Za-z0-9._~+/-]{20,})/g, 'a bearer token', 1],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'a private key', 0],
    [/\b(?:ghp_|gho_|github_pat_|sk-ant-|xox[abp]-|pina_)[A-Za-z0-9_-]{16,}/g, 'an API key', 0],
    [/(?<![A-Za-z0-9+_=-])[A-Za-z0-9+_=-]{40,}(?![A-Za-z0-9+_=-])/g, 'a long token-shaped string', 0],
  ];
  const fails = [];
  for (const p of files) for (const [re, what] of FORBIDDEN) if (re.test(p)) fails.push(`${p}: ${what} must not be published`);
  for (const [p, body] of text) {
    for (const [re, what, group] of SECRET) {
      for (const m of body.matchAll(re)) {
        const value = m[group] ?? m[0];
        if (group && (isPlaceholder(value) || isName(value))) continue;
        // A token mixes cases and digits; an alphabet written out (a base64 table) is not one.
        if (what.startsWith('a long') && (!(/[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value)) || /ABCDEFGHIJ|abcdefghij/.test(value))) continue;
        fails.push(`${p}:${lineOf(body, m.index)} ${what}`);
      }
    }
  }
  report('C2', 'secrets', fails);
}

// ---- C3 References --------------------------------------------------------------------------
{
  // Files that live on the user's machine by design, never in the repo.
  const USER_FILES = new Set([
    'martha-config.md', 'martha-memory.json', 'kroger-credentials.json', 'pinterest-credentials.json',
    'settings.json', 'settings.local.json', 'claude_desktop_config.json', 'preview.html', 'index.d.ts',
  ]);
  const EXT = 'md|py|json|html|ts|tsx|mjs|js|gif|png|txt|zip|ya?ml';
  const PATTERNS = [
    new RegExp('`([^`\\s]+?\\.(?:' + EXT + '))`', 'g'),
    /!?\[[^\]]*\]\((?!https?:|mailto:|#)([^)\s#]+)(?:#[^)]*)?\)/g,
    /\b(?:src|srcset|href)="(?!https?:|#|mailto:)([^"\s]+)"/g,
  ];
  const fails = [];
  for (const [doc, body] of text) {
    if (!doc.endsWith('.md')) continue;
    for (const re of PATTERNS) {
      for (const m of body.matchAll(re)) {
        const ref = m[1];
        // Skip absolute paths, templates (<date>, [date], YYYY-MM-DD, {name}, *) and generated types.
        if (/^[A-Za-z]:|^[/~%$]|[\\<>{}*|[\]]|YYYY|^\.\.\.|^\.claude-plugin\/types|^\.claude\/skills\/martha\/config\.md$/.test(ref)) continue;
        const name = posix.basename(ref);
        if (USER_FILES.has(name) || /\.local\./.test(name)) continue;
        const candidates = [posix.normalize(posix.join(posix.dirname(doc), ref)), posix.normalize(ref)];
        if (candidates.some((c) => fileSet.has(c) || files.some((f) => f.startsWith(c.replace(/\/$/, '') + '/')))) continue;
        if (!ref.includes('/') && baseNames.has(name)) continue;
        fails.push(`${doc}:${lineOf(body, m.index)} names ${ref}, which is not in the repo`);
      }
    }
  }
  report('C3', 'references', fails);
}

// ---- C4 Skill and plugin ----------------------------------------------------------------------
{
  const fails = [];
  const skill = '.claude/skills/martha/SKILL.md';
  const body = text.get(skill);
  if (!body) fails.push(`${skill} is missing`);
  else {
    const fm = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm) fails.push(`${skill} has no frontmatter`);
    else {
      const name = (fm[1].match(/^name:\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
      const desc = (fm[1].match(/^description:\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
      if (!name || !/^[a-z0-9-]{1,64}$/.test(name)) fails.push(`${skill}: name "${name}" must be 1-64 lowercase letters, digits or hyphens`);
      else if (/claude|anthropic/.test(name)) fails.push(`${skill}: name "${name}" may not contain "claude" or "anthropic"`);
      if (!desc) fails.push(`${skill}: description is missing`);
      else {
        // 200 is the limit for uploading a skill to Claude (support.claude.com, "Creating custom skills").
        if (desc.replace(/\\"/g, '"').length > 200) fails.push(`${skill}: description is ${desc.length} characters (Claude's skill upload allows 200)`);
        if (/<[^>]+>/.test(desc)) fails.push(`${skill}: description contains an XML-style tag`);
      }
    }
  }
  const market = text.get('.claude-plugin/marketplace.json');
  let pluginDirs = [];
  if (market) {
    for (const pl of JSON.parse(market).plugins ?? []) {
      const dir = posix.normalize(pl.source);
      if (!fileSet.has(`${dir}/.claude-plugin/plugin.json`)) fails.push(`marketplace.json: plugin ${pl.name} points at ${pl.source}, which has no .claude-plugin/plugin.json`);
      else pluginDirs.push(dir);
    }
  }
  if (flag('--no-plugin') || !wanted('C4')) pluginDirs = [];
  for (const dir of pluginDirs) {
    for (const verb of ['validate', 'test']) {
      const r = spawnSync('claude', ['plugin', verb, join(OUT, dir)], { encoding: 'utf8', shell: process.platform === 'win32', timeout: 300000 });
      if (r.status !== 0) fails.push(`claude plugin ${verb} ${dir} failed (exit ${r.status}): ${(r.stdout + r.stderr).trim().split('\n').slice(-6).join(' | ')}`);
    }
  }
  report('C4', 'skill and plugin', fails, flag('--no-plugin') ? 'plugin validate/test skipped (--no-plugin)' : `${pluginDirs.length} plugin(s) validated and tested`);
}

// ---- C5 README ------------------------------------------------------------------------------------
{
  const fails = [];
  const MAX = 3 * 1024 * 1024;
  for (const p of files) {
    if (/\.(gif|png|jpe?g)$/i.test(p)) {
      const size = statSync(join(OUT, p)).size;
      if (size > MAX) fails.push(`${p} is ${(size / 1048576).toFixed(1)} MB (limit 3 MB)`);
    }
  }
  const readme = text.get('README.md');
  if (!readme) fails.push('README.md is missing');
  else if (!/\.gif\b/i.test(readme)) fails.push('README.md shows no GIF yet');
  const NOTE = /not affiliated with or endorsed by Anthropic/i;
  for (const doc of ['README.md', 'mods/chef-clawd/README.md']) {
    const body = text.get(doc);
    if (body && /Clawd/.test(body) && !NOTE.test(body)) fails.push(`${doc} mentions Clawd but lacks the "not affiliated with or endorsed by Anthropic" note`);
  }
  report('C5', 'README', fails);
}

// ---- Report -------------------------------------------------------------------------------------
if (flag('--list')) {
  console.log(`Files (${files.length}) from ${from}:`);
  for (const p of files) console.log(`  ${String(statSync(join(OUT, p)).size).padStart(8)}  ${p}`);
  console.log('');
}
let failed = 0;
for (const r of results.filter((x) => wanted(x.id))) {
  const head = `${r.id} ${r.title}: ${r.fails.length ? `FAIL (${r.fails.length})` : 'ok'}${r.note ? ` - ${r.note}` : ''}`;
  console.log(head);
  for (const f of r.fails.slice(0, 40)) console.log(`   - ${f}`);
  if (r.fails.length > 40) console.log(`   ... and ${r.fails.length - 40} more`);
  failed += r.fails.length ? 1 : 0;
}
if (flag('--keep')) console.log(`\nExport kept at ${OUT}`);
else rmSync(OUT, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed on ${files.length} files from ${from}.` : `\nAll checks passed on ${files.length} files from ${from}.`);
process.exit(failed ? 1 : 0);
