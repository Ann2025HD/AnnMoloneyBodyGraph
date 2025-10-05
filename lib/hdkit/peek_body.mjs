const mod = await import("./bodygraph-data.js").catch(e => {
  console.error("import failed:", e.message);
  process.exit(1);
});
const def = mod.default ?? mod;
function keysOf(x){
  try { return Object.getOwnPropertyNames(x); } catch(e){ return []; }
}
console.log("MODULE KEYS:", Object.keys(mod));
console.log("DEFAULT TYPE:", Object.prototype.toString.call(def).slice(8,-1));
console.log("DEFAULT KEYS:", typeof def==="object" && def ? keysOf(def) : []);
