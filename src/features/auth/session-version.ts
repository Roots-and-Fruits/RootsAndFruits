// A non-secret generation marker. Only explicit successful login/logout rotates it.
export const customerEpochCookie = "rf-customer-epoch";
export const customerEpochStorage = "roots-and-fruits:customer-epoch";
export const customerResetEvent = "customer-session-reset";
export function customerEpoch() {
  if (typeof document === "undefined") return "";
  return (
    document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${customerEpochCookie}=`))
      ?.slice(customerEpochCookie.length + 1) ?? ""
  );
}
export function isCurrentCustomerEpoch(epoch: string) {
  return epoch === customerEpoch();
}
