import { useState, useEffect } from 'react';
import { getAllSongIds } from '../audioStore';

export default function useAudioAvailability(songs) {
  const [available, setAvailable] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    const idbSongs = songs.filter(s => s.audioFile && s.audioFile.startsWith("idb:"));
    if (idbSongs.length === 0) {
      // All songs are server-hosted — all available
      setAvailable(new Set(songs.map(s => s.id)));
      return;
    }
    getAllSongIds().then(storedIds => {
      if (cancelled) return;
      const set = new Set();
      for (const s of songs) {
        if (!s.audioFile) continue;
        if (s.audioFile.startsWith("idb:")) {
          if (storedIds.has(s.id)) set.add(s.id);
        } else {
          // Server-hosted — always available
          set.add(s.id);
        }
      }
      setAvailable(set);
    }).catch(() => {
      // On error, assume server songs available, idb songs not
      const set = new Set();
      for (const s of songs) {
        if (s.audioFile && !s.audioFile.startsWith("idb:")) set.add(s.id);
      }
      setAvailable(set);
    });
    return () => { cancelled = true; };
  }, [songs]);

  return available;
}
