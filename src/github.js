const API = "https://api.github.com";

export function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

export function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function parseError(res) {
  const body = await res.json().catch(() => ({}));
  return new Error(body.message ? `${body.message} (${res.status})` : `GitHub error (${res.status})`);
}

/** Confirms the token can access the repo. Throws if not. */
export async function ghCheckAccess({ owner, repo, token }) {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers(token) });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** Returns { content (raw base64), sha } or null if the file doesn't exist yet. */
export async function ghGetFile({ owner, repo, branch, token }, path) {
  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`, {
    headers: headers(token),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** Creates or updates a file. Pass sha when updating an existing file. */
export async function ghPutFile({ owner, repo, branch, token }, path, base64Content, message, sha) {
  const body = { message, content: base64Content, branch };
  if (sha) body.sha = sha;
  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

export async function ghDeleteFile({ owner, repo, branch, token }, path, sha, message) {
  const res = await fetch(`${API}/repos/${owner}/${repo}/contents/${path}`, {
    method: "DELETE",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ message, sha, branch }),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}
