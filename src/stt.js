// Speech to text for WhatsApp voice notes.
//
// Sarvam is tried first: it is built for Indian languages and detects the language by itself.
// OpenAI is the fallback when Sarvam fails. Either key turns voice notes on.
//
//   Sarvam  POST {base}/speech-to-text  header api-subscription-key  multipart file, model, language_code=unknown
//           -> { transcript }. REST accepts up to 30 seconds per request, so longer notes are split with ffmpeg.
//   OpenAI  POST {base}/v1/audio/transcriptions  Bearer key  multipart file, model
//           -> { text }. Its docs list mp3, m4a, wav, webm (not ogg), so ogg/opus is converted with ffmpeg if present.
//
// Audio is held in memory. ffmpeg needs files, so it gets a temp file that is deleted straight away.
// !! Not verified against the live Sarvam / OpenAI APIs (the endpoints and fields come from their docs pages).

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_SECONDS = 90; // longer than this is refused
const SARVAM_LIMIT = 30;

/** Duration of an Ogg/Opus file (what WhatsApp voice notes are) from its last page. Returns null if not Ogg/Opus. */
export function oggOpusSeconds(buf) {
  try {
    if (buf.length < 64 || buf.toString('latin1', 0, 4) !== 'OggS') return null;
    const head = buf.indexOf('OpusHead');
    if (head < 0) return null;
    const preSkip = buf.readUInt16LE(head + 10);
    const last = buf.lastIndexOf('OggS');
    if (last < 0 || last + 14 > buf.length) return null;
    const granule = Number(buf.readBigUInt64LE(last + 6));
    if (!Number.isFinite(granule) || granule <= 0) return null;
    return Math.max(0, (granule - preSkip) / 48000);
  } catch {
    return null;
  }
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

let ffmpegChecked = null;
async function hasFfmpeg() {
  if (ffmpegChecked === null) ffmpegChecked = await run('ffmpeg', ['-version']).then(() => true, () => false);
  return ffmpegChecked;
}

/** ffmpeg helper: converts to 16 kHz mono and, when `segment` is set, cuts into pieces. Returns Buffers. */
async function convert(buffer, { segment = 0, ext = 'wav' } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'saathi-'));
  try {
    await writeFile(join(dir, 'in'), buffer);
    const out = segment ? ['-f', 'segment', '-segment_time', String(segment), join(dir, `out%03d.${ext}`)] : [join(dir, `out000.${ext}`)];
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(dir, 'in'), '-ar', '16000', '-ac', '1', ...out]);
    const files = (await readdir(dir)).filter((f) => f.startsWith('out')).sort();
    return await Promise.all(files.map((f) => readFile(join(dir, f))));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const tooLong = () => Object.assign(new Error('voice note too long'), { code: 'too_long' });

export function createStt(config, fetchFn = fetch) {
  const enabled = Boolean(config.sarvamKey || config.openaiKey);

  async function sarvamOne(buf, mime, ext) {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: mime }), `voice.${ext}`);
    fd.append('model', config.sarvamModel || 'saaras:v4');
    fd.append('language_code', 'unknown');
    const res = await fetchFn(`${config.sarvamBase || 'https://api.sarvam.ai'}/speech-to-text`, {
      method: 'POST',
      headers: { 'api-subscription-key': config.sarvamKey },
      body: fd,
    });
    if (!res.ok) throw new Error(`Sarvam ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    return String(data.transcript || '').trim();
  }

  async function sarvam(buffer, mime, seconds) {
    const ext = /ogg|opus/.test(mime) ? 'ogg' : /mpeg|mp3/.test(mime) ? 'mp3' : /wav/.test(mime) ? 'wav' : /webm/.test(mime) ? 'webm' : /mp4|m4a|aac/.test(mime) ? 'm4a' : 'ogg';
    if (seconds && seconds > SARVAM_LIMIT) {
      if (!(await hasFfmpeg())) throw tooLong();
      const parts = await convert(buffer, { segment: 25, ext: 'wav' });
      const out = [];
      for (const part of parts) out.push(await sarvamOne(part, 'audio/wav', 'wav'));
      return out.filter(Boolean).join(' ');
    }
    return sarvamOne(buffer, mime || 'audio/ogg', ext);
  }

  async function openai(buffer, mime) {
    let buf = buffer;
    let type = mime || 'audio/ogg';
    let name = 'voice.ogg';
    if (/ogg|opus/.test(type) && (await hasFfmpeg())) {
      try {
        buf = (await convert(buffer, { ext: 'mp3' }))[0];
        type = 'audio/mpeg';
        name = 'voice.mp3';
      } catch {
        // conversion failed: send the original, Whisper reads ogg directly
      }
    }
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type }), name);
    fd.append('model', config.openaiModel || 'whisper-1');
    const res = await fetchFn(`${config.openaiBase || 'https://api.openai.com'}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.openaiKey}` },
      body: fd,
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    return String(data.text || '').trim();
  }

  return {
    enabled,
    /** Returns { text, seconds, provider }. Throws an error with code 'too_long' for notes over about 90 seconds. */
    async transcribe(buffer, mime = '') {
      const seconds = oggOpusSeconds(buffer);
      if (seconds && seconds > MAX_SECONDS) throw tooLong();
      let lastErr = null;
      if (config.sarvamKey) {
        try {
          return { text: await sarvam(buffer, mime, seconds), seconds: seconds ?? 15, provider: 'sarvam' };
        } catch (e) {
          if (e.code === 'too_long' && !config.openaiKey) throw e;
          lastErr = e;
          console.error('Sarvam STT failed:', e.message);
        }
      }
      if (config.openaiKey) return { text: await openai(buffer, mime), seconds: seconds ?? 15, provider: 'openai' };
      throw lastErr || new Error('no speech-to-text provider');
    },
  };
}
