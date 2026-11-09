<script lang="ts">
  import {
    downloadGuitarPro,
    downloadMidi as downloadMidiFile
  } from '$lib/utils/download-tab';
  import SelectedSong from './SongPreview.svelte';
  import { formState } from '$lib/runes/form-state.svelte';
  import type { SongsterrPartialMetadata } from '$lib/types';
  import GuitarIcon from '$lib/icons/GuitarIcon.svelte';
  import MidiIcon from '$lib/icons/MidiIcon.svelte';
  import MsczIcon from '$lib/icons/MsczIcon.svelte';
  import MidiDownloadOptions from './MidiDownloadOptions.svelte';
  import type { MidiDownloadOptions as MidiDownloadOptionsValue } from '$lib/types';
  import { toast } from '@zerodevx/svelte-toast';

  interface Props {
    selectedSong: SongsterrPartialMetadata;
  }

  let { selectedSong }: Props = $props();

  let downloading: 'tab' | 'midi' | 'mscz' | null = $state(null);
  let midiDownloadOptions = $state<MidiDownloadOptionsValue>({
    separateTracks: false
  });
  let showMsczInstructions = $state(false);
  let msczConversionMethod: 'auto' | 'manual' = $state('auto');

  const MSCZ_SERVER_URL = 'http://localhost:3001/convert';

  async function downloadTab(): Promise<void> {
    if (downloading) return;
    downloading = 'tab';
    try {
      await downloadGuitarPro(selectedSong);
    } finally {
      downloading = null;
    }
  }

  async function downloadMidi(): Promise<void> {
    if (downloading) return;
    downloading = 'midi';
    try {
      await downloadMidiFile(selectedSong, {
        separateTracks: midiDownloadOptions.separateTracks
      });
    } finally {
      downloading = null;
    }
  }

  async function downloadMscz(): Promise<void> {
    if (downloading) return;
    downloading = 'mscz';
    try {
      if (msczConversionMethod === 'auto') {
        // Try local converter server first
        const success = await tryConvertViaLocalServer();
        if (success) return;
        
        // Fallback: download .gp and show instructions
        msczConversionMethod = 'manual';
      }
      
      // Download .gp file (will trigger browser download)
      await downloadGuitarPro(selectedSong);
      // Show instructions for local conversion
      showMsczInstructions = true;
    } finally {
      downloading = null;
    }
  }

  let msczFallback: 'musicxml' | null = $state(null);
  let msczErrorCode: string | null = $state(null);

  async function tryConvertViaLocalServer(): Promise<boolean> {
    try {
      // First, download .gp as blob
      const gpResponse = await fetch('/api/download/byRevisionJson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ byLinkUrl: selectedSong.byLinkUrl, songTitle: selectedSong.title })
      });
      
      if (!gpResponse.ok) throw new Error('Failed to download .gp');
      
      const gpBlob = await gpResponse.blob();
      const gpBase64 = await blobToBase64(gpBlob);

      // Send to local converter server
      const convertResponse = await fetch(MSCZ_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          gpBase64, 
          songTitle: selectedSong.title 
        })
      });

      if (!convertResponse.ok) {
        const err = await convertResponse.json().catch(() => ({ error: 'Unknown error' }));
        // Check for MuseScore not found fallback
        if (err.code === 'MUSESCORE_NOT_FOUND' || err.fallback?.type === 'musicxml') {
          msczErrorCode = 'MUSESCORE_NOT_FOUND';
          msczFallback = 'musicxml';
        }
        throw new Error(err.error || `Server error: ${convertResponse.status}`);
      }

      // Download the .mscz file
      const msczBlob = await convertResponse.blob();
      const url = URL.createObjectURL(msczBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedSong.title.replace(/[<>:\"/\\|?*]/g, '_')}.mscz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.push('✅ MSCZ baixado via servidor local!', { theme: { '--toastBackground': '#16a34a' } });
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('Local MSCZ conversion failed:', msg);
      return false;
    }
  }

  async function downloadMusicXmlFallback(): Promise<void> {
    try {
      const response = await fetch('/api/download/byRevisionJsonMusicXml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ byLinkUrl: selectedSong.byLinkUrl, songTitle: selectedSong.title })
      });
      if (!response.ok) throw new Error('Falha no download MusicXML');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedSong.title.replace(/[<>:\"/\\|?*]/g, '_')}.musicxml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.push('✅ MusicXML baixado! Abra no MuseScore e salve como .mscz', { theme: { '--toastBackground': '#2563eb' } });
      showMsczInstructions = false;
    } catch (e) {
      toast.push('❌ Erro ao baixar MusicXML', { theme: { '--toastBackground': '#dc2626' } });
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function deselectSong(): void {
    formState.selectedSong = undefined;
  }

  function setMsczMethod(method: 'auto' | 'manual') {
    msczConversionMethod = method;
    if (method === 'manual') showMsczInstructions = true;
  }
</script>

<div class="flex flex-col items-center">
  <div class="mb-8 w-full">
    <SelectedSong {selectedSong} />
  </div>
  <div class="flex flex-col gap-2 items-center">
    <button
      class="relative flex items-center px-4 py-1.5 text-sm font-semibold text-white bg-blue-500 border border-blue-600 rounded shadow hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
      disabled={!!downloading}
      onclick={downloadTab}
    >
      <GuitarIcon class="inline-block mr-1.5 text-base" />Download Guitar Pro
      {#if downloading === 'tab'}
        <span class="progress-bar"></span>
      {/if}
    </button>
    <span class="mb-1 font-light">or </span>
    <button
      class="cursor-pointer relative flex items-center px-4 py-1.5 text-sm text-green-600 border border-green-500 rounded hover:bg-green-700 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
      disabled={!!downloading}
      onclick={downloadMscz}
    >
      <MsczIcon class="inline-block mr-1.5 text-base" />
      Download MSCZ (.mscz)
      {#if downloading === 'mscz'}
        <span class="progress-bar"></span>
      {/if}
    </button>
  </div>
  <div class="my-2"></div>

  {#if showMsczInstructions}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-semibold">Converter para MSCZ</h3>
          <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" onclick={() => showMsczInstructions = false} aria-label="Fechar">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="space-y-3 text-sm text-slate-600 dark:text-slate-300">
          <p>Tentativa automática via servidor local falhou. Opções:</p>
          
          {#if msczFallback === 'musicxml' || msczErrorCode === 'MUSESCORE_NOT_FOUND'}
            <div class="p-3 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-300 dark:border-amber-700">
              <p class="font-semibold text-amber-800 dark:text-amber-200 mb-2">⚠️ MuseScore não instalado neste computador</p>
              <p class="text-xs text-amber-700 dark:text-amber-300 mb-2">Baixe <strong>MusicXML</strong> — o MuseScore abre nativamente e você salva como .mscz:</p>
              <button
                class="w-full px-3 py-2 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors text-sm font-medium"
                onclick={downloadMusicXmlFallback}
              >
                📥 Baixar MusicXML (.musicxml)
              </button>
              <a href="https://musescore.org/download" target="_blank" class="block text-center text-xs text-amber-600 dark:text-amber-400 underline mt-2">
                Ou instale o MuseScore 4 para conversão automática
              </a>
            </div>
          {/if}
          
          <div class="space-y-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mscz-method" bind:group={msczConversionMethod} value="auto" onchange={() => setMsczMethod('auto')} />
              <span>🔄 Tentar novamente automaticamente</span>
            </label>
            <p class="text-xs text-slate-500 ml-5">Requer <code>npm run mscz-server</code> + MuseScore instalado</p>
          </div>

          <div class="space-y-2 p-3 bg-slate-100 dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="mscz-method" bind:group={msczConversionMethod} value="manual" />
              <span>📥 Baixar .gp e converter manualmente</span>
            </label>
            <div class="bg-slate-100 dark:bg-slate-700 p-3 rounded font-mono text-xs overflow-x-auto ml-5">
              <code>npm run gp2mscz "{selectedSong.byLinkUrl}" "{selectedSong.title}"</code>
            </div>
            <p class="text-xs text-slate-500 ml-5">(Requer <a href="https://musescore.org/download" target="_blank" class="underline">MuseScore 4</a> instalado)</p>
          </div>
        </div>
        <div class="flex gap-2 mt-4">
          <button 
            class="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            onclick={() => { showMsczInstructions = false; downloadMscz(); }}
          >
            {msczConversionMethod === 'auto' ? 'Tentar novamente' : 'Baixar .gp'}
          </button>
          <button 
            class="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            onclick={() => showMsczInstructions = false}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  {/if}

  <button
    class="cursor-pointer text-slate-400 font-light underline hover:text-slate-500 bg-transparent mb-1"
    onclick={deselectSong}>Select another</button
  >
</div>

<style>
  .progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.7);
    animation: progress-loop 1.2s ease-in-out infinite;
  }

  @keyframes progress-loop {
    0% { width: 0%; }
    100% { width: 100%; }
  }
</style>