
async function verifyPassword(password, storedHash) {
  try {
    const parts = storedHash.split("$");

    if (parts.length !== 4 || parts[0] !== "pbkdf2") {
      return false;
    }

    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations !== 100000) {
      return false;
    }

    const salt = Uint8Array.from(
      atob(parts[2]),
      c => c.charCodeAt(0)
    );

    const expected = Uint8Array.from(
      atob(parts[3]),
      c => c.charCodeAt(0)
    );

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      key,
      256
    );

    const actual = new Uint8Array(bits);

    if (actual.length !== expected.length) return false;

    let difference = 0;
    for (let i = 0; i < actual.length; i++) {
      difference |= actual[i] ^ expected[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
}

async function hashToken(token) {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();

    const identifier = String(data.identifier || "")
      .trim()
      .toLowerCase();

    const password = String(data.password || "");

    if (!identifier || !password || password.length > 128) {
      return Response.json({
        success: false,
        message: "Ampidiro ny email na finday sy ny tenimiafina."
      }, { status: 400 });
    }

    const user = await env.DB.prepare(
      `SELECT id, full_name, email, phone,
              password_hash, role, status
       FROM users
       WHERE email = ? OR phone = ?
       LIMIT 1`
    ).bind(identifier, identifier).first();

  if (!user) {
  console.log("LOGIN_CHECK: USER_NOT_FOUND");

  return Response.json({
    success: false,
    message: "Tsy hita ny kaonty."
  }, { status: 401 });
}

const passwordValid = await verifyPassword(
  password,
  user.password_hash
);

if (!passwordValid) {
  console.log("LOGIN_CHECK: PASSWORD_INVALID");

  return Response.json({
    success: false,
    message: "Tsy mifanaraka ny tenimiafina."
  }, { status: 401 });
}

console.log("LOGIN_CHECK: PASSWORD_VALID");
    if (user.status !== "active") {
      return Response.json({
        success: false,
        message: "Mbola tsy nekena na tsy afaka miditra ny kaontinao."
      }, { status: 403 });
    }

    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes)
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");

    const tokenHash = await hashToken(token);

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    await env.DB.prepare(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`
    ).bind(user.id, tokenHash, expiresAt).run();

    await env.DB.prepare(
      `INSERT INTO audit_logs
       (actor_user_id, action, target_type, target_id, details)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      user.id,
      "login",
      "user",
      user.id,
      "Fidirana nahomby"
    ).run();

    return Response.json({
      success: true,
      message: "Tafiditra soa aman-tsara ianao.",
      user: {
        id: user.id,
        full_name: user.full_name,
        role: user.role
      }
    }, {
      headers: {
        "Set-Cookie":
          `me_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
        "Cache-Control": "no-store"
      }
    });

  } catch (error) {
    console.error("LOGIN_ERROR:", error);

    return Response.json({
      success: false,
      message: "Nisy olana teo am-pidirana."
    }, { status: 500 });
  }
}
