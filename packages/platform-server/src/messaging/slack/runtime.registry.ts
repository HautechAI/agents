import { Injectable } from '@nestjs/common';

@Injectable()
export class SlackRuntimeRegistry {
  private tokens = new Map<string, string>();
  setToken(threadId: string, token: string): void {
    this.tokens.set(threadId, token);
  }
  getToken(threadId: string): string | undefined {
    return this.tokens.get(threadId);
  }
  clear(threadId: string): void {
    this.tokens.delete(threadId);
  }
}

