export default async function handler(req, res) {
  try {
    const response = await fetch("http://colormind.io/api/", {
      method: "POST",
      body: JSON.stringify({ model: "default" }),
    });
    const data = await response.json();
    res.setHeader("Content-Type", "application/json");
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch palette" });
  }
}
