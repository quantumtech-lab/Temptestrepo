//const BASE_URL = "https://kinoger.to";

/* =========================
   1. SEARCH RESULTS
   ========================= */
function searchResults(html) {
    var results = [];

    // Split results safely
    var blocks = html.split('<div class="separator2"></div>');

    for (var i = 0; i < blocks.length; i++) {
        var block = blocks[i];

        // Title + URL
        var titleMatch = block.match(
            /<div class="titlecontrol">[\s\S]*?<a href="([^"]+)">([^<]+)<\/a>/
        );
        if (!titleMatch) continue;

        var url = titleMatch[1].trim();
        var title = titleMatch[2].trim();

        // Poster
        var posterMatch = block.match(
            /<!--dle_image_begin:([^|]+)\|/
        );
        var poster = posterMatch ? posterMatch[1].trim() : null;

        // Description (strip tags)
        var descMatch = block.match(
            /<div class="content_text searchresult_img">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/
        );
        var description = "";
        if (descMatch) {
            description = descMatch[1]
                .replace(/<img[\s\S]*?>/, "")
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<[^>]+>/g, "")
                .trim();
        }

        results.push({
            title: title,
            url: url,
            image: poster,
            description: description
        });
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
