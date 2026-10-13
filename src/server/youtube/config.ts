// The three required GTF playlists. IDs resolved from the public channel
// page (youtube.com/@gettogetherfinance/playlists) on 2026-10-11.
export const REQUIRED_PLAYLISTS = [
  {
    youtubeId: "PLJIPsAFU4EXYRMAsPMN7QmHHoGCS6DIQ5",
    title: "Trading In The Zone - Full Course (Mission 2.0)",
  },
  {
    youtubeId: "PLJIPsAFU4EXaDLBeMBHQJEd3XPjO6igi_",
    title: "Trading In The Zone - Elementary",
  },
  {
    youtubeId: "PLJIPsAFU4EXYJCYNXqlzOOpZjHgwFGaGZ",
    title: "Advanced Price Action",
  },
] as const;

export const CHANNEL = "GTF - A STOCK MARKET INSTITUTE";
export const CHANNEL_URL = "https://youtube.com/@gettogetherfinance";

export function playlistUrl(youtubeId: string) {
  return `https://www.youtube.com/playlist?list=${youtubeId}`;
}

export function videoUrl(youtubeId: string) {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}
