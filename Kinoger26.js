

/* =========================
   1. SEARCH RESULTS
   ========================= */
const BASE_URL = "https://kinoger.to";

function searchResults(html) {
    const results = [];

    // Each result block starts with titlecontrol + general_box
    const blocks = html.split('<div class="titlecontrol">');

    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];

        // Extract href + title
        const linkMatch = block.match(
            /<img[^>]*class="img">[\s\S]*?<a href="([^"]+)">([\s\S]*?)<\/a>/
        );
        if (!linkMatch) continue;

        let href = linkMatch[1].trim();
        let title = linkMatch[2]
            .replace(/<[^>]+>/g, "")
            .trim();

        // Parse image (Kinoger uses dle_image_begin comment)
        const imgMatch = block.match(/<!--dle_image_begin:([^|]+)\|/);
        let image = imgMatch ? imgMatch[1].trim() : "";

        // Normalize relative URLs
        if (href && href.startsWith("/")) {
            href = "https://kinoger.to" + href;
        }
        if (image && image.startsWith("/")) {
            image = "https://kinoger.to" + image;
        }

        // Determine type: series if “staffel”, “serie” appears in categories
        let type = "movie";
        if (/<a href="https:\/\/kinoger.to\/stream\/serie\//i.test(block)
         || /Staffel/i.test(block)) {
            type = "series";
        }

        results.push({
            title: title,
            image: image,
            href: href,
            type: type
        });
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
    const seasons = [];
    const seasonBlocks = html.split('<div class="season"');

    for (let i = 1; i < seasonBlocks.length; i++) {
        const block = seasonBlocks[i];
        const seasonMatch = block.match(/data-season="(\d+)"/);
        if (!seasonMatch) continue;

        const seasonNumber = parseInt(seasonMatch[1]);
        const episodes = [];

        const episodeBlocks = block.split('<div class="episode"');
        for (let j = 1; j < episodeBlocks.length; j++) {
            const epBlock = episodeBlocks[j];
            const linkMatch = epBlock.match(/<a\s+href="([^"]+)">([^<]+)<\/a>/);
            if (!linkMatch) continue;

            let href = linkMatch[1].trim();
            let title = linkMatch[2].trim();

            // Fix relative URLs
            if (href[0] === "/") href = "https://kinoger.to" + href;

            episodes.push({ title, href });
        }

        seasons.push({ season: seasonNumber, episodes });
    }

    return seasons;
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

