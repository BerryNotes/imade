const cache = new Map();

export function getBlobUrl(songId) {
  return cache.get(songId) || null;
}

export function setBlobUrl(songId, url) {
  cache.set(songId, url);
}

export function revokeBlobUrl(songId) {
  const url = cache.get(songId);
  if (url) {
    URL.revokeObjectURL(url);
    cache.delete(songId);
  }
}
