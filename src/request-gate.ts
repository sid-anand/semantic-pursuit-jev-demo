export class RequestGate {
  private sequence = 0;
  private current = "";

  next(prefix = "pursuit"): string {
    this.current = `${prefix}-${++this.sequence}`;
    return this.current;
  }

  isCurrent(requestId: string): boolean {
    return requestId === this.current;
  }
}
