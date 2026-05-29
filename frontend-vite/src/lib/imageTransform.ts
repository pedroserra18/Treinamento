// Supabase Storage Image Transformations helper.
//
// Public URLs look like:
//   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
//
// The transform endpoint just swaps the path:
//   https://<project>.supabase.co/storage/v1/render/image/public/<bucket>/<path>?width=...&height=...&resize=cover&quality=80
//
// Image Transformations require the Supabase Pro plan. On the free
// plan the render endpoint returns 400, so we gate the swap behind
// VITE_SUPABASE_TRANSFORM_ENABLED — defaults to false. Set it to true
// when the plan upgrade lands; no code change required after that.
//
// Outside this enabled flag, every caller still receives a usable URL
// (the original), so we can sprinkle this helper everywhere without
// worrying about runtime regressions.

const TRANSFORM_ENABLED =
  (import.meta.env.VITE_SUPABASE_TRANSFORM_ENABLED as string | undefined)?.toLowerCase() === 'true'

type Resize = 'cover' | 'contain' | 'fill'

type Options = {
  width?: number
  height?: number
  resize?: Resize
  quality?: number
}

function isSupabasePublicUrl(url: string): boolean {
  return /\/storage\/v1\/object\/public\//.test(url)
}

// Returns a transformed thumbnail URL when supported, otherwise the
// original URL untouched. Non-Supabase URLs (CDN, external avatars,
// data: URIs) pass through.
export function thumbnailUrl(url: string | null | undefined, opts: Options): string {
  if (!url) return ''
  if (!TRANSFORM_ENABLED || !isSupabasePublicUrl(url)) return url

  const swapped = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/')
  const params = new URLSearchParams()
  if (opts.width) params.set('width', String(opts.width))
  if (opts.height) params.set('height', String(opts.height))
  if (opts.resize) params.set('resize', opts.resize)
  if (opts.quality) params.set('quality', String(opts.quality))
  return params.toString() ? `${swapped}?${params.toString()}` : swapped
}

// Common preset for the competition feed grid tile (square 300×300).
// Pulling it into a constant keeps the call sites tidy and lets us
// tweak the size project-wide from one spot.
export function feedTileThumbUrl(url: string | null | undefined): string {
  return thumbnailUrl(url, { width: 300, height: 300, resize: 'cover', quality: 75 })
}

// Avatar preset for member rows / leaderboard. Same idea — small square,
// pretty aggressive compression since avatars are tiny.
export function avatarThumbUrl(url: string | null | undefined, size = 80): string {
  return thumbnailUrl(url, { width: size, height: size, resize: 'cover', quality: 70 })
}
