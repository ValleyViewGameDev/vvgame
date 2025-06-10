const queuesByKey = new Map();

function enqueueByKey(key, task) {
  if (!queuesByKey.has(key)) {
    queuesByKey.set(key, {
      queue: [],
      processing: false,
    });
  }

  const queueObj = queuesByKey.get(key);
  queueObj.queue.push(task);

  processNext(key);
}

async function processNext(key) {
  const queueObj = queuesByKey.get(key);
  if (!queueObj || queueObj.processing || queueObj.queue.length === 0) {
    return;
  }

  queueObj.processing = true;
  const task = queueObj.queue.shift();

  try {
    await task();
  } catch (error) {
    console.error(`Error processing task for key ${key}:`, error);
  } finally {
    queueObj.processing = false;
    processNext(key);
  }
}

module.exports = {
  enqueueByKey,
};