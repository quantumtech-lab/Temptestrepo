// Use HTTPS to avoid Mixed Content blocks on sora.jm26.net
const proxyPrefix = "https://api.allorigins.win";

async function searchResults(keyword) {
    try {
        //const searchUrl = `https://kinoger.to${encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        const searchUrl = `https://kinoger.to/index.php?story=${encodeURIComponent(keyword)}&do=search&subaction=search`;
        const response = await fetch(proxyPrefix + encodeURIComponent(searchUrl));
        const html = await response.text();

        // Safety check for empty or blocked responses
        if (!html || html.length < 500) return JSON.stringify([]);

        const results = [];
        /** 
         * LOOSE REGEX: Matches any link with "stream" or "series" in it.
         * This is much more reliable than matching specific class names.
         */
        const regex = /<a href="([^"]+(?:stream|series)[^"]+)">([^<]+)<\/a>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const title = match[2].replace(" Film", "").trim();

            // Skip tiny strings or system links
            if (title.length < 2 || title.includes("Passwort")) continue;

            results.push({
                title: title,
                image: "", // Kinoger search is text-heavy
                href: href.startsWith('http') ? href : `https://kinoger.to${href.startsWith('/') ? '' : '/'}${href}`
            });
        }
        
        // Remove duplicates and return as stringified JSON
        const finalResults = results.filter((v, i, a) => a.findIndex(t => (t.href === v.href)) === i);
        return JSON.stringify(finalResults);
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const response = await fetch(proxyPrefix + encodeURIComponent(url));
        const html = await response.text();
        const results = [{
            description: "Scraped from Kinoger.to",
            aliases: "Language: German",
            airdate: "2026"
        }];
        return JSON.stringify(results);
    } catch (e) { return JSON.stringify([]); }
}

async function extractEpisodes(url) {
    // Treat movies as single episodes
    return JSON.stringify([{ href: url, number: "1" }]);
}

async function extractStreamUrl(url) {
    try {
        const response = await fetch(proxyPrefix + encodeURIComponent(url));
        const html = await response.text();
        const scriptRegex = /container-video.*?script>(.*?)<\/script>/gs;
        const match = scriptRegex.exec(html);
        if (!match) return null;

        const data = match[1].substring(match[1].indexOf("["), match[1].lastIndexOf("]") + 1).replace(/'/g, '"');
        const links = JSON.parse(data).flat(2);
        
        // Return the first link with domain unmasking
        return links[0]
            .replace("kinoger.ru", "voe.sx")
            .replace("kinoger.be", "vidhide.pro")
            .replace("kinoger.pw", "vidguard.to");
    } catch (e) { return null; }
}
