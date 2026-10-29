import type { IngestRequest, IngestResponse } from './ingestProtocol';
import { runLogIngest } from './logIngest';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<IngestRequest>) => void) | null;
  postMessage: (message: IngestResponse) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  if (request.kind !== 'parse-log') return;
  try {
    runLogIngest(request, (message) => scope.postMessage(message));
  } catch (error) {
    scope.postMessage({
      kind: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'Log import failed.',
    });
  }
};
