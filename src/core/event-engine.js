export class EventEngine {
  constructor(initialEvents = []) {
    this.events = [...initialEvents];
  }

  record(type, payload, actor = "system") {
    const event = {
      id: `evt-${Date.now()}-${this.events.length + 1}`,
      type,
      payload,
      actor,
      createdAt: new Date().toISOString()
    };
    this.events.unshift(event);
    return event;
  }

  list(limit = 20) {
    return this.events.slice(0, limit);
  }
}
