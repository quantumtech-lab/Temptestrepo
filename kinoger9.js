/**
 * SORA ASYNC MODULE: Kinoger.to
 * Matches Sora Documentation: fetchv2 usage and JSON stringified returns.
 */

async function searchResults(keyword) {
    try {
        // Sora docs say use fetchv2 for async mode
        const searchUrl = `https://kinoger.to{encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        };

        const response = await fetchv2(searchUrl, headers);
        const html = await response.text();

        const results = [];
        // Loose regex to find links containing /stream/ or /series/
        const regex = /<a href="([^"]+(?:stream|series)[^"]+)">([^<]+)<\/a>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const title = match[2].replace(" Film", "").trim();

            if (title.length < 2 || title.includes("Passwort")) continue;

            results.push({
                title: title,
                image: "https://kinoger.to", 
                href: href.startsWith('http') ? href : `https://kinoger.to${href.startsWith('/') ? '' : '/'}${href}`
            });
        }
        
        // Return stringified JSON as per Async Mode docs
        return JSON.stringify(results.filter((v, i, a) => a.findIndex(t => (t.href === v.href)) === i));
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    // Simple static details to ensure function is found
    const details = [{
        description: "Scraped from Kinoger.to",
        aliases: "German Language",
        airdate: "N/A"
    }];
    return JSON.stringify(details);
}

async function extractEpisodes(url) {
    // Treat movies/series links as a single playable entry for now
    return JSON.stringify([{ href: url, number: "1" }]);
}

async function extractStreamUrl(url) {
    try {
        const response = await fetchv2(url);
        const html = await response.text();
        
        // Kinoger specific stream extraction
        const scriptRegex = /container-video.*?script>(.*?)<\/script>/gs;
        const match = scriptRegex.exec(html);
        if (!match) return null;

        // Clean and parse the stream array
        const data = match[1].substring(match[1].indexOf("["), match[1].lastIndexOf("]") + 1).replace(/'/g, '"');
        const links = JSON.parse(data).flat(2);
        
        // Domain unmasking for Sora player compatibility
        return links[0]
            .replace("kinoger.ru", "voe.sx")
            .replace("kinoger.be", "vidhide.pro")
            .replace("kinoger.pw", "vidguard.to");
    } catch (e) {
        return null;
    }
}
