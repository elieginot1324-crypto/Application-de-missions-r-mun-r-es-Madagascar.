
export async function onRequestGet({ env }) {
  try {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    ).all();

    return Response.json({
      success: true,
      message: "Mifandray tsara amin'ny MADAGASCAR EARN D1 ny API!",
      tables: result.results.map((table) => table.name)
    });
  } catch (error) {
    return Response.json({
      success: false,
      message: "Tsy tafita ny fifandraisana amin'ny D1.",
      error: error.message
    }, { status: 500 });
  }
}
