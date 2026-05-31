export default function handler(_req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ok: true,
    service: "stocksage-api",
    predictionService: true,
    endpoints: ["/api/chart", "/api/predict", "/api/predict-batch"],
    ts: new Date().toISOString(),
  });
}
