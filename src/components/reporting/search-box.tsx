import { Input } from "@/components/ui/input";

/**
 * Search as a plain GET form.
 *
 * No client state and no debounce: the query ends up in the URL, so a filtered
 * view can be bookmarked and shared, and the page stays a server component.
 */
export function SearchBox({
  basePath,
  params,
  defaultValue,
  placeholder = "Search",
}: {
  basePath: string;
  /** Filters to preserve when the search is submitted. */
  params: Record<string, string | undefined>;
  defaultValue: string;
  placeholder?: string;
}) {
  return (
    <form action={basePath} className="flex items-center gap-1.5">
      {Object.entries(params).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}
      <label htmlFor="search" className="sr-only">
        {placeholder}
      </label>
      <Input
        id="search"
        name="search"
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-8 w-56 text-xs"
      />
    </form>
  );
}
