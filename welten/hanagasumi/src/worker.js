import { createWorld } from './world.js';
let world = null;
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') { world = createWorld(m.seed); return; }
  if (m.type === 'origin') { world.setOrigin(m.ox, m.oz); return; }
  let result, transfer = [];
  if (m.type === 'chunk') {
    result = world.genChunk(...m.args);
    transfer = [result.pos.buffer, result.nor.buffer, result.aux.buffer];
    if (result.depth) transfer.push(result.depth.buffer);
  } else if (m.type === 'veg') {
    result = world.genVeg(...m.args);
    transfer = result.map((a) => a.buffer);
  } else if (m.type === 'grass') {
    result = world.genGrass(...m.args);
    transfer = [result.data.buffer];
  }
  self.postMessage({ id: m.id, result }, transfer);
};
