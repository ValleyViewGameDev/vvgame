class Queue {
    constructor() {
      this.queue = [];
      this.processing = false;
    }
  
    enqueue(task) {
      this.queue.push(task);
      this.processNext();
    }
  
    async processNext() {
      if (this.processing || this.queue.length === 0) {
        return;
      }
  
      this.processing = true;
      const task = this.queue.shift();
  
      try {
        await task();
      } catch (error) {
        console.error('Error processing task:', error);
      } finally {
        this.processing = false;
        this.processNext();
      }
    }
  }
  
  module.exports = new Queue();