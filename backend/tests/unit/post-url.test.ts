import { canonicalizeForPlatform, canonicalizePostUrl, PostUrlError } from "../../src/utils/post-url";

describe("canonicalizePostUrl — Instagram", () => {
  it.each([
    ["https://www.instagram.com/p/CxAbc123/", "https://www.instagram.com/p/CxAbc123/"],
    ["https://instagram.com/p/CxAbc123", "https://www.instagram.com/p/CxAbc123/"],
    ["instagram.com/reel/CxAbc123/?igsh=xyz", "https://www.instagram.com/reel/CxAbc123/"],
    ["https://www.instagram.com/reels/CxAbc123/", "https://www.instagram.com/reel/CxAbc123/"],
    ["https://m.instagram.com/tv/CxAbc123/", "https://www.instagram.com/tv/CxAbc123/"],
    ["https://www.instagram.com/some.creator/reel/CxAbc123/", "https://www.instagram.com/reel/CxAbc123/"],
    ["HTTPS://WWW.INSTAGRAM.COM/p/CxAbc123/#comments", "https://www.instagram.com/p/CxAbc123/"],
  ])("%s -> %s", (input, canonical) => {
    const r = canonicalizePostUrl(input);
    expect(r.platform).toBe("INSTAGRAM");
    expect(r.canonicalUrl).toBe(canonical);
  });

  it("keeps shortcodes case-sensitive", () => {
    expect(canonicalizePostUrl("https://instagram.com/p/AbCdE/").postId).toBe("AbCdE");
  });
});

describe("canonicalizePostUrl — YouTube", () => {
  const id = "dQw4w9WgXcQ";
  it.each([
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=42s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
  ])("%s canonicalises to the watch URL", (input) => {
    const r = canonicalizePostUrl(input);
    expect(r).toEqual({ platform: "YOUTUBE", postId: id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` });
  });
});

describe("canonicalizePostUrl — rejections (no fetching, no SSRF surface)", () => {
  it.each([
    "",
    "not a url",
    "https://example.com/p/CxAbc123/",
    "https://instagram.com.evil.com/p/CxAbc123/",
    "https://evil.com/?u=https://instagram.com/p/CxAbc123/",
    "javascript:alert(1)",
    "ftp://instagram.com/p/CxAbc123/",
    "https://user:pass@instagram.com/p/CxAbc123/",
    "https://instagram.com:8443/p/CxAbc123/",
    "http://127.0.0.1/p/CxAbc123/",
    "https://www.instagram.com/someprofile/",
    "https://www.instagram.com/p/",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UC123",
    `https://www.instagram.com/p/${"a".repeat(3000)}/`,
  ])("rejects %p", (input) => {
    expect(() => canonicalizePostUrl(input)).toThrow(PostUrlError);
  });
});

describe("canonicalizeForPlatform", () => {
  it("accepts a matching platform", () => {
    expect(canonicalizeForPlatform("https://youtu.be/dQw4w9WgXcQ", "YOUTUBE").platform).toBe("YOUTUBE");
  });
  it("rejects a mismatched platform with a clear message", () => {
    expect(() => canonicalizeForPlatform("https://youtu.be/dQw4w9WgXcQ", "INSTAGRAM")).toThrow("only accepts Instagram");
  });
});
