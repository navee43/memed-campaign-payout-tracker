import type { Platform } from "../types/domain";

/**
 * Validates and canonicalises social post URLs WITHOUT ever fetching them
 * (no SSRF surface). Only well-known public hosts and post path shapes are
 * accepted; everything else is rejected with a user-friendly reason.
 */

export interface CanonicalPost {
  platform: Platform;
  /** Platform-specific post identifier (Instagram shortcode or YouTube video id). */
  postId: string;
  canonicalUrl: string;
}

export class PostUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostUrlError";
  }
}

const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const YOUTU_BE = "youtu.be";

const IG_SHORTCODE = /^[A-Za-z0-9_-]{5,64}$/;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_KINDS: Record<string, "p" | "reel" | "tv"> = { p: "p", reel: "reel", reels: "reel", tv: "tv" };
const MAX_URL_LENGTH = 2048;

function parseUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new PostUrlError("Please paste the link to your post.");
  if (trimmed.length > MAX_URL_LENGTH) throw new PostUrlError("That link is too long.");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new PostUrlError("That doesn't look like a valid link.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new PostUrlError("Only http(s) links are accepted.");
  }
  if (url.username || url.password) throw new PostUrlError("Links must not contain credentials.");
  if (url.port !== "") throw new PostUrlError("Links must not specify a port.");
  return url;
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function canonicalInstagram(url: URL): CanonicalPost {
  const segs = pathSegments(url);
  // Accept /p/{code}, /reel/{code}, /reels/{code}, /tv/{code} and the newer
  // /{username}/p/{code} or /{username}/reel/{code} forms.
  let kindIdx = segs.findIndex((s) => s.toLowerCase() in IG_KINDS);
  if (kindIdx > 1) kindIdx = -1;
  const kindSeg = kindIdx >= 0 ? segs[kindIdx] : undefined;
  const code = kindIdx >= 0 ? segs[kindIdx + 1] : undefined;
  if (!kindSeg || !code || !IG_SHORTCODE.test(code)) {
    throw new PostUrlError("Use a link to a specific Instagram post or reel, e.g. https://www.instagram.com/reel/ABC123xyz/");
  }
  const kind = IG_KINDS[kindSeg.toLowerCase()] ?? "p";
  return { platform: "INSTAGRAM", postId: code, canonicalUrl: `https://www.instagram.com/${kind}/${code}/` };
}

function canonicalYouTube(url: URL, host: string): CanonicalPost {
  let id: string | undefined;
  if (host === YOUTU_BE) {
    id = pathSegments(url)[0];
  } else {
    const segs = pathSegments(url);
    if (segs[0] === "watch") id = url.searchParams.get("v") ?? undefined;
    else if (segs[0] === "shorts" || segs[0] === "live" || segs[0] === "embed") id = segs[1];
  }
  if (!id || !YT_ID.test(id)) {
    throw new PostUrlError("Use a link to a specific YouTube video or Short, e.g. https://www.youtube.com/shorts/dQw4w9WgXcQ");
  }
  // Watch and Shorts URLs for the same id are the same video: one canonical form.
  return { platform: "YOUTUBE", postId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
}

export function canonicalizePostUrl(raw: string): CanonicalPost {
  const url = parseUrl(raw);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (INSTAGRAM_HOSTS.has(host)) return canonicalInstagram(url);
  if (YOUTUBE_HOSTS.has(host) || host === YOUTU_BE) return canonicalYouTube(url, host);
  throw new PostUrlError("Only Instagram and YouTube post links are supported.");
}

/** Canonicalises and verifies the post belongs to the campaign's platform. */
export function canonicalizeForPlatform(raw: string, platform: Platform): CanonicalPost {
  const post = canonicalizePostUrl(raw);
  if (post.platform !== platform) {
    const want = platform === "INSTAGRAM" ? "Instagram" : "YouTube";
    throw new PostUrlError(`This campaign only accepts ${want} posts.`);
  }
  return post;
}
