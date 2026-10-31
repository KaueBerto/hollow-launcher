'use strict';
const os = require('node:os');

const GIB = 1024 ** 3;

function memoryLimits(totalBytes = os.totalmem()) {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) throw Error('Não foi possível detectar a memória do computador.');
  // Match the whole-GB capacity shown by Windows. Players may choose the full
  // physical capacity, while the automatic default remains conservative.
  const totalGB = Math.round(totalBytes / GIB);
  const maximumGB = Math.max(2, totalGB);
  const conservativeGB = Math.max(2, totalGB - Math.max(2, Math.ceil(totalGB / 4)));
  return Object.freeze({
    totalGB, minimumGB: 2, maximumGB,
    recommendedGB: Math.min(6, conservativeGB), supported: totalGB >= 4,
  });
}

function clampRam(value, memory) {
  const requested = Number(value);
  const ram = Number.isFinite(requested) && requested > 0 ? Math.round(requested) : memory.recommendedGB;
  return Math.max(memory.minimumGB, Math.min(memory.maximumGB, ram));
}

module.exports = { memoryLimits, clampRam, GIB };
