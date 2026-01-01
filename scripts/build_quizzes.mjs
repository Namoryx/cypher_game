import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const TRACK_MAPPING = {
  aggregation: 'aggregation',
  core: 'core',
  paths: 'paths',
  modeling: 'modeling',
};

const FILES = [
  { input: 'data/core/quiz_core.xlsx', output: 'public/quizzes/core.json', expectedTrack: 'core' },
  { input: 'data/aggregation/quiz_aggregation.xlsx', output: 'public/quizzes/aggregation.json', expectedTrack: 'aggregation' },
  { input: 'data/paths/quiz_paths.xlsx', output: 'public/quizzes/paths.json', expectedTrack: 'paths' },
  { input: 'data/modeling/quiz_modeling.xlsx', output: 'public/quizzes/modeling.json', expectedTrack: 'modeling' },
];

function runPythonReader(filePath) {
  const result = execFileSync('python', [resolve('scripts/read_xlsx.py'), resolve(filePath)], {
    encoding: 'utf8',
  });
  return JSON.parse(result);
}

function normalizeTrack(value) {
  const key = (value || '').trim().toLowerCase();
  if (!TRACK_MAPPING[key]) {
    throw new Error(`Unknown track value: "${value}"`);
  }
  return TRACK_MAPPING[key];
}

function splitAndTrim(value = '') {
  return value
    .split('|')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function canComposeAnswer(answer, options) {
  const target = answer.replace(/[\s,]+/g, '');
  if (!target) {
    return false;
  }

  const pieces = options
    .map((opt) => opt.replace(/[\s,]+/g, ''))
    .filter((opt) => opt !== '');

  const memo = new Map();

  function dfs(index) {
    if (index === target.length) return true;
    if (memo.has(index)) return memo.get(index);

    for (const piece of pieces) {
      if (piece.length === 0) continue;
      if (target.startsWith(piece, index) && dfs(index + piece.length)) {
        memo.set(index, true);
        return true;
      }
    }

    memo.set(index, false);
    return false;
  }

  return dfs(0);
}

function ensureRequired(value, fieldName, context) {
  if (value === undefined || value === null || `${value}`.trim() === '') {
    throw new Error(`Missing required field "${fieldName}" for ${context}`);
  }
  return `${value}`.trim();
}

function parseRow(row, context) {
  const id = ensureRequired(row.question_id, 'question_id', context);
  const track = normalizeTrack(ensureRequired(row.track, 'track', context));
  const type = ensureRequired(row.type, 'type', context).toLowerCase();
  if (!['mcq', 'build'].includes(type)) {
    throw new Error(`Unsupported type "${type}" for ${context}`);
  }

  const instruction = ensureRequired(row.instruction, 'instruction', context);
  const hint = (row.hint || '').trim();

  const optionsText = splitAndTrim(row.option_text || '');
  if (optionsText.length === 0) {
    throw new Error(`No options provided for ${context}`);
  }

  const rawOptionImg = row.option_img === undefined || row.option_img === null ? '' : `${row.option_img}`;
  let optionImages = splitAndTrim(rawOptionImg);
  if (rawOptionImg.trim() === '') {
    optionImages = Array(optionsText.length).fill('');
  }
  if (optionImages.length !== optionsText.length) {
    throw new Error(`Option image count does not match option count for ${context}`);
  }

  const options = optionsText.map((text, index) => ({ text, img: optionImages[index] || '' }));

  const answer = ensureRequired(row.correct_answer, 'correct_answer', context);
  if (type === 'mcq') {
    if (!optionsText.includes(answer)) {
      throw new Error(`Answer "${answer}" is not present in options for ${context}`);
    }
  } else if (!canComposeAnswer(answer, optionsText)) {
    throw new Error(`Answer "${answer}" cannot be composed from options for ${context}`);
  }

  const distractors = splitAndTrim(row.distractors || '');
  for (const distractor of distractors) {
    if (!optionsText.includes(distractor)) {
      throw new Error(`Distractor "${distractor}" not present in options for ${context}`);
    }
  }

  const codeContext = (row.code_context || '').trim();

  return {
    id,
    track,
    type,
    instruction,
    hint,
    options,
    answer,
    distractors,
    codeContext,
  };
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function main() {
  const seenIds = new Set();
  for (const file of FILES) {
    const rows = runPythonReader(file.input);
    const normalized = [];
    rows.forEach((row, index) => {
      const context = `${file.input} row ${index + 2}`;
      const parsed = parseRow(row, context);
      if (parsed.track !== file.expectedTrack) {
        throw new Error(`Track "${parsed.track}" does not match expected track "${file.expectedTrack}" for ${context}`);
      }
      if (seenIds.has(parsed.id)) {
        throw new Error(`Duplicate question_id detected: ${parsed.id}`);
      }
      seenIds.add(parsed.id);
      normalized.push(parsed);
    });

    normalized.sort((a, b) => a.id.localeCompare(b.id));

    const outPath = resolve(file.output);
    ensureDir(dirname(outPath));
    writeFileSync(outPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    console.log(`Generated ${file.output} (${normalized.length} records)`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
