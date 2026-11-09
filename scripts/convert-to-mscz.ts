#!/usr/bin/env node
/**
 * Convert MusicXML (.musicxml) or Guitar Pro (.gp) to MuseScore (.mscz)
 * Uses MuseScore CLI (mscore) - requires MuseScore installed and in PATH
 * 
 * Usage:
 *   npx tsx scripts/convert-to-mscz.ts <input-file>
 *   npx tsx scripts/convert-to-mscz.ts <input-file> [output-file]
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname, basename, extname, join } from 'path';

function findMuseScore(): string {
  if (process.platform === 'win32') {
    // Common Windows install locations (forward slashes work on Windows too)
    const possiblePaths = [
      'C:/Program Files/MuseScore 4/bin/MuseScore4.exe',
      'C:/Program Files/MuseScore 3/bin/MuseScore3.exe',
      'C:/Program Files (x86)/MuseScore 4/bin/MuseScore4.exe',
      'C:/Program Files (x86)/MuseScore 3/bin/MuseScore3.exe',
      join(process.env.LOCALAPPDATA || '', 'Programs/MuseScore 4/bin/MuseScore4.exe'),
      join(process.env.LOCALAPPDATA || '', 'Programs/MuseScore 3/bin/MuseScore3.exe'),
    ];
    
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }
    // Fallback to command name if in PATH
    return 'MuseScore4.exe';
  }
  
  // Linux/macOS
  return 'mscore';
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Convert MusicXML (.musicxml) or Guitar Pro (.gp) to MuseScore (.mscz)

Usage:
  npx tsx scripts/convert-to-mscz.ts <input-file> [output-file]

Arguments:
  input-file   Path to .musicxml or .gp file
  output-file  Optional output path (default: same name with .mscz extension)

Requirements:
  - MuseScore 4.x installed and 'mscore' command in PATH
  - On Windows: add MuseScore 4/bin to PATH (e.g., C:\\Program Files\\MuseScore 4\\bin)

Examples:
  npx tsx scripts/convert-to-mscz.ts song.musicxml
  npx tsx scripts/convert-to-mscz.ts song.musicxml custom.mscz
  npx tsx scripts/convert-to-mscz.ts song.gp
`);
    process.exit(0);
  }

  const inputPath = resolve(args[0]);
  const outputPath = args[1] ? resolve(args[1]) : inputPath.replace(/\.(musicxml|gp)$/i, '.mscz');

  // Validate input
  if (!existsSync(inputPath)) {
    console.error(`❌ Arquivo não encontrado: ${inputPath}`);
    process.exit(1);
  }

  const inputExt = extname(inputPath).toLowerCase();
  if (!['.musicxml', '.gp'].includes(inputExt)) {
    console.error(`❌ Formato não suportado: ${inputExt}. Use .musicxml ou .gp`);
    process.exit(1);
  }

  // Check if mscore is available
  const mscoreCmd = findMuseScore();
  try {
    // Quote the command in case path contains spaces
    execSync(`"${mscoreCmd}" --version`, { stdio: 'ignore' });
  } catch {
    console.error('❌ MuseScore não encontrado. Instale MuseScore 4.x e adicione ao PATH.');
    console.error('Windows: C:\\Program Files\\MuseScore 4\\bin');
    console.error('Linux: sudo apt install musescore4');
    console.error('macOS: brew install --cask musescore');
    process.exit(1);
  }

  console.log(`🎵 Convertendo: ${basename(inputPath)} → ${basename(outputPath)} (usando ${mscoreCmd})`);
  
  try {
    // Run MuseScore conversion
    execSync(`"${mscoreCmd}" -o "${outputPath}" "${inputPath}"`, { 
      stdio: 'inherit',
      timeout: 120000 // 2 min max
    });
    
    console.log(`✅ Criado: ${outputPath}`);
  } catch (error) {
    console.error('❌ Falha na conversão:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();