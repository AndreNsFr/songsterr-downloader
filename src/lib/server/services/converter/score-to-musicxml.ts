import * as alphaTab from '@coderline/alphatab';

const MUSICXML_MIME_TYPE = 'application/vnd.recordare.musicxml';

interface MusicXmlExportOptions {
  // Future options can be added here
}

export function scoreToMusicXml(score: alphaTab.model.Score): string {
  const tracks = score.tracks;
  const masterBars = score.masterBars;

  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
  xml += '<!DOCTYPE score-partwise PUBLIC\n';
  xml += '  "-//Recordare//DTD MusicXML 4.0 Partwise//EN"\n';
  xml += '  "http://www.musicxml.org/dtds/partwise.dtd">\n';
  xml += '<score-partwise version="4.0">\n';

  if (score.title) {
    xml += `  <work>\n    <work-title>${escapeXml(score.title)}</work-title>\n  </work>\n`;
  }

  xml += '  <part-list>\n';
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const isPercussion = track.staves[0]?.isPercussion || false;
    xml += `    <score-part id="P${i + 1}">\n`;
    xml += `      <part-name>${escapeXml(track.name || `Track ${i + 1}`)}</part-name>\n`;
    xml += `      <part-abbreviation>${escapeXml(track.shortName || track.name || `Tr${i + 1}`)}</part-abbreviation>\n`;
    xml += `      <score-instrument id="P${i + 1}-I1">\n`;
    xml += `        <instrument-name>${escapeXml(track.name || `Track ${i + 1}`)}</instrument-name>\n`;
    xml += `      </score-instrument>\n`;
    xml += `      <midi-device id="P${i + 1}-I1" port="${track.playbackInfo.primaryChannel}"/>\n`;
    xml += `      <midi-instrument id="P${i + 1}-I1">\n`;
    xml += `        <midi-channel>${track.playbackInfo.primaryChannel}</midi-channel>\n`;
    xml += `        <midi-program>${track.playbackInfo.program}</midi-program>\n`;
    xml += `      </midi-instrument>\n`;
    xml += `    </score-part>\n`;
  }
  xml += '  </part-list>\n';

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    const track = tracks[trackIndex];
    const staff = track.staves[0];
    const isPercussion = staff?.isPercussion || false;
    const numStrings = staff?.stringTuning ? staff.stringTuning.tunings.length : 6;

    xml += `  <part id="P${trackIndex + 1}">\n`;

    for (let barIndex = 0; barIndex < masterBars.length; barIndex++) {
      const masterBar = masterBars[barIndex];
      const bar = staff.bars[barIndex];
      if (!bar) continue;

      xml += `    <measure number="${barIndex + 1}">\n`;

      if (barIndex === 0 || attributesChanged(masterBars, barIndex)) {
        xml += buildAttributes(masterBar, staff, isPercussion, numStrings, trackIndex);
      }

      const tempoAutomations = masterBar.tempoAutomations;
      if (tempoAutomations && tempoAutomations.length > 0) {
        for (const tempo of tempoAutomations) {
          xml += buildDirection(tempo, masterBar);
        }
      }

      const maxVoices = bar.voices.length;
      for (let voiceIndex = 0; voiceIndex < maxVoices; voiceIndex++) {
        const voice = bar.voices[voiceIndex];
        if (!voice || voice.beats.length === 0) continue;

        if (voiceIndex > 0) {
          xml += `      <backup>\n        <duration>${getMeasureDuration(masterBar)}</duration>\n      </backup>\n`;
        }

        for (const beat of voice.beats) {
          if (beat.isEmpty || (beat.notes.length === 0 && beat.graceType === alphaTab.model.GraceType.None)) {
            xml += buildRest(beat, masterBar);
          } else {
            for (let noteIndex = 0; noteIndex < beat.notes.length; noteIndex++) {
              const note = beat.notes[noteIndex];
              const isChordNote = noteIndex > 0;
              xml += buildNote(note, beat, masterBar, isPercussion, trackIndex, voiceIndex, isChordNote);
            }
          }
        }
      }

      xml += buildBarline(masterBar);
      xml += `    </measure>\n`;
    }

    xml += `  </part>\n`;
  }

  xml += '</score-partwise>\n';
  return xml;
}

function attributesChanged(masterBars: alphaTab.model.MasterBar[], index: number): boolean {
  if (index === 0) return true;
  const prev = masterBars[index - 1];
  const curr = masterBars[index];
  return (
    prev.timeSignatureNumerator !== curr.timeSignatureNumerator ||
    prev.timeSignatureDenominator !== curr.timeSignatureDenominator
  );
}

function buildAttributes(
  masterBar: alphaTab.model.MasterBar,
  staff: alphaTab.model.Staff,
  isPercussion: boolean,
  numStrings: number,
  trackIndex: number
): string {
  let xml = '      <attributes>\n';
  xml += `        <divisions>960</divisions>\n`;
  xml += `        <key>\n          <fifths>0</fifths>\n        </key>\n`;
  xml += `        <time>\n`;
  xml += `          <beats>${masterBar.timeSignatureNumerator}</beats>\n`;
  xml += `          <beat-type>${masterBar.timeSignatureDenominator}</beat-type>\n`;
  xml += `        </time>\n`;

  if (isPercussion) {
    xml += `        <clef>\n          <sign>percussion</sign>\n          <line>2</line>\n        </clef>\n`;
  } else {
    const tuning = staff.stringTuning?.tunings;
    let clefSign = 'G';
    let clefLine = 2;
    if (tuning && tuning.length >= 4) {
      const lowestPitch = Math.min(...tuning);
      if (lowestPitch < 40) {
        clefSign = 'F';
        clefLine = 4;
      }
    }
    xml += `        <clef>\n          <sign>${clefSign}</sign>\n          <line>${clefLine}</line>\n        </clef>\n`;
  }

  if (!isPercussion && staff.stringTuning) {
    xml += `        <staff-details>\n`;
    xml += `          <staff-lines>${numStrings}</staff-lines>\n`;
    xml += `          <staff-tuning>\n`;
    const tuning = staff.stringTuning.tunings;
    for (let i = tuning.length - 1; i >= 0; i--) {
      const midiPitch = tuning[i];
      const { step, octave, alter } = midiToPitch(midiPitch);
      xml += `            <tuning-step>${step}</tuning-step>\n`;
      xml += `            <tuning-octave>${octave}</tuning-octave>\n`;
      if (alter !== 0) {
        xml += `            <tuning-alter>${alter}</tuning-alter>\n`;
      }
    }
    xml += `          </staff-tuning>\n`;
    xml += `        </staff-details>\n`;
  }

  xml += '      </attributes>\n';
  return xml;
}

function buildDirection(
  tempo: alphaTab.model.Automation,
  masterBar: alphaTab.model.MasterBar
): string {
  const bpm = Math.round(tempo.value);
  let xml = '      <direction placement="above">\n';
  xml += '        <direction-type>\n';
  xml += `          <metronome>\n`;
  xml += `            <beat-unit>quarter</beat-unit>\n`;
  xml += `            <per-minute>${bpm}</per-minute>\n`;
  xml += `          </metronome>\n`;
  xml += '        </direction-type>\n';
  xml += `        <sound tempo="${bpm}"/>\n`;
  xml += '      </direction>\n';
  return xml;
}

function buildRest(beat: alphaTab.model.Beat, masterBar: alphaTab.model.MasterBar): string {
  const duration = getBeatDuration(beat, masterBar);
  let xml = '      <note>\n';
  xml += `        <duration>${duration}</duration>\n`;
  xml += '        <rest/>\n';
  xml += '      </note>\n';
  return xml;
}

function buildNote(
  note: alphaTab.model.Note,
  beat: alphaTab.model.Beat,
  masterBar: alphaTab.model.MasterBar,
  isPercussion: boolean,
  trackIndex: number,
  voiceIndex: number,
  isChordNote: boolean
): string {
  const duration = getBeatDuration(beat, masterBar);
  let xml = '      <note>\n';

  if (isChordNote) {
    xml += '        <chord/>\n';
  }

  if (isPercussion) {
    const midiNote = note.percussionArticulation >= 0
      ? note.percussionArticulation
      : 60;
    const { step, octave } = midiToPitch(midiNote);
    xml += `        <unpitched>\n`;
    xml += `          <display-step>${step}</display-step>\n`;
    xml += `          <display-octave>${octave}</display-octave>\n`;
    xml += `        </unpitched>\n`;
  } else {
    const midiPitch = note.realValue;
    const { step, octave, alter } = midiToPitch(midiPitch);
    xml += `        <pitch>\n`;
    xml += `          <step>${step}</step>\n`;
    xml += `          <octave>${octave}</octave>\n`;
    if (alter !== 0) {
      xml += `          <alter>${alter}</alter>\n`;
    }
    xml += `        </pitch>\n`;
  }

  xml += `        <duration>${duration}</duration>\n`;
  xml += `        <voice>${voiceIndex + 1}</voice>\n`;

  const noteType = durationToNoteType(beat.duration);
  xml += `        <type>${noteType}</type>\n`;

  for (let d = 0; d < beat.dots; d++) {
    xml += `        <dot/>\n`;
  }

  if (!isPercussion && note.accidentalMode !== alphaTab.model.NoteAccidentalMode.Default) {
    const accidental = accidentalToXml(note.accidentalMode);
    if (accidental) {
      xml += `        <accidental>${accidental}</accidental>\n`;
    }
  }

  if (note.isDead) {
    xml += `        <notehead>x</notehead>\n`;
  } else if (note.isGhost) {
    xml += `        <notehead>diamond</notehead>\n`;
  }

  xml += `        <staff>1</staff>\n`;

  if (beat.beamingMode !== alphaTab.model.BeatBeamingMode.Auto) {
    xml += `        <beam number="1">continue</beam>\n`;
  }

  xml += buildNotations(note, beat);

  if (beat.text) {
    xml += `        <lyric>\n`;
    xml += `          <text>${escapeXml(beat.text)}</text>\n`;
    xml += `        </lyric>\n`;
  }

  if (!isPercussion && note.string >= 0) {
    xml += `        <notations>\n`;
    xml += `          <technical>\n`;
    xml += `            <string>${note.string}</string>\n`;
    xml += `            <fret>${note.fret}</fret>\n`;
    xml += `          </technical>\n`;
    xml += `        </notations>\n`;
  }

  xml += '      </note>\n';
  return xml;
}

function buildNotations(note: alphaTab.model.Note, beat: alphaTab.model.Beat): string {
  let xml = '';
  const hasNotations =
    note.isHammerPullOrigin ||
    note.isTieDestination ||
    note.isTieOrigin ||
    note.bendType !== alphaTab.model.BendType.None ||
    note.slideInType !== alphaTab.model.SlideInType.None ||
    note.slideOutType !== alphaTab.model.SlideOutType.None ||
    note.harmonicType !== alphaTab.model.HarmonicType.None ||
    note.vibrato !== alphaTab.model.VibratoType.None ||
    beat.isPalmMute ||
    note.isStaccato ||
    note.accentuated !== alphaTab.model.AccentuationType.None;

  if (!hasNotations) return xml;

  xml += '        <notations>\n';

  if (note.isTieDestination) {
    xml += '          <tied type="start"/>\n';
  }
  if (note.isTieOrigin) {
    xml += '          <tied type="stop"/>\n';
  }

  if (note.isHammerPullOrigin) {
    xml += '          <hammer-on type="start"/>\n';
    xml += '          <pull-off type="start"/>\n';
  }

  if (note.bendType !== alphaTab.model.BendType.None && note.bendPoints && note.bendPoints.length > 0) {
    xml += '          <bend>\n';
    for (const point of note.bendPoints) {
      xml += `            <bend-alter>${point.value / 2}</bend-alter>\n`;
    }
    xml += '          </bend>\n';
  }

  if (note.slideInType !== alphaTab.model.SlideInType.None) {
    xml += '          <slide type="start"/>\n';
  }
  if (note.slideOutType !== alphaTab.model.SlideOutType.None) {
    xml += '          <slide type="stop"/>\n';
  }

  if (note.harmonicType !== alphaTab.model.HarmonicType.None) {
    xml += '          <harmonic>\n';
    const harmonicType = harmonicTypeToXml(note.harmonicType);
    if (harmonicType) {
      xml += `            <harmonic-type>${harmonicType}</harmonic-type>\n`;
    }
    if (note.harmonicValue) {
      xml += `            <base-pitch>\n`;
      xml += `              <step>C</step>\n`;
      xml += `              <octave>4</octave>\n`;
      xml += `            </base-pitch>\n`;
      xml += `            <touching-pitch>\n`;
      xml += `              <step>C</step>\n`;
      xml += `              <octave>4</octave>\n`;
      xml += `            </touching-pitch>\n`;
    }
    xml += '          </harmonic>\n';
  }

  if (note.vibrato !== alphaTab.model.VibratoType.None) {
    xml += '          <ornaments>\n';
    xml += `            <wavy-line type="start" number="1"/>\n`;
    xml += '          </ornaments>\n';
  }

  if (beat.isPalmMute) {
    xml += '          <articulations>\n';
    xml += '            <palm-mute/>\n';
    xml += '          </articulations>\n';
  }

  if (note.isStaccato) {
    xml += '          <articulations>\n';
    xml += '            <staccato/>\n';
    xml += '          </articulations>\n';
  }

  if (note.accentuated !== alphaTab.model.AccentuationType.None) {
    xml += '          <articulations>\n';
    xml += '            <accent/>\n';
    xml += '          </articulations>\n';
  }

  xml += '        </notations>\n';
  return xml;
}

function buildBarline(masterBar: alphaTab.model.MasterBar): string {
  let xml = '      <barline location="right">\n';

  if (masterBar.isRepeatStart && masterBar.repeatCount > 0) {
    xml += '        <repeat direction="forward"/>\n';
  }
  if (masterBar.repeatCount > 0 && !masterBar.isRepeatStart) {
    xml += `        <repeat direction="backward" times="${masterBar.repeatCount}"/>\n`;
  }

  if (masterBar.alternateEndings > 0) {
    for (let i = 1; i <= 8; i++) {
      if (masterBar.alternateEndings & (1 << (i - 1))) {
        xml += `        <ending number="${i}" type="start"/>\n`;
      }
    }
  }

  if (masterBar.isDoubleBar) {
    xml += '        <bar-style>heavy-light</bar-style>\n';
  }

  xml += '      </barline>\n';
  return xml;
}

function getMeasureDuration(masterBar: alphaTab.model.MasterBar): number {
  return (960 * masterBar.timeSignatureNumerator * 4) / masterBar.timeSignatureDenominator;
}

function getBeatDuration(beat: alphaTab.model.Beat, masterBar: alphaTab.model.MasterBar): number {
  if (beat.playbackDuration > 0) {
    return beat.playbackDuration;
  }
  const durationMap: Record<number, number> = {
    1: 960 * 4,
    2: 960 * 2,
    4: 960,
    8: 480,
    16: 240,
    32: 120,
    64: 60
  };
  const baseDuration = durationMap[beat.duration] || 960;
  let dots = beat.dots || 0;
  let result = baseDuration;
  let add = baseDuration / 2;
  while (dots-- > 0) {
    result += add;
    add /= 2;
  }
  return result;
}

function durationToNoteType(duration: number): string {
  const map: Record<number, string> = {
    1: 'whole',
    2: 'half',
    4: 'quarter',
    8: 'eighth',
    16: '16th',
    32: '32nd',
    64: '64th'
  };
  return map[duration] || 'quarter';
}

function midiToPitch(midi: number): { step: string; octave: number; alter: number } {
  const steps = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const alters = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const noteIndex = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  return { step: steps[noteIndex], octave, alter: alters[noteIndex] };
}

function accidentalToXml(mode: alphaTab.model.NoteAccidentalMode): string | null {
  switch (mode) {
    case alphaTab.model.NoteAccidentalMode.ForceSharp: return 'sharp';
    case alphaTab.model.NoteAccidentalMode.ForceFlat: return 'flat';
    case alphaTab.model.NoteAccidentalMode.ForceNatural: return 'natural';
    case alphaTab.model.NoteAccidentalMode.ForceDoubleSharp: return 'double-sharp';
    case alphaTab.model.NoteAccidentalMode.ForceDoubleFlat: return 'double-flat';
    case alphaTab.model.NoteAccidentalMode.ForceNone: return 'natural';
    default: return null;
  }
}

function harmonicTypeToXml(type: alphaTab.model.HarmonicType): string | null {
  switch (type) {
    case alphaTab.model.HarmonicType.Natural: return 'natural';
    case alphaTab.model.HarmonicType.Artificial: return 'artificial';
    case alphaTab.model.HarmonicType.Pinch: return 'pinch';
    case alphaTab.model.HarmonicType.Tap: return 'tap';
    case alphaTab.model.HarmonicType.Semi: return 'semi-harmonic';
    default: return null;
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;');
}

export async function createMusicXmlFromScore(score: alphaTab.model.Score): Promise<Uint8Array> {
  const xmlContent = scoreToMusicXml(score);
  return new TextEncoder().encode(xmlContent);
}