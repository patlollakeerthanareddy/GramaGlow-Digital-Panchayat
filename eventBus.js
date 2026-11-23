const { EventEmitter } = require("events");
const { logger } = require("./logger");

class GovernanceEventBus extends EventEmitter {
  constructor() {
    super();
    this.clients = new Set();
  }

  addClient(res) {
    this.clients.add(res);
    logger.debug({ activeStreams: this.clients.size }, "SSE client subscribed");
  }

  removeClient(res) {
    this.clients.delete(res);
    logger.debug({ activeStreams: this.clients.size }, "SSE client disconnected");
  }

  broadcast(eventType, payload) {
    const packet = `event: ${eventType}\ndata: ${JSON.stringify({
      type: eventType,
      timestamp: new Date().toISOString(),
      payload,
    })}\n\n`;

    for (const res of this.clients) {
      try {
        res.write(packet);
      } catch (err) {
        logger.warn({ err: err.message }, "Failed writing SSE packet; pruning client");
        this.clients.delete(res);
      }
    }
  }

  getActiveClientCount() {
    return this.clients.size;
  }
}

module.exports = { GovernanceEventBus };
