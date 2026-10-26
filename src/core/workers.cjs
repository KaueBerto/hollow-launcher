'use strict';
async function workers(items, concurrency, operation) {
  let next = 0;
  let failure;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failure && next < items.length) {
      const index = next++;
      try { await operation(items[index], index); } catch (error) { failure ||= error; }
    }
  }));
  if (failure) throw failure;
}

module.exports = { workers };
