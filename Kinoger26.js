const BASE_URL = "https://kinoger.to";

/* =========================
   1. SEARCH RESULTS
   ========================= */
function searchResults(html) {
    const results = [];
    const seen = new Set();

    const blocks = html.split('<div class="titlecontrol">');

    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];

        const linkMatch = block.match(/<a href="([^"]+)">([\s\S]*?)<\/a>/);
        if (!linkMatch) continue;

        let href = linkMatch[1].trim();
        let title = linkMatch[2]
            .replace(/<[^>]+>/g, "")
            .replace(/\s+Film$/i, "")
            .trim();

        const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
        let image = imgMatch ? imgMatch[1].trim() : "";

        if (!href || !title) continue;

        if (!href.startsWith("http")) href = BASE_URL + href;
        if (image && !image.startsWith("http")) image = BASE_URL + image;

        if (seen.has(href)) continue;
        seen.add(href);

        results.push({ title, image, href });
    }

    return results;
}

/* =========================
   2. DETAILS
   ========================= */
function extractDetails(html) {
    let description = "German stream on Kinoger";

    const descMatch = html.match(
        /<div[^>]+style="text-align:\s*right[^"]*"[^>]*>[\s\S]*?<\/div>\s*([\s\S]*?)<br><br>/i
    );

    if (descMatch?.[1]) {
        description = descMatch[1]
            .replace(/<[^>]+>/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    return [{
        description,
        aliases: "HD Stream",
        airdate: "Kinoger"
    }];
}

/* =========================
   3. EPISODES
   ========================= */
function extractEpisodes(html) {
    const episodes = [];

    const showMatch = html.match(/\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/);
    if (!showMatch) {
        // movie fallback
        return [{
            href: "movie",
            number: 1,
            title: "Movie"
        }];
    }

    let seasons;
    try {
        seasons = JSON.parse(
            showMatch[1].replace(/'/g, '"').replace(/,\s*\]/g, "]")
        );
    } catch {
        return [];
    }

    seasons.forEach((season, s) => {
        season.forEach((_, e) => {
            episodes.push({
                href: `s=${s}&e=${e}`,
                number: e + 1,
                season: s + 1,
                title: seasons.length > 1
                    ? `S${s + 1}E${e + 1}`
                    : `Episode ${e + 1}`
            });
        });
    });

    return episodes;
}

/* =========================
   4. STREAM ASYNC
   ========================= */
async function extractStreamUrl(html, episodeData) {
    let s = 0;
    let e = 0;

    if (episodeData && episodeData !== "movie") {
        const params = new URLSearchParams(episodeData);
        s = parseInt(params.get("s") || "0");
        e = parseInt(params.get("e") || "0");
    }

    const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/g;
    let match;
    let seasons = null;

    while ((match = showRegex.exec(html)) !== null) {
        try {
            const parsed = JSON.parse(
                match[1].replace(/'/g, '"').replace(/,\s*\]/g, "]")
            );
            if (parsed?.[s]?.[e]) {
                seasons = parsed;
                break;
            }
        } catch {}
    }

    if (!seasons) return null;

    let embed = seasons[s][e].trim();
    if (embed.startsWith("//")) embed = "https:" + embed;

    // Direct iframe — let Sora handle it
    return embed;
}
