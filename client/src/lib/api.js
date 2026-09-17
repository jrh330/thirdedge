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
 * DEV_MODE: if window.__DEV_FAKE_UPLOAD is set, skip upload and return a fake imageRef.
 *
 * TODO: replace FormData upload with real endpoint when image upload is built.
 * For now, skip the upload and pass imageUrl: null.
 */
export async function checkSubmission({ name, flavorText, imageBlob }) {
  // TODO: wire up real image upload via FormData when endpoint exists
  const data = await post('/api2/check', { name, flavorText, imageUrl: null });
  return data;
}

export async function mintCard({ submissionId }) {
  return post('/api2/mint', { submissionId, imageUrl: null });
}

export async function getCollectionState() {
  const res = await fetch('/api2/collection-state');
  return res.json();
}
