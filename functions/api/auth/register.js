
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 210000,
      hash: "SHA-256"
    },
    key,
    256
  );

  const toBase64 = (bytes) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)));

  return `pbkdf2$210000$${toBase64(salt)}$${toBase64(bits)}`;
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
      return Response.json({
        success: false,
        message: "Tsy mety ny anarana."
      }, { status: 400 });
    }

    if (!email && !phone) {
      return Response.json({
        success: false,
        message: "Ampidiro email na laharana finday."
      }, { status: 400 });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({
        success: false,
        message: "Tsy mety ny adiresy email."
      }, { status: 400 });
    }

    if (phone && !/^\+?[0-9]{8,15}$/.test(phone)) {
      return Response.json({
        success: false,
        message: "Tsy mety ny laharana finday."
      }, { status: 400 });
    }

    if (password.length < 8 || password.length > 128) {
      return Response.json({
        success: false,
        message: "Ny mot de passe dia tokony ho 8 ka hatramin'ny 128 caractères."
      }, { status: 400 });
    }

    if (!["worker", "client"].includes(role)) {
      return Response.json({
        success: false,
        message: "Safidio ny Mpiasa na Mpanjifa."
      }, { status: 400 });
    }

    const existing = await env.DB.prepare(
      "SELECT id FROM users WHERE (? IS NOT NULL AND email = ?) OR (? IS NOT NULL AND phone = ?) LIMIT 1"
    ).bind(email, email, phone, phone).first();

    if (existing) {
      return Response.json({
        success: false,
        message: "Efa misy kaonty mampiasa io email na finday io."
      }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users
        (full_name, email, phone, password_hash, role)
        VALUES (?, ?, ?, ?, ?)`
      ).bind(fullName, email, phone, passwordHash, role),

      env.DB.prepare(
        `INSERT INTO wallets (user_id)
        SELECT id FROM users
        WHERE (? IS NOT NULL AND email = ?)
           OR (? IS NOT NULL AND phone = ?)
        ORDER BY id DESC LIMIT 1`
      ).bind(email, email, phone, phone)
    ]);

    return Response.json({
      success: true,
      message: "Vita soa aman-tsara ny fisoratana anarana. Miandry fanamarinana ny kaontinao."
    }, { status: 201 });


  } catch (error) {
    console.error("REGISTER_ERROR:", error);

    const message = String(error?.message || "");

    if (message.includes("UNIQUE")) {
      return Response.json({
        success: false,
        message: "Efa misy kaonty mampiasa io email na finday io."
      }, { status: 409 });
    }

    return Response.json({
      success: false,
      message: "Nisy olana teo am-pisoratana anarana.",
      debug: message
    }, { status: 500 });
  }
}
