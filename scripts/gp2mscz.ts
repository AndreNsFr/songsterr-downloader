#!/usr/bin/env node
/**
 * Convert .gp (Guitar Pro) to .mscz (MuseScore) using local MuseScore
 * Supports both: downloading from app via URL, or converting local .gp file
 * 
 * Usage:
 *   npm run gp2mscz <songsterr-url|local-gp-path> [song-title]
 *   npm run gp2mscz "https://www.songsterr.com/a/wsa/..." "My Song"
 *   npm run gp2mscz "E:/Downloads/song.gp" "My Song"
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, basename, extname, join } from 'path';
import fs from 'fs';

const APP_URL = 'http://localhost:5173';

function findMuseScore(): string {
  if (process.platform === 'win32') {
    const possiblePaths = [
      'C:/Program Files/MuseScore 4/bin/MuseScore4.exe',
      'C:/Program Files/MuseScore 3/bin/MuseScore3.exe',
      'C:/Program Files (x86)/MuseScore 4/bin/MuseScore4.exe',
      'C:/Program Files (x86)/MuseScore 3/bin/MuseScore3.exe',
      join(process.env.LOCALAPPDATA || '', 'Programs/MuseScore 4/bin/MuseScore4.exe'),
      join(process.env.LOCALAPPDATA || '', 'Programs/MuseScore 3/bin/MuseScore3.exe'),
    ];
    for (const path of possiblePaths) {
      if (existsSync(path)) return path;
    }
    return 'MuseScore4.exe';
  }
  return 'mscore';
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:\"/\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 200);
}

function extractTitleFromUrl(url: string): string {
  const match = url.match(/tab-([^?/]+)/);
  return match ? match[1].replace(/-/g, ' ') : 'song';
}

function extractTitleFromPath(path: string): string {
  return basename(path, extname(path)).replace(/_/g, ' ');
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Convert .gp (Guitar Pro) to .mscz (MuseScore) using local MuseScore

Usage:
  npm run gp2mscz <songsterr-url|local-gp-path> [song-title]

Arguments:
  input          Songsterr URL OR local .gp file path
  song-title     Optional title (default: extracted from input)

Examples:
  # From Songsterr URL (downloads .gp from app, then converts)
  npm run gp2mscz "https://www.songsterr.com/a/wsa/..." "My Song"

  # From local .gp file (converts directly)
  npm run gp2mscz "E:/Downloads/song.gp" "My Song"
  npm run gp2mscz "E:/Downloads/song.gp"
`);
    process.exit(0);
  }

  const input = args[0];
  const customTitle = args[1];
  
  const isUrl = input.includes('songsterr.com');
  const isLocalGp = input.toLowerCase().endsWith('.gp') && existsSync(input);

  if (!isUrl && !isLocalGp) {
    console.error('❌ Input deve ser uma URL do Songsterr OU um caminho para arquivo .gp local');
    console.error('   Exemplos:');
    console.error('   URL: https://www.songsterr.com/a/wsa/...');
    console.error('   Arquivo: E:/Downloads/song.gp');
    process.exit(1);
  }

  // Find MuseScore
  const mscoreCmd = findMuseScore();
  let mscoreAvailable = false;
  try {
    execSync(`"${mscoreCmd}" --version`, { stdio: 'ignore' });
    mscoreAvailable = true;
  } catch {
    console.warn('⚠️  MuseScore não encontrado. Vou baixar o .gp e oferecer alternativas.');
    console.warn('   Instale MuseScore 4.x: https://musescore.org/download');
    console.warn('   Windows: C:/Program Files/MuseScore 4/bin');
    console.warn('   Linux:   sudo apt install musescore4');
    console.warn('   macOS:   brew install --cask musescore');
  }

  // Determine output filename
  let title: string;
  let gpPath: string;
  let isTempGp = false;

  if (isLocalGp) {
    // Convert local .gp file directly
    gpPath = resolve(input);
    title = customTitle || extractTitleFromPath(input);
    console.log(`🎵 Convertendo .gp local: ${gpPath}`);
  } else {
    // Download .gp from app first
    title = customTitle || extractTitleFromUrl(input);
    const safeTitle = sanitizeFilename(title);
    const tempGpPath = resolve(`${safeTitle}.gp`);
    
    console.log(`🎵 Baixando .gp de: ${input}`);
    
    try {
      const response = await fetch(`${APP_URL}/api/download/byRevisionJson`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ byLinkUrl: input, songTitle: title })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Falha no download: ${response.status} - ${err}`);
      }

      const gpBuffer = Buffer.from(await response.arrayBuffer());
      if (gpBuffer.length === 0) throw new Error('Arquivo .gp vazio');

      fs.writeFileSync(tempGpPath, gpBuffer);
      console.log(`✅ .gp salvo (${gpBuffer.length} bytes)`);
      gpPath = tempGpPath;
      isTempGp = true;
    } catch (error) {
      console.error('❌ Erro no download:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  const safeTitle = sanitizeFilename(title);
      // Output to temp directory to avoid Vite watching project root
      const outputDir = process.platform === 'win32'
        ? process.env.TEMP || 'C:/tmp'
        : '/tmp';
      const outputPath = join(outputDir, `${safeTitle}.mscz`);

    if (!mscoreAvailable) {
      // FALLBACK: MuseScore not installed - save .gp and offer MusicXML
      const gpOutputPath = join(outputDir, `${safeTitle}.gp`);
      if (!isLocalGp) {
        // .gp was already downloaded to tempGpPath, copy to output
        fs.copyFileSync(gpPath, gpOutputPath);
      } else {
        console.log(`\n📁 Arquivo .gp original: ${gpPath}`);
      }
    
      console.log(`\n⚠️  MuseScore não está instalado — não consigo converter para .mscz automaticamente.`);
      console.log(`\n📥 Baixei o arquivo .gp em: ${isLocalGp ? gpPath : gpOutputPath}`);
      console.log(`\n🔧 Opções para converter para .mscz:`);
      console.log(`   1. Instale o MuseScore 4: https://musescore.org/download`);
      console.log(`      Depois rode: npm run gp2mscz "${isUrl ? input : gpPath}" "${title}"`);
      console.log(`   2. Baixe MusicXML (MuseScore abre nativamente e salva como .mscz):`);
      if (isUrl) {
        console.log(`      curl -X POST ${APP_URL}/api/download/byRevisionJsonMusicXml \\`);
        console.log(`        -H "Content-Type: application/json" \\`);
        console.log(`        -d '{"byLinkUrl":"${input}","songTitle":"${title}"}' \\`);
        console.log(`        -o "${safeTitle}.musicxml"`);
      }
      console.log(`   3. Abra o .gp no Guitar Pro e exporte como .mscz manualmente`);
    
      if (isTempGp && existsSync(gpPath)) fs.unlinkSync(gpPath);
      process.exit(0);
    }

      console.log(`📁 Saída: ${outputPath}`);
      console.log(`🔄 Convertendo .gp → .mscz com MuseScore...`);

  try {
    execSync(`"${mscoreCmd}" -o "${outputPath}" "${gpPath}"`, { 
      stdio: 'inherit',
      timeout: 120000
    });

    if (isTempGp && existsSync(gpPath)) fs.unlinkSync(gpPath);

    console.log(`\n✅ Pronto! Arquivo criado: ${outputPath}`);
    
  } catch (error) {
    console.error('\n❌ Erro:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Polyfill fetch for Node 18+
if (!globalThis.fetch) {
  globalThis.fetch = require("node-fetch");
}

main().catch(e => {
  console.error("❌ Erro fatal:", e.message);
  process.exit(1);
});
