export async function onRequestGet({ request, env }) {
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
    const host = new URL(request.url).hostname;
    const isFeaturePreview = host.endsWith(".application-de-missions-r-mun-r-es-madagascar.pages.dev") &&
      host !== "application-de-missions-r-mun-r-es-madagascar.pages.dev";

    return Response.json(
      {
        success: false,
        message: "Tsy tafita ny fifandraisana amin'ny D1.",
        ...(isFeaturePreview ? { debug: String(error?.message || error || "Unknown error").slice(0, 300) } : {})
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
