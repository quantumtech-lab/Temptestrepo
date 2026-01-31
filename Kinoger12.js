async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const searchUrl = `https://kinoger.to{encodedKeyword}&do=search&subaction=search`;
        
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://kinoger.to'
        };

        // Use fetchv2 for better header support and response methods
        const response = await fetchv2(searchUrl, headers);
        const html = await response.text();

        // If html is too short, we likely hit a bot wall or no results
        if (!html || html.length < 1000) return JSON.stringify([]);

        const results = [];
        
        /**
         * ROBUST REGEX:
         * This targets standard DLE search links which usually follow the pattern 
         * /stream/1234-title.html or /series/1234-title.html
         */
        const regex = /<a href="(https:\/\/kinoger\.to\/(?:stream|series)\/[^"]+\.html)">([^<]+)<\/a>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            let url = match[1];
            let title = match[2].replace(/<[^>]*>?/gm, '').trim(); // Remove highlights like <b>

            // Filter out internal system links or duplicates
            if (title.length > 1 && !title.includes("Passwort")) {
                results.push({
                    title: title,
                    image: "", // Kinoger search usually doesn't have posters in the results
                    href: url
                });
            }
        }
        
        // Final sanity check: filter duplicates
        const uniqueResults = results.filter((v, i, a) => a.findIndex(t => (t.href === v.href)) === i);
        
        return JSON.stringify(uniqueResults);
    } catch (error) {
        // Return empty stringified array so the app doesn't crash
        return JSON.stringify([]);
    }
}
