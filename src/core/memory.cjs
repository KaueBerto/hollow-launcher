'use strict';
const os = require('node:os');

const GIB = 1024 ** 3;

function memoryLimits(totalBytes = os.totalmem()) {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) throw Error('Não foi possível detectar a memória do computador.');
  // Match the whole-GB capacity shown to players, allowing for hardware-reserved memory.
  const totalGB = Math.round(totalBytes / GIB);
  const reservedGB = Math.max(2, Math.ceil(totalGB / 4));
  const maximumGB = Math.max(2, totalGB - reservedGB);
  return Object.freeze({
    totalGB, minimumGB: 2, maximumGB, reservedGB,
    recommendedGB: Math.min(6, maximumGB), supported: totalGB >= 4,
  });
}

function clampRam(value, memory) {
  const requested = Number(value);
  const ram = Number.isFinite(requested) && requested > 0 ? Math.round(requested) : memory.recommendedGB;
  return Math.max(memory.minimumGB, Math.min(memory.maximumGB, ram));
}

module.exports = { memoryLimits, clampRam, GIB };
