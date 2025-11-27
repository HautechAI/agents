import { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

type SystemLikeMessage = ResponseInputItem.Message & { role: 'system' | 'developer' };

export class SystemMessage {
  private readonly _source: SystemLikeMessage;

  constructor(source: SystemLikeMessage) {
    this._source = source;
  }

  get type(): 'message' {
    return this._source.type ?? 'message';
  }

  get role(): 'developer' {
    return 'developer';
  }

  get text(): string {
    return this._source.content.find((c) => c.type === 'input_text')?.text ?? '';
  }

  static fromText(text: string): SystemMessage {
    return new SystemMessage({
      role: 'developer',
      content: [{ type: 'input_text', text }],
    });
  }

  toPlain(): ResponseInputItem.Message {
    if (this._source.role === 'developer') {
      return this._source;
    }

    return { ...this._source, role: 'developer' };
  }
}
