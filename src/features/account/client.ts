"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  customerEpoch,
  isCurrentCustomerEpoch,
} from "@/features/auth/session-version";
export class AccountRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function useAccountRequest() {
  const epoch = useRef(customerEpoch()).current;
  return useCallback(
    async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
      if (!isCurrentCustomerEpoch(epoch))
        throw new AccountRequestError("로그인 상태가 변경되었어요.", 409);
      const response = await fetch(`/api/account/${path}`, {
        method,
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Customer-Epoch": epoch,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const value = await response.json();
      if (!isCurrentCustomerEpoch(epoch))
        throw new AccountRequestError("로그인 상태가 변경되었어요.", 409);
      if (!response.ok)
        throw new AccountRequestError(
          value.error || "정보를 불러오지 못했어요.",
          response.status,
        );
      return value as T;
    },
    [epoch],
  );
}
export function useAccountData<T>(
  path: string,
  optional = false,
  enabled = true,
) {
  const request = useAccountRequest();
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: string;
  }>({ key: "", data: null, error: "" });
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([path, revision, optional, enabled]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    request<T>(path)
      .then((data) => {
        if (live) setState({ key, data, error: "" });
      })
      .catch((error) => {
        if (live)
          setState({
            key,
            data: null,
            error:
              optional &&
              error instanceof AccountRequestError &&
              [401, 403].includes(error.status)
                ? ""
                : error.message,
          });
      });
    return () => {
      live = false;
    };
  }, [path, request, key, optional, enabled]);
  return {
    data: state.key === key ? state.data : null,
    loading: enabled && state.key !== key,
    error: state.key === key ? state.error : "",
    reload: () => setRevision((n) => n + 1),
  };
}
