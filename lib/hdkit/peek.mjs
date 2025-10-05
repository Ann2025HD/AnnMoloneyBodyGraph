const mod = await import("./hdkit.js").catch(e => {
  console.error("ESM import failed:", e.message);
  process.exit(1);
});
const hd = mod.default ?? mod;

function typeOf(x) {
  const t = typeof x;
  if (t !== "object" && t !== "function") return t;
  return Object.prototype.toString.call(x).slice(8,-1);
}

console.log("HDKIT TYPE:", typeOf(hd));

if (typeof hd === "function") {
  console.log("DEFAULT IS A FUNCTION");
  console.log("FUNCTION NAME:", hd.name || "(anonymous)");
  console.log("OWN PROPS:", Object.getOwnPropertyNames(hd));
} else if (hd && typeof hd === "object") {
  const names = Object.getOwnPropertyNames(hd);
  console.log("DEFAULT OWN PROPERTY NAMES:", names);
  // Show types of each own prop
  for (const k of names) {
    try {
      const v = hd[k];
      const t = typeof v;
      const tag = Object.prototype.toString.call(v).slice(8,-1);
      console.log(` - ${k}: ${t} (${tag})`);
    } catch (e) {
      console.log(` - ${k}: <unreadable>`);
    }
  }
} else {
  console.log("DEFAULT IS:", String(hd));
}
