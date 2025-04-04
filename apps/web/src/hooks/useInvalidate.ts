import { queryClient } from "@nasti/common/utils"
import { QueryKey } from "@tanstack/react-query"
import { useCallback } from "react"

export const useInvalidate = (queryKey: QueryKey) => {
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey })
  }, [queryKey])
}
