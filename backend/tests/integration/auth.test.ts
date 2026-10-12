import type { Express } from "express";
import request from "supertest";
import { RefreshSession } from "../../src/models/refresh-session.model";
import { User } from "../../src/models/user.model";
import { cookieValue, PASSWORD, registerUser, resetDatabase, startIntegration, stopIntegration } from "../helpers/integration";

let app: Express;
beforeAll(async () => {
  app = await startIntegration("auth");
});
afterAll(stopIntegration);
beforeEach(resetDatabase);

async function csrfAgent() {
  const agent = request.agent(app);
  const res = await agent.get("/api/auth/csrf").expect(200);
  return { agent, csrf: res.body.data.csrfToken as string };
}

describe("signup", () => {
  it("creates an account, sets HttpOnly cookies and never returns secrets", async () => {
    const { agent, csrf } = await csrfAgent();
    const res = await agent
      .post("/api/auth/signup")
      .set("x-csrf-token", csrf)
      .send({ name: "Asha Creator", email: "  Asha@Example.COM ", password: PASSWORD, role: "CREATOR" })
      .expect(201);

    expect(res.body.data.user).toEqual({ id: expect.any(String), name: "Asha Creator", email: "asha@example.com", role: "CREATOR" });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|memed_rt/);
    const cookies = (res.headers["set-cookie"] as unknown as string[]).join("\n");
    expect(cookies).toMatch(/memed_at=[^;]+;.*HttpOnly/);
    expect(cookies).toMatch(/memed_rt=[^;]+;.*Path=\/api\/auth;.*HttpOnly/);
    expect(cookies).toMatch(/SameSite=Lax/);
    expect(cookies).not.toMatch(/memed_csrf=[^;]+;.*HttpOnly/);

    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.data.user.email).toBe("asha@example.com");
  });

  it("stores an Argon2id hash, never the plaintext password", async () => {
    const u = await registerUser(app, "BRAND");
    const doc = await User.findById(u.id).select("+passwordHash").lean();
    expect(doc!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(doc!.passwordHash).not.toContain(PASSWORD);
  });

  it("rejects duplicate emails case-insensitively", async () => {
    const first = await registerUser(app, "CREATOR");
    const { agent, csrf } = await csrfAgent();
    const res = await agent
      .post("/api/auth/signup")
      .set("x-csrf-token", csrf)
      .send({ name: "Copy Cat", email: first.email.toUpperCase(), password: PASSWORD, role: "BRAND" })
      .expect(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
    expect(await User.countDocuments()).toBe(1);
  });

  it.each([
    [{ name: "A", email: "a@b.co", password: PASSWORD, role: "CREATOR" }, "name"],
    [{ name: "Valid Name", email: "not-an-email", password: PASSWORD, role: "CREATOR" }, "email"],
    [{ name: "Valid Name", email: "a@b.co", password: "short1", role: "CREATOR" }, "password"],
    [{ name: "Valid Name", email: "a@b.co", password: "lettersonlypassword", role: "CREATOR" }, "password"],
    [{ name: "Valid Name", email: "a@b.co", password: PASSWORD, role: "ADMIN" }, "role"],
    [{ name: "Valid Name", email: "a@b.co", password: PASSWORD, role: "CREATOR", status: "SUSPENDED" }, ""],
  ])("rejects malformed input %#", async (body, field) => {
    const { agent, csrf } = await csrfAgent();
    const res = await agent.post("/api/auth/signup").set("x-csrf-token", csrf).send(body).expect(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    if (field) expect(JSON.stringify(res.body.error.details)).toContain(field);
  });

  it("rejects NoSQL operator injection in the body", async () => {
    const { agent, csrf } = await csrfAgent();
    await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: { $ne: null }, password: { $ne: null } }).expect(422);
  });
});

describe("login", () => {
  it("signs in with correct credentials", async () => {
    const u = await registerUser(app, "BRAND");
    const { agent, csrf } = await csrfAgent();
    const res = await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: u.email, password: PASSWORD }).expect(200);
    expect(res.body.data.user.role).toBe("BRAND");
    await agent.get("/api/auth/me").expect(200);
  });

  it("gives the same error for unknown email and wrong password", async () => {
    const u = await registerUser(app, "BRAND");
    const { agent, csrf } = await csrfAgent();
    const wrong = await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: u.email, password: "WrongPass99" }).expect(401);
    const unknown = await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: "nobody@x.dev", password: "WrongPass99" }).expect(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
  });

  it("locks the account after repeated failures (brute-force protection)", async () => {
    const u = await registerUser(app, "CREATOR");
    const { agent, csrf } = await csrfAgent();
    for (let i = 0; i < 5; i += 1) {
      await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: u.email, password: "WrongPass99" }).expect(401);
    }
    const locked = await agent.post("/api/auth/login").set("x-csrf-token", csrf).send({ email: u.email, password: PASSWORD }).expect(429);
    expect(locked.body.error.code).toBe("ACCOUNT_LOCKED");
  });
});

describe("sessions, refresh rotation and logout", () => {
  it("requires authentication for /me", async () => {
    await request(app).get("/api/auth/me").expect(401);
  });

  it("exposes a non-throwing session probe", async () => {
    const anon = await request(app).get("/api/auth/session").expect(200);
    expect(anon.body.data).toEqual({ user: null, refreshable: false });
    const u = await registerUser(app, "CREATOR");
    const signedIn = await u.agent.get("/api/auth/session").expect(200);
    expect(signedIn.body.data.user.id).toBe(u.id);
    // Access cookie gone but refresh cookie present -> refreshable.
    const rt = (await u.agent.post("/api/auth/refresh").set("x-csrf-token", u.csrf).expect(200)).headers["set-cookie"] as unknown as string[];
    const refreshCookie = rt.find((c) => c.startsWith("memed_rt="))!.split(";")[0]!;
    const probe = await request(app).get("/api/auth/session").set("Cookie", [refreshCookie]).expect(200);
    expect(probe.body.data).toEqual({ user: null, refreshable: true });
  });

  it("rejects state-changing requests without a CSRF token", async () => {
    const u = await registerUser(app, "BRAND");
    const res = await u.agent.post("/api/auth/logout").send().expect(403);
    expect(res.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("rejects requests from a foreign Origin", async () => {
    const u = await registerUser(app, "BRAND");
    const res = await u.agent.post("/api/auth/logout").set("origin", "https://evil.example").set("x-csrf-token", u.csrf).expect(403);
    expect(res.body.error.code).toBe("CSRF_ORIGIN_REJECTED");
  });

  it("rotates refresh tokens and revokes the family when an old token is replayed", async () => {
    const { agent, csrf } = await csrfAgent();
    const signup = await agent
      .post("/api/auth/signup")
      .set("x-csrf-token", csrf)
      .send({ name: "Rota Tion", email: "rotation@test.dev", password: PASSWORD, role: "CREATOR" })
      .expect(201);
    const original = cookieValue(signup, "memed_rt")!;
    const csrf2 = cookieValue(signup, "memed_csrf")!;

    const refreshed = await agent.post("/api/auth/refresh").set("x-csrf-token", csrf2).expect(200);
    const rotated = cookieValue(refreshed, "memed_rt")!;
    expect(rotated).not.toBe(original);

    // Pretend the grace window passed, then replay the original (stolen) token.
    await RefreshSession.updateMany({ rotatedAt: { $ne: null } }, { $set: { rotatedAt: new Date(Date.now() - 60_000) } });
    await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`memed_rt=${original}`, `memed_csrf=${csrf2}`])
      .set("x-csrf-token", csrf2)
      .expect(401);

    // The whole family is revoked, including the legitimately rotated token.
    await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`memed_rt=${rotated}`, `memed_csrf=${csrf2}`])
      .set("x-csrf-token", csrf2)
      .expect(401);
    expect(await RefreshSession.countDocuments({ revokedReason: "reuse_detected" })).toBeGreaterThan(0);
  });

  it("treats a near-simultaneous second refresh as a race, not theft", async () => {
    const u = await registerUser(app, "CREATOR");
    const [a, b] = await Promise.all([
      u.agent.post("/api/auth/refresh").set("x-csrf-token", u.csrf),
      u.agent.post("/api/auth/refresh").set("x-csrf-token", u.csrf),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await RefreshSession.countDocuments({ revokedAt: { $ne: null } })).toBe(0);
  });

  it("logout revokes the refresh token and clears cookies", async () => {
    const u = await registerUser(app, "BRAND");
    const res = await u.agent.post("/api/auth/logout").set("x-csrf-token", u.csrf).expect(200);
    expect((res.headers["set-cookie"] as unknown as string[]).join(";")).toMatch(/memed_at=;/);
    await u.agent.get("/api/auth/me").expect(401);
    await u.agent.post("/api/auth/refresh").set("x-csrf-token", u.csrf).expect(401);
  });

  it("logout-all invalidates access tokens on every device immediately", async () => {
    const u = await registerUser(app, "BRAND");
    const other = request.agent(app);
    const pre = await other.get("/api/auth/csrf");
    await other.post("/api/auth/login").set("x-csrf-token", pre.body.data.csrfToken as string).send({ email: u.email, password: PASSWORD }).expect(200);
    await other.get("/api/auth/me").expect(200);

    await u.agent.post("/api/auth/logout-all").set("x-csrf-token", u.csrf).expect(200);
    await other.get("/api/auth/me").expect(401);
  });
});
