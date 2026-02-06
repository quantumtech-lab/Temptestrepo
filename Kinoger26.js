

/* =========================
   1. SEARCH RESULTS
   ========================= */
const BASE_URL = "https://kinoger.to";

function searchResults(html) {
    const results = [];

    // Each result is wrapped in this block
    const blocks = html.split('<div class="titlecontrol">');

    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];

        // Title + href
        const linkMatch = block.match(
            /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/
        );
        if (!linkMatch) continue;

        let href = linkMatch[1].trim();
        let title = linkMatch[2]
            .replace(/<[^>]+>/g, "")   // strip HTML
            .replace(/\s+Film$/i, "") // remove " Film"
            .trim();

        // Poster image
        const imgMatch = block.match(
            /<img\s+[^>]*src="([^"]+)"/i
        );
        let image = imgMatch ? imgMatch[1].trim() : "";

        // Normalize URLs
        if (href && !href.startsWith("http")) {
            href = BASE_URL + href;
        }
        if (image && !image.startsWith("http")) {
            image = BASE_URL + image;
        }

        if (title && href) {
            results.push({
                title: title,
                image: image,
                href: href
            });
        }
    }

    return results;
}

/* =========================
   2. DETAILS
   ========================= */
function extractDetails(html) {
    const details = {
        title: "",
        description: "",
        image: "",
        year: "",
        runtime: "",
        rating: "",
        genres: [],
        cast: [],
        streams: []
    };

    // --- TITLE ---
    const titleMatch = html.match(
        /<h1[^>]*id="news-title"[^>]*>[\s\S]*?<\/h1>/
    );
    if (titleMatch) {
        details.title = titleMatch[0]
            .replace(/<[^>]+>/g, "")
            .trim();
    }

    // --- POSTER ---
    const posterMatch = html.match(
        /<img\s+src="(https?:\/\/[^"]+)"[^>]*alt="[^"]*"\s*style="float:left/i
    );
    if (posterMatch) {
        details.image = posterMatch[1];
    }

    // --- DESCRIPTION ---
    const descMatch = html.match(
        /<\/div>\s*<span[^>]*>.*?<\/span>\s*([^<]+)<br><br>/s
    );
    if (descMatch) {
        details.description = descMatch[1].trim();
    }

    // --- YEAR ---
    const yearMatch = details.title.match(/\((\d{4})\)/);
    if (yearMatch) {
        details.year = yearMatch[1];
    }

    // --- RUNTIME ---
    const runtimeMatch = html.match(/Spielzeit:\s*([0-9]+)\s*min/i);
    if (runtimeMatch) {
        details.runtime = runtimeMatch[1] + " min";
    }

    // --- IMDB ---
    const imdbMatch = html.match(/Imdb:\s*([0-9.]+)\/10/i);
    if (imdbMatch) {
        details.rating = imdbMatch[1];
    }

    // --- GENRES ---
    const genreMatch = html.match(/Kategorien, Genre:\s*([^<]+)/i);
    if (genreMatch) {
        details.genres = genreMatch[1]
            .split(" ")
            .map(g => g.trim())
            .filter(Boolean);
    }

    // --- CAST ---
    const castMatch = html.match(/Schauspieler:\s*([^<]+)/i);
    if (castMatch) {
        details.cast = castMatch[1]
            .split(" ")
            .map(a => a.trim())
            .filter(Boolean);
    }

    // --- STREAM IFRAME URLS ---
    const iframeRegex = /<iframe[^>]+src="(https?:\/\/[^"]+)"/gi;
    let iframeMatch;
    while ((iframeMatch = iframeRegex.exec(html)) !== null) {
        details.streams.push({
            url: iframeMatch[1],
            quality: "HD",
            type: "iframe"
        });
    }

    return details;
}
/* =========================
   3. EPISODES
   ========================= */
function extractEpisodes(html) {
    const episodes = [];

    // Find the .show(...) call that contains episode structure
    const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/;
    const match = html.match(showRegex);

    // Fallback: treat as movie-like entry
    if (!match) {
        episodes.push({
            href: "movie|s=0|e=0",
            number: "1"
        });
        return episodes;
    }

    let raw = match[1];

    // Convert JS array → valid JSON
    try {
        raw = raw
            .replace(/'/g, '"')
            .replace(/,\s*\]/g, "]");

        const seasons = JSON.parse(raw);

        seasons.forEach((season, sIndex) => {
            if (!Array.isArray(season)) return;

            season.forEach((_, eIndex) => {
                episodes.push({
                    href: `series|s=${sIndex}|e=${eIndex}`,
                    number: String(eIndex + 1),
                    season: String(sIndex + 1),
                    title: `S${sIndex + 1}E${eIndex + 1}`
                });
            });
        });

    } catch (e) {
        // If parsing fails, return empty list safely
        return [];
    }

    return episodes;
}

/* =========================
   4. STREAM ASYNC
   ========================= */
async function extractStreamUrl(input) {
    try {
        let html = input;
        let sIdx = 0;
        let eIdx = 0;

        // If Sora passed our synthetic episode token
        if (typeof input === "string" && input.indexOf("series|") === 0) {
            const sMatch = input.match(/s=(\d+)/);
            const eMatch = input.match(/e=(\d+)/);
            sIdx = sMatch ? parseInt(sMatch[1], 10) : 0;
            eIdx = eMatch ? parseInt(eMatch[1], 10) : 0;

            // Sora still provides the original HTML in streamAsyncJS
            // so we do NOT fetch the page again
        }

        // Extract the JS episode structure
        const showRegex = /\.show\(\s*\d+\s*,\s*(\[\[[\s\S]*?\]\])\s*\)/;
        const match = html.match(showRegex);
        if (!match) return null;

        const seasons = JSON.parse(
            match[1]
                .replace(/'/g, '"')
                .replace(/,\s*\]/g, "]")
        );

        if (
            !seasons[sIdx] ||
            !seasons[sIdx][eIdx]
        ) return null;

        const mirrors = seasons[sIdx][eIdx];
        const streams = [];

        for (let i = 0; i < mirrors.length; i++) {
            const mirror = mirrors[i];
            if (!mirror.includes("strmup.to")) continue;

            const fileCode = mirror.split("/").pop();
            const ajaxUrl = `https://strmup.to/ajax/stream?filecode=${fileCode}`;

            const ajaxRes = await fetchv2(
                ajaxUrl,
                {
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": "https://strmup.to",
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
                }
            );

            const ajaxData = await ajaxRes.json();
            if (!ajaxData || !ajaxData.streaming_url) continue;

            const streamUrl = ajaxData.streaming_url.replace(/\\/g, "");

            streams.push({
                title: "StrmUp",
                streamUrl: streamUrl,
                headers: {
                    "Referer": "https://strmup.to",
                    "Origin": "https://strmup.to",
                    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
                }
            });
        }

        return streams.length ? streams[0].streamUrl : null;

    } catch (e) {
        return null;
    }
}

