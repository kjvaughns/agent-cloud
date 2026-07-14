import * as React from "react";
import { isRedirect, useRouter } from "@tanstack/react-router";

export function useServerFn<T extends (...args: any[]) => Promise<any> | any>(serverFn: T): T {
  const router = useRouter();

  return React.useCallback(async (...args: Parameters<T>) => {
    try {
      const result = await serverFn(...args);
      if (isRedirect(result)) throw result;
      return result;
    } catch (error) {
      if (isRedirect(error)) {
        error.options._fromLocation = router.stores.location.get();
        return router.navigate(router.resolveRedirect(error).options);
      }
      throw error;
    }
  }, [router, serverFn]) as T;
}