const BASE_URL = "https://kinoger.to";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
//Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15

function searchResults(html) {
    const results = [];

    const blocks = html.split('<div class="titlecontrol">');
    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];

        const linkMatch = block.match(/<a href="([^"]+)">([\s\S]*?)<\/a>/);
        if (!linkMatch) continue;

        const href = linkMatch[1].startsWith("http")
            ? linkMatch[1]
            : BASE_URL + linkMatch[1];

        const title = linkMatch[2]
            .replace(/<[^>]+>/g, "")
            .replace(" Film", "")
            .trim();

        const imgMatch = block.match(/<img src="([^"]+)"/i);
        const image = imgMatch
            ? (imgMatch[1].startsWith("http") ? imgMatch[1] : BASE_URL + imgMatch[1])
            : "";

        results.push({ title, image, href });
    }

    return results;
}

function extractDetails(html) {
    let description = "German Stream on Kinoger";

    const descMatch = html.match(/text-align:\s*right[^>]*>([\s\S]*?)<br><br>/i);
    if (descMatch) {
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

function extractEpisodes(html) {
    const episodes = [];

    const showMatch = html.match(/\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/);
    if (!showMatch) {
        // Movie fallback
        episodes.push({
            href: "movie",
            number: 1,
            season: 1,
            title: "Movie"
        });
        return episodes;
    }

    const seasons = JSON.parse(showMatch[1].replace(/'/g, '"'));

    seasons.forEach((season, sIdx) => {
        season.forEach((_, eIdx) => {
            episodes.push({
                href: `s=${sIdx}&e=${eIdx}`,
                number: eIdx + 1,
                season: sIdx + 1,
                title: `S${sIdx + 1}E${eIdx + 1}`
            });
        });
    });

    return episodes;
}

async function extractStreamUrl(html) {
    try {
        // 1. Extract mirror matrix
        const showMatch = html.match(/\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/);
        if (!showMatch) return null;

        const seasons = JSON.parse(showMatch[1].replace(/'/g, '"'));

        // Default: first available mirror
        let mirrorUrl = null;
        for (const season of seasons) {
            for (const mirror of season) {
                if (mirror && mirror.includes("strmup.to")) {
                    mirrorUrl = mirror;
                    break;
                }
            }
            if (mirrorUrl) break;
        }

        if (!mirrorUrl) return null;

        // 2. Resolve StrmUp → HLS
        const fileCode = mirrorUrl.split("/").pop();

        const ajaxRes = await fetchv2(
            `https://strmup.to/ajax/stream?filecode=${fileCode}`,
            {
                "Referer": "https://strmup.to",
                "User-Agent": UA
            }
        );

        const ajaxData = await ajaxRes.json();
        if (!ajaxData || !ajaxData.streaming_url) return null;

        // 3. ✅ FINAL RESULT
        return ajaxData.streaming_url.replace(/\\/g, "");

    } catch (e) {
        return null;
    }
}
