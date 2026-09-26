import "server-only";
export const isOrderPreviewEnabled = () =>
  process.env.ENABLE_ORDER_PREVIEW === "true";
