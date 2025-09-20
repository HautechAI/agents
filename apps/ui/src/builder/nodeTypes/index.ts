import { SlackTriggerNode } from './SlackTriggerNode';
import { AgentNode } from './AgentNode';
import { SendSlackMessageNode } from './SendSlackMessageNode';

export const nodeTypes = {
  'slack-trigger': SlackTriggerNode,
  'agent': AgentNode,
  'send-slack-message': SendSlackMessageNode
};
