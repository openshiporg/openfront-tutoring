export class CommandError extends Error {
  constructor(message: string, readonly data?: Record<string, unknown>) {
    super(message)
    this.name = 'CommandError'
  }
}
