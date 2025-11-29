import { ResponseInputItem } from 'openai/resources/responses/responses.mjs';

export class DeveloperMessage {
  constructor(private _source: ResponseInputItem.Message & { role: 'developer' }) {}

  get type(): 'message' {
    return this._source.type ?? 'message';
  }

  get role(): 'developer' {
    return this._source.role;
  }

  get text(): string {
    return this._source.content.find((c) => c.type === 'input_text')?.text ?? '';
  }

  static fromText(text: string): DeveloperMessage {
    return new DeveloperMessage({
      type: 'message',
      role: 'developer',
      content: [{ type: 'input_text', text }],
    });
  }

  toPlain(): ResponseInputItem.Message {
    return this._source;
  }
}
