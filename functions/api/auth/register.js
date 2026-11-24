async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations: 100000,
    hash: "SHA-256"
  }, key, 256);
  const toBase64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return "pbkdf2$100000$" + toBase64(salt) + "$" + toBase64(bits);
}

async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();
    const fullName = String(data.full_name || "").trim();
    const email = String(data.email || "").trim().toLowerCase() || null;
    const phone = String(data.phone || "").replace(/[\s()-]/g, "") || null;
    const password = String(data.password || "");
    const role = String(data.role || "");

    if (fullName.length < 2 || fullName.length > 100) {
      return json({ success: false, message: "Tsy mety ny anarana." }, 400);
    }
    if (!email && !phone) {
      return json({ success: false, message: "Ampidiro email na laharana finday." }, 400);
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, message: "Tsy mety ny adiresy email." }, 400);
    }
    if (phone && !/^\+?[0-9]{8,15}$/.test(phone)) {
      return json({ success: false, message: "Tsy mety ny laharana finday." }, 400);
    }
    if (password.length < 8 || password.length > 128) {
      return json({
        success: false,
        message: "Ny tenimiafina dia tokony ho 8 ka hatramin'ny 128 caractères."
      }, 400);
    }
    if (!["worker", "client"].includes(role)) {
      return json({ success: false, message: "Safidio ny Mpiasa na Mpanjifa." }, 400);
    }

    // Fanivanana voalohany ihany; tsy porofo farany momba ny hosoka.
    const suspiciousName =
      /[0-9]{4,}/.test(fullName) ||
      /(https?:\/\/|www\.|<|>)/i.test(fullName);
    const nameParts = fullName.split(/\s+/).filter(Boolean);
    const needsReview = suspiciousName || nameParts.length > 5;

    const existing = await env.DB.prepare(
      "SELECT id FROM users WHERE (? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?) LIMIT 1"
    ).bind(email, email, phone, phone).first();

    if (existing) {
      return json({
        success: false,
        message: "Efa misy kaonty mampiasa io email na finday io."
      }, 409);
    }

    const passwordHash = await hashPassword(password);
    const accountStatus = needsReview ? "pending" : "active";
    const securityStatus = needsReview ? "review" : "clear";

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users (full_name, email, phone, password_hash, role, status, security_status) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(fullName, email, phone, passwordHash, role, accountStatus, securityStatus),
      env.DB.prepare(
        "INSERT INTO wallets (user_id) SELECT id FROM users WHERE (? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?) ORDER BY id DESC LIMIT 1"
      ).bind(email, email, phone, phone)
    ]);

    if (needsReview) {
      return json({
        success: true,
        requires_review: true,
        message: "Voaray ny fisoratana anarana. Mila fanamarinana fanampiny ataon'ny Administrateur ny kaontinao."
      }, 201);
    }

    const newUser = await env.DB.prepare(
      "SELECT id FROM users WHERE (? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?) ORDER BY id DESC LIMIT 1"
    ).bind(email, email, phone, phone).first();

    if (!newUser) {
      throw new Error("REGISTER_USER_LOOKUP_FAILED");
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes)
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)"
      ).bind(newUser.id, tokenHash, expiresAt),
      env.DB.prepare(
        "INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details) VALUES (?, ?, ?, ?, ?)"
      ).bind(newUser.id, "register_and_login", "user", newUser.id, "Fisoratana anarana sy fidirana nahomby")
    ]);

    return json({
      success: true,
      requires_review: false,
      message: "Vita soa aman-tsara ny fisoratana anarana. Tafiditra avy hatrany ianao."
    }, 201, {
      "Set-Cookie": `me_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`
    });

  } catch (error) {
    console.error("REGISTER_ERROR:", error);
    const message = String(error?.message || "");
    if (message.includes("UNIQUE")) {
      return json({
        success: false,
        message: "Efa misy kaonty mampiasa io email na finday io."
      }, 409);
    }
    return json({
      success: false,
      message: "Nisy olana teo am-pisoratana anarana."
    }, 500);
  }
}
