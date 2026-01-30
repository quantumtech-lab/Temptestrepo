async function searchResults(query) {
    // Try a different proxy or direct if on native
    const proxy = "https://api.allorigins.win"; 
    const targetUrl = `https://kinoger.to{encodeURIComponent(query)}&x=0&y=0&submit=submit`;

    try {
        const response = await fetchv2(proxy + encodeURIComponent(targetUrl));
        
        // Handle 502 or empty responses
        if (!response || (typeof response === 'object' && response.status === 502)) {
            console.log("Gateway Error (502). Site might be blocking the proxy.");
            return [];
        }

        const html = typeof response === 'string' ? response : response.body;
        if (!html || html.length < 100) return []; // Too short to be a valid page

        const results = [];
        const regex = /<div class="titlecontrol">.*?<a href="([^"]+)">(.*?)<\/a>/g;
        let match;
        
        while ((match = regex.exec(html)) !== null) {
            let foundUrl = match[1];
            if (!foundUrl.startsWith('http')) {
                foundUrl = `https://kinoger.to${foundUrl.startsWith('/') ? '' : '/'}${foundUrl}`;
            }

            results.push({
                title: match[2].replace(" Film", "").trim(),
                url: foundUrl,
                link: foundUrl
            });
        }
        return results;
    } catch (e) {
        console.log("Search Error: " + e.message);
        return []; 
    }
}
