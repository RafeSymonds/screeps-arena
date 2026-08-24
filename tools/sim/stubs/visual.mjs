// The sandbox draws debug overlays through this; the simulator has no canvas,
// so every call is a no-op that returns `this` for chaining.
export class Visual {
  constructor() {
    this.layer = 0;
    this.persistent = false;
  }
  circle() {
    return this;
  }
  clear() {
    return this;
  }
  line() {
    return this;
  }
  poly() {
    return this;
  }
  rect() {
    return this;
  }
  text() {
    return this;
  }
  size() {
    return 0;
  }
}
