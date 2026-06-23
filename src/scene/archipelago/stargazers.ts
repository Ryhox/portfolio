// ---------------------------------------------------------------------------
// STARGAZERS — the only external data the archipelago needs: the ordered list of
// who has starred the repo (star order = each island's permanent rank).
//
// localStorage is just a fast cache + rate-limit shield; GitHub is the source of
// truth. Stale-while-revalidate: we serve the cached list instantly, then fetch
// fresh in the background and push any change through `onFresh` so a brand-new
// stargazer's island pops in on the visitor's next sail. No server, no webhook.
// ---------------------------------------------------------------------------

const OWNER = 'Ryhox'
const REPO = 'portfolio'
const CACHE_KEY = 'archipelago.stargazers.v1'
const TTL = 5 * 60 * 1000 // serve cache without re-hitting the API for 5 min

const FORCE_REAL =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('realstars')

type Cache = { ts: number; logins: string[] }

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw)
    if (c && Array.isArray(c.logins)) return c as Cache
  } catch {
    /* ignore */
  }
  return null
}

function writeCache(logins: string[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), logins } satisfies Cache))
  } catch {
    /* quota / private mode — fine, we just refetch next time */
  }
}

// Stargazers in ascending star date (so index = rank). The star+json media type
// returns { starred_at, user:{login} }; fall back to plain user objects.
async function fetchAll(): Promise<string[]> {
  const out: string[] = []
  for (let page = 1; page <= 10; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/stargazers?per_page=100&page=${page}`,
      { headers: { Accept: 'application/vnd.github.star+json' } },
    )
    if (!res.ok) throw new Error(`GitHub ${res.status}`)
    const data = (await res.json()) as Array<{ user?: { login?: string }; login?: string }>
    if (!Array.isArray(data) || data.length === 0) break
    for (const item of data) {
      const login = item?.user?.login ?? item?.login
      if (typeof login === 'string') out.push(login)
    }
    if (data.length < 100) break
  }
  return out
}

// Returns the best list available NOW (cache or fetch). If it served a stale
// cache, it revalidates in the background and calls `onFresh` only when the list
// actually changed.
export function loadStargazerLogins(onFresh?: (logins: string[]) => void): Promise<string[]> {
  // No fake crew: every group already has its central Mother Isle, so an empty
  // star list just means clusters with only their mother for now. ?realstars or
  // production fills the rings with real stargazers.
  if (import.meta.env.DEV && !FORCE_REAL) {
    return Promise.resolve([])
  }

  const cache = readCache()
  if (cache && Date.now() - cache.ts < TTL) {
    return Promise.resolve(cache.logins) // fresh enough — no network
  }

  const fetching = fetchAll()
    .then((logins) => {
      writeCache(logins)
      return logins
    })
    .catch((e) => {
      console.warn('[stargazers] fetch failed, using cache/empty', e)
      return cache?.logins ?? []
    })

  if (cache) {
    // Serve stale immediately, push the fresh list through when it lands (if changed).
    const before = cache.logins.join(',')
    fetching.then((logins) => {
      if (onFresh && logins.join(',') !== before) onFresh(logins)
    })
    return Promise.resolve(cache.logins)
  }

  return fetching // no cache yet — wait for the first fetch
}
