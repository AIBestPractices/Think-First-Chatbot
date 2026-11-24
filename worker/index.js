// Think-First Robot: Cloudflare Worker entry point.
// The logic lives in chat.js. Keep this file to the default export only: the Workers runtime
// treats any other export here as an entry point and fails to start on plain values.
import { handleRequest } from './chat.js';

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
