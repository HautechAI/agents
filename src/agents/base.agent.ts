import { BaseMessage } from "@langchain/core/messages";
import { Annotation, AnnotationRoot, Messages, messagesStateReducer } from "@langchain/langgraph";

export abstract class BaseAgent {
  state(): AnnotationRoot<{}> {
    return Annotation.Root({
      messages: Annotation<BaseMessage[], Messages>({
        reducer: messagesStateReducer,
        default: () => [],
      }),
    });
  }

  configuration(): AnnotationRoot<{}> {
    return Annotation.Root({
      // systemPrompt: Annotation<string>(),
    });
  }
}
