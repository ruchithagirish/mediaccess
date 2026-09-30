const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";

export async function sanityQuery<T>(query: string, fallback: T): Promise<T> {
  if (!projectId) return fallback;

  const url = new URL(`https://${projectId}.api.sanity.io/v2024-10-01/data/query/${dataset}`);
  url.searchParams.set("query", query);

  const response = await fetch(url, { next: { revalidate: 60 } });
  if (!response.ok) throw new Error(`Sanity query failed with status ${response.status}.`);
  const result = await response.json() as { result?: T };
  return result.result ?? fallback;
}