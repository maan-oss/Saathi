// Errors a person can fix. `code` is what the app shows a message for.
export class ToolError extends Error {
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    this.extra = extra;
  }
}
