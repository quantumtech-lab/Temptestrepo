async function searchResults(keyword) {
    try {
        const searchUrl = "https://kinoger.to";
        // DLE requires these specific body parameters for a successful search
        const body = `do=search&subaction=search&search_start=0&full_search=0&result_from=1&story=${encodeURIComponent(keyword)}`;

        const response = await fetch(proxyPrefix + encodeURIComponent(searchUrl), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://kinoger.to'
            },
            body: body
        });
        
        const html = await response.text();
        if (!html || html.length < 500) return JSON.stringify([]);

        const results = [];
        // Targets the standard DLE search result title container
        const regex = /<div class="sh-tit">\s*<a href="([^"]+)">([^<]+)<\/a>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const title = match[2].trim();

            if (title.length < 2 || title.includes("Passwort")) continue;

            results.push({
                title: title,
                image: "", 
                href: href.startsWith('http') ? href : `https://kinoger.to${href.startsWith('/') ? '' : '/'}${href}`
            });
        }
        
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
        
        // Extracting description from DLE 'full-text' or 'f-desc' classes
        const descMatch = html.match(/<div class="f-desc"[^>]*>([\s\S]*?)<\/div>/);
        
        return JSON.stringify([{
            description: descMatch ? descMatch[1].replace(/<[^>]*>/g, '').trim() : "Scraped from Kinoger.to",
            aliases: "Language: German",
            airdate: "N/A"
        }]);
    } catch (e) { return JSON.stringify([]); }
}

async function extractEpisodes(url) {
    return JSON.stringify([{ href: url, number: "1" }]);
}

async function extractStreamUrl(url) {
    try {
        const response = await fetch(proxyPrefix + encodeURIComponent(url));
        const html = await response.text();

        // Kinoger uses Playerjs. We target the 'file' property inside the config.
        const fileRegex = /file\s*:\s*['"]([^'"]+)['"]/;
        const match = html.match(fileRegex);
        
        if (!match) {
            // Fallback for array-based file lists
            const arrayRegex = /file\s*:\s*\[\s*\{(.*?)\}\s*\]/s;
            const arrayMatch = html.match(arrayRegex);
            if (!arrayMatch) return null;
            
            const linkMatch = arrayMatch[1].match(/https?:\/\/[^", ]+/);
            if (!linkMatch) return null;
            return linkMatch[0].replace("kinoger.ru", "voe.sx").replace("kinoger.be", "vidhide.pro");
        }

        return match[1]
            .replace("kinoger.ru", "voe.sx")
            .replace("kinoger.be", "vidhide.pro")
            .replace("kinoger.pw", "vidguard.to");
    } catch (e) { return null; }
}
