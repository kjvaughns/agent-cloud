import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@/hooks/use-server-fn";
import { listFavorites, toggleFavorite } from "@/lib/favorites.functions";

const KEY = ["page-favorites"];

/**
 * Starred pages for the signed-in person.
 *
 * The toggle is optimistic. Starring a page is a small, reversible preference,
 * and a star that waits on a round trip before filling in feels broken in a
 * way that a slow save does not.
 */
export function useFavorites() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFavorites);
  const toggleFn = useServerFn(toggleFavorite);

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => listFn(),
    staleTime: 5 * 60_000,
  });

  const pageIds: string[] = data?.pageIds ?? [];

  const toggle = useMutation({
    mutationFn: (v: { page_id: string; starred: boolean }) => toggleFn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<{ pageIds: string[] }>(KEY);
      const next = v.starred
        ? [...(prev?.pageIds ?? []).filter((id) => id !== v.page_id), v.page_id]
        : (prev?.pageIds ?? []).filter((id) => id !== v.page_id);
      qc.setQueryData(KEY, { pageIds: next });
      return { prev };
    },
    // Put it back if the write failed, rather than leaving a star that claims
    // something was saved when it was not — and say so, because a star that
    // quietly un-fills itself reads as the app being broken.
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
      toast.error("Could not save that. Your starred pages are unchanged.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });

  return {
    pageIds,
    isLoading,
    isStarred: (id: string) => pageIds.includes(id),
    toggle: (id: string, starred: boolean) => toggle.mutate({ page_id: id, starred }),
  };
}
