/**
 * api.js — all API calls in one place, using relative URLs only.
 * Never hardcode a hostname here.
 */

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * Upload image + submission for Check step.
 *
 * Sends multipart/form-data so the server receives the actual image bytes.
 * The server is responsible for stripping metadata (GPS etc.), converting HEIC,
 * resizing to 1200² and 400², and moving to private holding until Mint.
 *
 * Until the real upload endpoint exists, the server ignores the image field and
 * proceeds with imageUrl: null — this is the "fake stand-in" described in the
 * minting build brief. The FormData wiring is real; only the server-side handler
 * is still a stub.
 */
export async function checkSubmission({ name, flavorText, imageBlob }) {
  const form = new FormData();
  form.append('name', name);
  form.append('flavorText', flavorText);
  if (imageBlob) {
    form.append('image', imageBlob, 'card.jpg');
  }

  const res = await fetch('/api2/check', {
    method: 'POST',
    body: form,
    // No Content-Type header — browser sets it with the boundary automatically
  });
  return res.json();
}

export async function mintCard({ submissionId }) {
  return post('/api2/mint', { submissionId, imageUrl: null });
}

export async function deleteCard(cardId) {
  const res = await fetch(`/api2/cards/${cardId}`, { method: 'DELETE' });
  return res.json();
}

export async function swapCard({ outId, inId }) {
  return post('/api2/collection/swap', { outId, inId });
}

export async function getCollectionState() {
  const res = await fetch('/api2/collection-state');
  return res.json();
}

/**
 * Fetch an image by URL via the server-side proxy (SSRF-guarded).
 * Returns a Blob on success, or throws with a user-facing message.
 */
export async function fetchImagePreview(url) {
  const res = await fetch('/api2/fetch-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Could not fetch that image');
  }
  return res.blob();
}
