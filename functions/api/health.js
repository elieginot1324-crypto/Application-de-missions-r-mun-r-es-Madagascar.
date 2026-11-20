export async function onRequestGet({ env }) {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();

    return Response.json(
      {
        success: true,
        message: "Mifandray tsara amin'ny MADAGASCAR EARN D1 ny API."
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  } catch (error) {
    console.error("HEALTH_CHECK_ERROR:", error);

    return Response.json(
      {
        success: false,
        message: "Tsy tafita ny fifandraisana amin'ny D1."
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  }
}
