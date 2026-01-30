const proxy = "https://api.allorigins.win";

async function searchResults(keyword) {
    try {
        const searchUrl = `https://kinoger.to{encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        const response = await fetch(proxy + encodeURIComponent(searchUrl));
        // Sora's fetch handles text directly in this environment
        const html = response;

        const results = [];
        const regex = /<div class="titlecontrol">.*?<a href="([^"]+)">(.*?)<\/a>/g;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[2].replace(" Film", "").trim(),
                image: "", // Kinoger search doesn't easily provide images
                href: match[1].startsWith('http') ? match[1] : `https://kinoger.to${match[1]}`
            });
        }
        // CRITICAL: Return a stringified JSON array
        return JSON.stringify(results);
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        // We scrape the page for description/meta
        const response = await fetch(proxy + encodeURIComponent(url));
        const html = response;
        
        const descMatch = html.match(/<div class="short_text">(.*?)<\/div>/s);
        
        const results = [{
            description: descMatch ? descMatch[1].replace(/<[^>]*>/g, '') : 'No description available',
            aliases: 'Language: German',
            airdate: 'Kinoger.to'
        }];
        
        return JSON.stringify(results);
    } catch (error) {
        return JSON.stringify([{ description: 'Error loading details', aliases: '', airdate: '' }]);
    }
}

async function extractEpisodes(url) {
    try {
        // Kinoger treats movies as one "episode" usually
        const results = [{
            href: url,
            number: 1
        }];
        return JSON.stringify(results);
    } catch (error) {
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const response = await fetch(proxy + encodeURIComponent(url));
        const html = response;

        // Replicating the Cloudstream script-finding logic
        const scriptRegex = /<div id="container-video.*?<script>(.*?)<\/script>/gs;
        let match = scriptRegex.exec(html);
        if (!match) return null;

        let rawData = match[1].substring(match[1].indexOf("["), match[1].lastIndexOf("]") + 1);
        const sanitizedJson = rawData.replace(/'/g, '"');
        const linksTable = JSON.parse(sanitizedJson);
        
        // Take the first available link and fix domain masks
        let streamUrl = linksTable.flat(2)[0];
        
        if (streamUrl) {
            streamUrl = streamUrl
                .replace("kinoger.ru", "voe.sx")
                .replace("kinoger.be", "vidhide.pro")
                .replace("kinoger.pw", "vidguard.to");
        }

        return streamUrl; // Sora expects the raw URL string here, not JSON
    } catch (error) {
        return null;
    }
}
