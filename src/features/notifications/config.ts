import { aligoConfig } from "./aligo";

export function notificationConfig(env: NodeJS.ProcessEnv) {
  const config = aligoConfig(env);
  return {
    provider: "aligo" as const,
    config,
    testMode: config?.testMode ?? env.ALIGO_TEST_MODE !== "false",
    ready: !!config,
  };
}
