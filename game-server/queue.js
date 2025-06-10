const gridQueues = new Map();

function enqueueGridUpdate(gridId, task) {
  if (!gridQueues.has(gridId)) {
    gridQueues.set(gridId, {
      queue: [],
      processing: false,
    });
  }

  const queueObj = gridQueues.get(gridId);
  queueObj.queue.push(task);

  processNext(gridId);
}

async function processNext(gridId) {
  const queueObj = gridQueues.get(gridId);
  if (!queueObj || queueObj.processing || queueObj.queue.length === 0) {
    return;
  }

  queueObj.processing = true;
  const task = queueObj.queue.shift();

  try {
    await task();
  } catch (error) {
    console.error(`Error processing task for grid ${gridId}:`, error);
  } finally {
    queueObj.processing = false;
    processNext(gridId);
  }
}

module.exports = {
  enqueueGridUpdate,
};