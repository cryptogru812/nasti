import { QueryKey, useQuery } from "@tanstack/react-query"

import { supabase } from "@nasti/common/supabase"
import { Collection } from "@nasti/common/types"

import { queryClient } from "@nasti/common/utils"

type QueryTuple = [QueryKey, Collection[] | Collection | undefined]

const findItemById = (
  queryDataArray: QueryTuple[],
  targetId: string,
): Collection | undefined => {
  // Iterate through each tuple in the array
  for (const [_, collections] of queryDataArray) {
    if (!collections) continue
    if (!Array.isArray(collections)) {
      if (collections.id === targetId) return collections
    } else {
      const foundItem = collections.find((item) => item.id === targetId)
      if (foundItem) return foundItem
    }
  }
  return undefined
}

export const getCollection = async (id: string) => {
  // first attempt to get it from the global cache
  const cached = queryClient.getQueriesData<Collection[]>({
    queryKey: ["collections"],
  })
  if (cached) {
    const collection = findItemById(cached, id)
    if (collection) return collection
  }

  const { data, error } = await supabase
    .from("collection")
    .select("*")
    .eq("id", id)
    .single()

  if (error) throw new Error(error.message)

  return data as Collection
}

export const useCollection = (id: string) => {
  return useQuery({
    queryKey: ["collections", "detail", id],
    queryFn: () => getCollection(id),
  })
}
