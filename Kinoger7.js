const proxy = "https://api.allorigins.win";

async function searchResults(keyword) {
    try {
        const searchUrl = `https://kinoger.to{encodeURIComponent(keyword)}&x=0&y=0&submit=submit`;
        const response = await fetch(proxy + encodeURIComponent(searchUrl));
        const html = await response.text();

        if (!html || html.length < 500) return JSON.stringify([]);

        const results = [];
        /** 
         * IMPROVED REGEX: 
         * This looks for any link containing "/stream/" or "/series/" 
         * followed by text, which is how Kinoger structures results.
         */
        const regex = /<a href="([^"]+(?:stream|series)[^"]+)">([^<]+)<\/a>/g;
        
        let match;
        while ((match = regex.exec(html)) !== null) {
            const href = match[1];
            const title = match[2].replace(" Film", "").trim();

            // Skip common menu links that might get caught
            if (title.length < 2 || title.includes("Passwort")) continue;

            results.push({
                title: title,
                image: "", 
                href: href.startsWith('http') ? href : `https://kinoger.to${href.startsWith('/') ? '' : '/'}${href}`
            });
        }
        
        // De-duplicate results
        const uniqueResults = results.filter((v, i, a) => a.findIndex(t => (t.href === v.href)) === i);
        
        return JSON.stringify(uniqueResults);
    } catch (error) {
        return JSON.stringify([]);
    }
}

// Keep the rest of your functions (extractDetails, etc.) the same
