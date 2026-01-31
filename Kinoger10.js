async function searchResults(keyword) {
    try {
        const url = "https://kinoger.to";
        
        // Kinoger expects these form-data fields for a search
        const body = {
            "do": "search",
            "subaction": "search",
            "story": keyword
        };

        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://kinoger.to'
        };

        // Use fetchv2 for .text() support and POST capability
        const response = await fetchv2(url, headers, "POST", body);
        const html = await response.text();

        if (!html) return JSON.stringify([]);

        const results = [];
        // Target the specific search result containers (usually 'short-story' or 's-item')
        const regex = /<div class="short-story">[\s\S]*?<a href="([^"]+)">(.*?)<\/a>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            results.push({
                title: match[2].replace(/<[^>]*>?/gm, '').trim(), // Clean HTML tags from title
                image: "", 
                href: match[1]
            });
        }
        
        return JSON.stringify(results);
    } catch (error) {
        return JSON.stringify([]);
    }
}
