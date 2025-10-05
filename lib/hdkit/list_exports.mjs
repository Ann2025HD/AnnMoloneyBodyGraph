let HD = null;
try { HD = await import("./hdkit.js"); }
catch (e) {
  console.error("Could not load hdkit.js:", e.message);
  process.exit(1);
}
console.log("HDKIT EXPORTS:", Object.keys(HD));
