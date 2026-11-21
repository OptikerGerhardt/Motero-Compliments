#!/usr/bin/env node
// SHA observation only. Never updates the verified compatibility baseline.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const UPSTREAM = 'OptikerGerhardt/Motero';
export const SNAPSHOT_RE = /<!-- motero-upstream-snapshot main=([0-9a-f]{40}) reader=([0-9a-f]{40}) -->/;

export function parseSnapshot(body) {
  const match = String(body || '').match(SNAPSHOT_RE);
  return match ? { main: match[1], reader: match[2] } : null;
}

export function snapshotMarker(main, reader) {
  if (![main, reader].every(s => /^[0-9a-f]{40}$/.test(s))) {
    throw new Error('Invalid SHA pair');
  }
  return '<!-- motero-upstream-snapshot main=' + main + ' reader=' + reader + ' -->';
}

export function candidatePath(filename) {
  return /(reader|crop|bound|geometry|folio|bookmark|annotation|margin|layout|render|pdf|test|setting|fit|scroll)/i.test(String(filename));
}

async function github(path, { token, method = 'GET', body } = {}) {
  const response = await fetch('https://api.github.com' + path, {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'motero-compliments-upstream-monitor',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('GitHub API ' + response.status + ': ' + (result.message || path));
  return result;
}

async function lastObservation(repo, issue, token) {
  let last = null;
  for (let page = 1; page <= 20; page++) {
    const comments = await github('/repos/' + repo + '/issues/' + issue +
      '/comments?per_page=100&page=' + page, { token });
    for (const comment of comments) {
      const snapshot = parseSnapshot(comment.body);
      if (snapshot) last = snapshot;
    }
    if (comments.length < 100) return last;
  }
  throw new Error('Too many issue comments; extend pagination before continuing');
}

async function relevantPaths(previous, current, token) {
  if (!previous || previous === current) return [];
  try {
    const comparison = await github('/repos/' + UPSTREAM + '/compare/' + previous + '...' + current, { token });
    const files = (comparison.files || []).map(f => f.filename).filter(candidatePath);
    const lines = files.slice(0, 12).map(name => '- ' + String(name).replace(/[\r\n]/g, ' '));
    if (files.length > 12) lines.push('- Further candidate files omitted; inspect full diff');
    if ((comparison.files || []).length >= 300) lines.push('- GitHub compare may truncate file lists');
    return lines;
  } catch (error) {
    console.warn('Commit comparison unavailable: ' + error.message);
    return ['- Unable to list changes; inspect commits manually'];
  }
}

function compareUrl(a, b) {
  return a && a !== b ? 'https://github.com/' + UPSTREAM + '/compare/' + a + '...' + b : null;
}

async function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || 'OptikerGerhardt/Motero-Compliments';
  const issue = Number(process.env.TRACKING_ISSUE || 15);
  if (!token) throw new Error('GitHub token is missing');
  if (!Number.isInteger(issue) || issue < 1) throw new Error('Invalid tracking issue');

  const [mainRef, readerRef, previous] = await Promise.all([
    github('/repos/' + UPSTREAM + '/git/ref/heads/main', { token }),
    github('/repos/' + UPSTREAM + '/git/ref/heads/reader', { token }),
    lastObservation(repo, issue, token)
  ]);
  const current = { main: mainRef.object?.sha, reader: readerRef.object?.sha };
  const marker = snapshotMarker(current.main, current.reader);

  if (previous?.main === current.main && previous?.reader === current.reader) {
    console.log('Unchanged upstream SHA pair; no new issue comment.');
    return;
  }
  const [mainPaths, readerPaths] = await Promise.all([
    relevantPaths(previous?.main, current.main, token),
    relevantPaths(previous?.reader, current.reader, token)
  ]);

  const mainLink = compareUrl(previous?.main, current.main);
  const readerLink = compareUrl(previous?.reader, current.reader);
  const lines = [
    '## Automated Motero upstream observation',
    '',
    '**Detection only. No claim of functional compatibility or successful tests.**',
    '',
    '- Android main: ' + current.main + (mainLink ? ' ([diff](' + mainLink + '))' : ' (initial observation)'),
    '- Embedded Reader branch: ' + current.reader + (readerLink ? ' ([diff](' + readerLink + '))' : ' (initial observation)'),
    '',
    '### Candidate paths (filename heuristic only)',
    '**Android:**', ...(mainPaths.length ? mainPaths : ['- No new candidates / first observation']),
    '**Reader:**', ...(readerPaths.length ? readerPaths : ['- No new candidates / first observation']),
    '',
    'Agent 1: inspect relevant upstream changes and tests, create small non-duplicate issues,',
    'and distinguish observed commits from independently verified compatibility.',
    'Do not update the verified baseline automatically.',
    '',
    marker
  ];
  await github('/repos/' + repo + '/issues/' + issue + '/comments', {
    token, method: 'POST', body: { body: lines.join('\n') }
  });
  console.log('Posted upstream observation to issue #' + issue);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
