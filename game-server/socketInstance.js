let io = null;

function setSocketIO(ioInstance) {
  io = ioInstance;
}

function getSocketIO() {
  return io;
}

module.exports = {
  setSocketIO,
  getSocketIO
};