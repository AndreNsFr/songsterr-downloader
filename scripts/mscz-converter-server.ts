#!/usr/bin/env node
/**
 * Local HTTP server for .gp → .mscz conversion
 * Run locally: npm run mscz-server
 * Frontend POSTs .gp file or Songsterr URL, gets .mscz back
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import fs from 'fs';

const PORT = 3001;
const MUSESCORE_PATHS = [
  'C:/Program Files/MuseScore 4/bin/MuseScore4.exe',
  'C:/Program Files/MuseScore 3/bin/MuseScore3.exe',
  'C:/Program Files (x86)/MuseScore 4/bin/MuseScore4.exe',
  'C:/Program Files (x86)/MuseScore 3/bin/MuseScore3.exe',
  join(process.env.LOCALAPPDATA || '', 'Programs/MuseScore 4/bin/MuseScore4.exe'),
  join(process.env.LOCALAPPDATA || '', 'Programs/MuseScore 3/bin/MuseScore3.exe'),
];

function findMuseScore(): string | null {
  for (const path of MUSESCORE_PATHS) {
    if (existsSync(path)) return path;
  }
  return null;
}

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

function sendFile(res: ServerResponse, filePath: string, filename: string) {
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': stat.size,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
}

async function convertGpToMscz(gpPath: string, outputPath: string, mscoreCmd: string): Promise<void> {
  execSync(`"${mscoreCmd}" -o "${outputPath}" "${gpPath}"`, { 
    stdio: 'ignore',
    timeout: 180000
  });
}

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Status endpoint - reports MuseScore availability
  if (req.method === 'GET' && req.url === '/status') {
    const mscoreCmd = findMuseScore();
    let available = false;
    if (mscoreCmd) {
      try {
        execSync(`"${mscoreCmd}" --version`, { stdio: 'ignore' });
        available = true;
      } catch {}
    }
    sendJson(res, 200, {
      status: 'ok',
      museScoreAvailable: available,
      museScorePath: mscoreCmd,
      fallback: available ? null : {
        type: 'musicxml',
        endpoint: '/api/download/byRevisionJsonMusicXml',
        description: 'MuseScore not installed. Download MusicXML instead — MuseScore opens it natively and can save as .mscz'
      }
    });
    return;
  }

  if (req.method !== 'POST' || req.url !== '/convert') {
    sendJson(res, 404, { error: 'Not found. Use GET /status or POST /convert' });
    return;
  }

  const mscoreCmd = findMuseScore();
  let mscoreAvailable = false;
  if (mscoreCmd) {
    try {
      execSync(`"${mscoreCmd}" --version`, { stdio: 'ignore' });
      mscoreAvailable = true;
    } catch {}
  }
  
  if (!mscoreAvailable) {
    sendJson(res, 503, { 
      error: 'MuseScore não instalado',
      code: 'MUSESCORE_NOT_FOUND',
      fallback: {
        type: 'musicxml',
        endpoint: '/api/download/byRevisionJsonMusicXml',
        description: 'Baixe MusicXML — MuseScore abre nativamente e salva como .mscz',
        installUrl: 'https://musescore.org/download'
      }
    });
    return;
  }

  try {
    const body = await parseBody(req);
    const { gpBase64, songTitle, songsterrUrl } = body;

    if (!gpBase64 && !songsterrUrl) {
      sendJson(res, 400, { error: 'Provide gpBase64 or songsterrUrl' });
      return;
    }

    const title = songTitle || 'song';
    const safeTitle = title.replace(/[<>:\"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 100);
    const tempDir = tmpdir();
    const gpPath = join(tempDir, `${safeTitle}_${randomUUID()}.gp`);
    const msczPath = join(tempDir, `${safeTitle}_${randomUUID()}.mscz`);

    // Get .gp content
    let gpBuffer: Buffer;
    if (gpBase64) {
      gpBuffer = Buffer.from(gpBase64, 'base64');
    } else {
      // Download from Songsterr via local dev server
      const response = await fetch('http://localhost:5173/api/download/byRevisionJson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ byLinkUrl: songsterrUrl, songTitle: title })
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Download failed: ${response.status} - ${err}`);
      }
      gpBuffer = Buffer.from(await response.arrayBuffer());
    }

    if (gpBuffer.length === 0) throw new Error('Empty .gp file');

    fs.writeFileSync(gpPath, gpBuffer);

    // Convert
    await convertGpToMscz(gpPath, msczPath, mscoreCmd);

    // Cleanup .gp
    fs.unlinkSync(gpPath);

    // Send .mscz
    sendFile(res, msczPath, `${safeTitle}.mscz`);

    // Cleanup .mscz after sending (delayed)
    setTimeout(() => { try { fs.unlinkSync(msczPath); } catch {} }, 5000);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Conversion error:', msg);
    sendJson(res, 500, { error: msg });
  }
});

server.listen(PORT, () => {
  console.log(`🎵 MSCZ Converter Server running on http://localhost:${PORT}`);
  console.log(`   POST /convert with { gpBase64, songTitle } or { songsterrUrl, songTitle }`);
  console.log(`   Returns .mscz file for download`);
});