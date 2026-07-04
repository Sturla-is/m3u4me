export interface ParsedChannel {
  name: string;
  url: string;
  logo: string | null;
  tvgId: string | null;
  category: string;
}

export function parseM3U(content: string): ParsedChannel[] {
  const lines = content.split(/\r?\n/);
  const channels: ParsedChannel[] = [];
  
  let currentChannel: Partial<ParsedChannel> = {};
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    if (line.startsWith('#EXTINF:')) {
      // Parse attributes
      // e.g. #EXTINF:-1 tvg-id="id1" tvg-logo="url" group-title="cat",Channel Name
      currentChannel = {
        name: 'Unknown Channel',
        category: 'General',
        logo: null,
        tvgId: null,
      };
      
      const titleMatch = line.match(/,(.+)$/);
      if (titleMatch) {
        currentChannel.name = titleMatch[1].trim();
      }

      const tvgIdMatch = line.match(/tvg-id="([^"]+)"/i);
      if (tvgIdMatch) currentChannel.tvgId = tvgIdMatch[1];

      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      if (logoMatch) currentChannel.logo = logoMatch[1];
      
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      if (groupMatch) currentChannel.category = groupMatch[1];
      
    } else if (!line.startsWith('#')) {
      if (currentChannel.name) {
        currentChannel.url = line;
        channels.push(currentChannel as ParsedChannel);
        currentChannel = {};
      }
    }
  }
  
  return channels;
}
